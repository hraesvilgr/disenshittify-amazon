// Disenshittify Amazon — content script for search results pages.
// Adds a toggle above the left-hand filters. When on, every result card is scored,
// tinted green → yellow → red by trust, and the results are re-sorted most-trusted first.
// Each card's badge lets you trust or block its brand; brands are also learned across searches.

(function () {
  "use strict";

  const ext = globalThis.browser || globalThis.chrome;
  const CFG = globalThis.DSA_CONFIG;
  const BRANDS = globalThis.DSA_BRANDS;
  const BIGRAMS = globalThis.DSA_BIGRAMS;
  const SCORER = globalThis.DSA_SCORER;
  const MEMORY = globalThis.DSA_MEMORY;
  const PRODUCT = globalThis.DSA_PRODUCT;
  const CARD_SEL = 'div[data-component-type="s-search-result"]';
  const KEY_ENABLED = "dsaEnabled";
  const KEY_SORT = "dsaSort";                 // "trust" | "unit" | null (Amazon's own sort)
  const KEY_FEATURED_FOR = "dsaFeaturedFor";  // search where you picked Amazon's raw "Featured"
  const KEY_OLD_UNIT_SORT = "dsaUnitSort";    // v0.4.x
  const KEY_LISTINGS = "dsaListings";
  const KEY_LAST_CLICK = "dsaLastClick";      // the search result you last clicked through: {a: ASIN, at}         // per-ASIN: search-results estimate + product-page check
  const LISTINGS_MAX = 300;                   // most recently seen listings kept
  const CHECK_TTL = 30 * 864e5;               // product-page checks are reused for 30 days
  const KEY_MEMORY = "dsaMemory";

  let enabled = false;
  let lastClick = null;     // { a: ASIN, at } — the search result last clicked through
  let listings = {};        // ASIN → { s, t, r: [[pts, text, tag]], q, at, p?: { s, t, at, ch: [[pts, text]] } }
  let lastResults = null;   // last scoring, for refreshing the status line
  let lastPromoCount = 0;
  let sortChoice = null;    // "trust" | "unit" chosen in the Sort by menu (kept across searches), or null
  let featuredFor = "";     // you picked Amazon's "Featured" for this search term
  let memory = MEMORY.emptyMemory();
  let learned = {};
  let snapshot = null;      // { order: Map(container → children), cards: Set } — for restoring
  let applying = false;
  let reopenAsin = null;    // keep a badge open after a vote re-renders the page
  let panelOpen = false;
  let resetArmed = false;

  // ---------- storage ----------
  // Extension storage as an add-on; Tampermonkey/Violentmonkey storage as a userscript;
  // localStorage as a last resort. Values are stored as plain JSON-able objects.

  const hasExtStorage = !!(ext && ext.storage && ext.storage.local);
  const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";

  async function storeGet(key, fallback) {
    try {
      if (hasExtStorage) {
        const r = await ext.storage.local.get(key);
        return r && key in r ? r[key] : fallback;
      }
      if (hasGM) {
        // Private script storage only; amazon.com's own localStorage is never read or written here.
        const v = await GM_getValue(key, undefined);
        return v === undefined ? fallback : v;
      }
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      if (raw === "1" || raw === "0") return raw === "1";   // older versions stored the toggle this way
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function storeSet(key, value) {
    try {
      if (hasExtStorage) return ext.storage.local.set({ [key]: value });
      if (hasGM) return GM_setValue(key, value);
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full or blocked — carry on without saving */ }
  }

  function saveMemory() {
    storeSet(KEY_MEMORY, memory);
  }

  function refreshLearned() {
    learned = MEMORY.learnedBrands(memory, CFG.learning);
  }

  function scoringConfig() {
    return Object.assign({}, CFG, {
      knownBrands: BRANDS.known,
      ambiguousBrands: BRANDS.ambiguous || [],
      blockedBrands: BRANDS.blocked,
      userBrands: memory.votes,
      learnedBrands: learned
    });
  }

  function currentQuery() {
    try { return new URLSearchParams(location.search).get("k") || ""; } catch (e) { return ""; }
  }

  // ---------- scraping ----------

  function text(el) { return el ? (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim() : ""; }

  // Amazon writes the unit price as "(" <price, printed twice: hidden + visible> "/count)", so the
  // card's plain text reads "($0.13$0.13/count)". Rebuild it from the hidden price and what follows.
  function scrapeUnitPrice(card) {
    for (const p of card.querySelectorAll(".a-price.a-text-price")) {
      const parent = p.parentElement;
      if (!parent) continue;
      let after = "", seen = false;
      for (const n of parent.childNodes) {
        if (n === p) { seen = true; continue; }
        if (seen) after += n.textContent;
      }
      after = after.replace(/\s+/g, " ").trim();
      if (!after.startsWith("/")) continue;
      const amount = (p.querySelector(".a-offscreen") || p).textContent.trim();
      const parsed = SCORER.parseUnitPrice("(" + amount + after + (after.endsWith(")") ? "" : ")"));
      if (parsed) return parsed;
    }
    return null;
  }

  function scrapeCard(card) {
    const recipe = card.querySelector('[data-cy="title-recipe"]');
    // Fashion layouts put the brand in its own small <h2> above the title; the title is the longest one.
    const h2 = [...(recipe || card).querySelectorAll("h2")]
      .sort((a, b) => (b.getAttribute("aria-label") || text(b)).length - (a.getAttribute("aria-label") || text(a)).length)[0] ||
      card.querySelector("h2");
    let brandLine = "";
    // The product title is the <h2>. Amazon sometimes adds a grey subtitle line under it inside the
    // same block ("Vinyl Record Player, Fully Automatic…"); that isn't part of the title.
    let title = (h2 && (h2.getAttribute("aria-label") || text(h2))) || text(recipe);

    // Some categories show the brand on its own line above the product name.
    if (recipe && h2) {
      const brandEl = [...recipe.querySelectorAll(".a-size-base-plus.a-color-base, .a-size-mini")]
        .find(el => !h2.contains(el) && !el.contains(h2) && text(el).length > 0 && text(el).length < 40);
      if (brandEl && !/^sponsored$/i.test(text(brandEl))) {
        brandLine = text(brandEl);
        if (title.startsWith(brandLine + " ")) title = title.slice(brandLine.length).trim();
      }
    }

    const sponsored = !!card.querySelector(
      '.puis-sponsored-label-text, .s-sponsored-label-text, [data-component-type="sp-sponsored-result"], ' +
      'a[aria-label*="Sponsored" i]') || /^sponsored\b/i.test(title);

    const reviewsBlock = card.querySelector('[data-cy="reviews-block"]');
    const reviews = text(reviewsBlock);

    // Exact review count from the ratings link label ("1,523 ratings"), when present.
    let reviewCount, reviewExact;
    const countEl = card.querySelector('[aria-label$="ratings" i], [aria-label$="rating" i]');
    const cm = countEl && /([\d,]+)\s+ratings?/i.exec(countEl.getAttribute("aria-label"));
    if (cm) { reviewCount = parseInt(cm[1].replace(/,/g, ""), 10); reviewExact = true; }

    const priceEl = card.querySelector('.a-price:not([data-a-strike="true"]) .a-offscreen');
    const unitPrice = scrapeUnitPrice(card);
    const img = card.querySelector("img.s-image");
    const ratingEl = card.querySelector(".a-icon-alt");

    return {
      asin: card.dataset.asin,
      title,
      brandLine,
      sponsored,
      rating: text(ratingEl),
      reviews,
      reviewCount,
      reviewExact,
      price: text(priceEl),
      unitPrice,
      img: img ? img.currentSrc || img.src : ""
    };
  }

  // ---------- small DOM helper ----------

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === "class") node.className = v;
        else if (k === "on") for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
        else if (k === "data") Object.assign(node.dataset, v);
        else node.setAttribute(k, v);
      }
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  }

  function button(label, cls, onClick) {
    return el("button", {
      type: "button",
      class: "dsa-btn " + (cls || ""),
      on: {
        click: e => { e.preventDefault(); e.stopPropagation(); onClick(); }
      }
    }, label);
  }

  // ---------- votes ----------

  function vote(key, name, choice) {
    memory = MEMORY.setVote(memory, key, name, choice);
    refreshLearned();
    storeSet(KEY_MEMORY, memory);
    if (enabled) apply();
    renderPanel();
  }

  function forgetBrand(key) {
    memory = MEMORY.forget(memory, key);
    refreshLearned();
    storeSet(KEY_MEMORY, memory);
    if (enabled) apply();
    renderPanel();
  }

  // ---------- decoration ----------

  function colorsFor(score) {
    const hue = Math.round(Math.max(0, Math.min(100, score)) * 1.2); // 0 red → 60 yellow → 120 green
    return { bg: `hsl(${hue} 78% 91%)`, edge: `hsl(${hue} 70% 40%)`, ink: `hsl(${hue} 60% 22%)` };
  }

  function paintTarget(card) {
    return card.querySelector(".s-card-container, .puis-card-container") || card;
  }

  function brandRow(result) {
    const b = result.brand || {};
    if (!b.key) return el("div", { class: "dsa-brandrow dsa-muted" }, "No brand to rate on this listing.");
    const current = memory.votes[b.key];
    const row = el("div", { class: "dsa-brandrow" },
      el("span", { class: "dsa-brandname" }, b.name));
    row.append(
      button(current === "trust" ? "Trusted ✓" : "Trust", current === "trust" ? "dsa-on dsa-trust" : "dsa-trust",
        () => { reopenAsin = result.asin; vote(b.key, b.name, current === "trust" ? null : "trust"); }),
      button(current === "block" ? "Blocked ✓" : "Block", current === "block" ? "dsa-on dsa-block" : "dsa-block",
        () => { reopenAsin = result.asin; vote(b.key, b.name, current === "block" ? null : "block"); })
    );
    return row;
  }

  function decorate(card, result) {
    const c = colorsFor(result.score);
    card.dataset.dsaScored = "1";
    card.dataset.dsaTier = result.tier;
    card.classList.add("dsa-rated");
    const target = paintTarget(card);
    target.classList.add("dsa-paint");
    for (const node of [card, target]) {
      node.style.setProperty("--dsa-bg", c.bg);
      node.style.setProperty("--dsa-edge", c.edge);
      node.style.setProperty("--dsa-ink", c.ink);
    }

    const up = result.listing && result.listing.unitPrice;
    if (up) card.dataset.dsaUnit = up.label; else delete card.dataset.dsaUnit;

    const badge = el("details", { class: "dsa-badge" },
      el("summary", null, `Trust ${result.tier}/5`, el("span", { class: "dsa-score" }, ` · ${result.score}`),
        result.checked ? el("span", { class: "dsa-checked", title: "Checked on its product page" }, " ✓") : null));
    // The pop-over (reasons, unit price, Trust/Block) is only built when the badge is first opened,
    // so a page of 50 closed badges costs a few dozen elements instead of ~2,000.
    let built = false;
    const build = () => {
      if (built) return;
      built = true;
      const body = el("div", { class: "dsa-badge-body" });
      const ul = el("ul");
      for (const r of result.reasons) {
        ul.append(el("li", { class: r.pts > 0 ? "dsa-good" : "dsa-bad" },
          `${r.pts > 0 ? "+" : "−"}${Math.abs(r.pts)}  ${r.text}`));
      }
      if (up) body.append(el("div", { class: "dsa-unit dsa-muted" }, "Unit price: " + up.label));
      body.append(ul, brandRow(result));
      badge.append(body);
    };
    if (reopenAsin && reopenAsin === result.asin) { build(); badge.open = true; }
    // Keep clicks on the badge from reaching the product link; only one badge open at a time.
    badge.addEventListener("click", e => { e.stopPropagation(); build(); });
    badge.addEventListener("toggle", () => {
      if (!badge.open) return;
      build();
      document.querySelectorAll(".dsa-badge[open]").forEach(b => { if (b !== badge) b.open = false; });
    });
    // On the card itself, not the inner container: Amazon clips overflow there, which would cut off the popover.
    card.appendChild(badge);
    // List layout (one wide row per product): keep the title clear of the corner pill.
    card.classList.toggle("dsa-wide", card.getBoundingClientRect().width > 600);
  }

  function undecorate(card) {
    delete card.dataset.dsaScored;
    delete card.dataset.dsaTier;
    delete card.dataset.dsaUnit;
    card.classList.remove("dsa-rated", "dsa-dupe", "dsa-wide");
    card.querySelectorAll(".dsa-badge").forEach(b => b.remove());
    card.querySelectorAll(".dsa-paint").forEach(t => t.classList.remove("dsa-paint"));
    if (card.classList.contains("dsa-paint")) card.classList.remove("dsa-paint");
  }

  // ---------- search-results estimates and product-page checks ----------

  // Keep each listing's search-results estimate so its product page can show what changed.
  function rememberEstimates(results) {
    const now = Date.now();
    const q = currentQuery();
    for (const r of results.values()) {
      if (!r.asin || r.listing.sponsored && listings[r.asin]) continue;
      const prev = listings[r.asin] || {};
      listings[r.asin] = Object.assign(prev, {
        s: r.score, t: r.tier, q, at: now,
        r: r.reasons.map(x => [x.pts, x.text, x.tag || ""])
      });
    }
    pruneListings();
    storeSet(KEY_LISTINGS, listings);
  }

  function pruneListings() {
    const keys = Object.keys(listings);
    if (keys.length <= LISTINGS_MAX) return;
    keys.sort((a, b) => (listings[b].at || 0) - (listings[a].at || 0));
    for (const k of keys.slice(LISTINGS_MAX)) delete listings[k];
  }

  // A listing checked on its product page carries that result back to the search results, as the
  // difference it made (so your later votes and learning still apply on top).
  function applyProductChecks(results) {
    const now = Date.now();
    for (const r of results.values()) {
      const rec = listings[r.asin];
      if (!rec || !rec.p || now - rec.p.at > CHECK_TTL) continue;
      const delta = rec.p.s - rec.p.base;
      r.reasons.push({ pts: delta, text: delta ? `Checked on its product page (${delta > 0 ? "+" : "−"}${Math.abs(delta)})` : "Checked on its product page (no change)", tag: "checked" });
      r.score = Math.max(0, Math.min(100, r.score + delta));
      const t = CFG.tiers;
      r.tier = r.score >= t[0] ? 5 : r.score >= t[1] ? 4 : r.score >= t[2] ? 3 : r.score >= t[3] ? 2 : 1;
      r.checked = true;
      r.reasons.sort((a, b) => a.pts - b.pts);
    }
  }

  // ---------- product pages ----------

  function productPanel(refined, product) {
    const c = colorsFor(refined.score);
    const init = refined.initial;
    // What the product page added up to, before the 0–100 limits. If the score was already pinned at
    // 0 or 100, say so instead of claiming "no change".
    const delta = refined.changes.reduce((a, x) => a + x.pts, 0);
    const pinned = delta && refined.baseScore != null && refined.score === refined.baseScore ? (refined.score === 0 ? " — already at the bottom of the scale" : " — already at the top of the scale") : "";
    const panel = el("div", { id: "dsa-product", class: "dsa-product" });
    panel.style.setProperty("--dsa-bg", c.bg);
    panel.style.setProperty("--dsa-edge", c.edge);
    panel.style.setProperty("--dsa-ink", c.ink);

    // The change in score from the estimate this page started from: the search-results rating, or,
    // for a page opened directly, the rating from its title, stars and review count alone.
    const from = refined.baseScore != null ? refined.baseScore : refined.score;
    const moved = refined.score - from;
    const cls = moved > 0 ? "dsa-up" : moved < 0 ? "dsa-down" : "dsa-same";
    const deltaText = moved > 0 ? `▲${moved}` : moved < 0 ? `▼${Math.abs(moved)}` : "–";
    const deltaTip = (init ? "Change from the search-results estimate" : "Change from the estimate from the title, stars and reviews alone") +
      ` (${from} → ${refined.score})`;
    const head = el("div", { class: "dsa-ph-head" },
      el("span", { class: "dsa-ph-pill" }, `Trust ${refined.tier}/5`, el("span", { class: "dsa-score" }, ` · ${refined.score}`)),
      el("span", { class: "dsa-ph-delta " + cls, title: deltaTip }, deltaText),
      el("span", { class: "dsa-ph-title" }, "Disenshittify"));
    let compare;
    if (!init) {
      compare = el("div", { class: "dsa-ph-compare" }, "Not in your recent search results — rated from this page.",
        pinned ? el("span", { class: "dsa-muted" }, pinned) : null);
    } else {
      compare = el("div", { class: "dsa-ph-compare" },
        refined.variantOf ? "Search results (another size/colour): " : "Search results: ", el("b", null, `${init.tier}/5 · ${init.score}`),
        "  →  this page: ", el("b", null, `${refined.tier}/5 · ${refined.score}`),
        pinned ? el("span", { class: "dsa-muted" }, pinned) : null,
        init.tier !== refined.tier ? el("span", { class: "dsa-muted" }, `  (tier ${init.tier} → ${refined.tier})`) : null);
    }

    const details = el("details", { class: "dsa-ph-details" }, el("summary", null, "What the product page showed"));
    const ch = el("ul", { class: "dsa-ph-list" });
    for (const x of refined.changes) {
      ch.append(el("li", { class: x.pts > 0 ? "dsa-good" : x.pts < 0 ? "dsa-bad" : "dsa-muted" },
        `${x.pts > 0 ? "+" + x.pts : x.pts < 0 ? "−" + Math.abs(x.pts) : "±0"}  ${x.text}`));
    }
    if (!refined.changes.length) ch.append(el("li", { class: "dsa-muted" }, "Nothing here changes the estimate."));
    const all = el("ul", { class: "dsa-ph-list" });
    for (const x of refined.reasons) {
      if (!x.pts) continue;
      all.append(el("li", { class: x.pts > 0 ? "dsa-good" : "dsa-bad" }, `${x.pts > 0 ? "+" : "−"}${Math.abs(x.pts)}  ${x.text}`));
    }
    details.append(ch, el("div", { class: "dsa-phead" }, "All reasons"), all);

    const key = product.brand ? SCORER.brandKey(product.brand) : null;
    if (key) {
      const current = memory.votes[key];
      details.append(el("div", { class: "dsa-brandrow" },
        el("span", { class: "dsa-brandname" }, product.brand),
        button(current === "trust" ? "Trusted ✓" : "Trust", current === "trust" ? "dsa-on dsa-trust" : "dsa-trust",
          () => { memory = MEMORY.setVote(memory, key, product.brand, current === "trust" ? null : "trust"); refreshLearned(); storeSet(KEY_MEMORY, memory); runProductPage(true); }),
        button(current === "block" ? "Blocked ✓" : "Block", current === "block" ? "dsa-on dsa-block" : "dsa-block",
          () => { memory = MEMORY.setVote(memory, key, product.brand, current === "block" ? null : "block"); refreshLearned(); storeSet(KEY_MEMORY, memory); runProductPage(true); })));
    }
    panel.append(head, compare, details);
    return panel;
  }

  // Which search-results estimate this page belongs to. The page's own ASIN often isn't the one you
  // clicked: Amazon opens the size or colour you picked last time, or you switch variants here. So also
  // try the page's other variants (the size/colour swatches) and the result you last clicked.
  function findInitial(asin) {
    const tries = [asin];
    for (const e of document.querySelectorAll('[id*="twister" i] [data-asin], [id*="twister" i] [data-defaultasin], [id*="twister" i] [data-csa-c-item-id]')) {
      const a = e.getAttribute("data-asin") || e.getAttribute("data-defaultasin") || e.getAttribute("data-csa-c-item-id") || "";
      if (/^[A-Z0-9]{10}$/.test(a) && !tries.includes(a)) tries.push(a);
    }
    const fromSearch = /\/s(\?|$)|[?&]k=/.test((() => { try { return new URL(document.referrer).pathname + new URL(document.referrer).search; } catch (e) { return ""; } })());
    if (lastClick && lastClick.a && Date.now() - lastClick.at < 30 * 60e3 && (fromSearch || tries.includes(lastClick.a)) && !tries.includes(lastClick.a)) tries.push(lastClick.a);
    // A record for this exact ASIN wins; otherwise the most recently seen variant.
    let best = null;
    for (const a of tries) {
      const rec = listings[a];
      if (!rec || !rec.r) continue;
      if (a === asin) return { asin: a, rec };
      if (!best || rec.at > best.rec.at) best = { asin: a, rec };
    }
    return best;
  }

  function runProductPage(reopen) {
    const old = document.getElementById("dsa-product");
    if (!enabled) { if (old) old.remove(); return; }
    const anchor = document.querySelector("#titleSection, #title_feature_div, #title");
    if (!anchor || !document.querySelector("#productTitle")) return;
    if (PRODUCT.isMediaPage(document)) { if (old) old.remove(); return; }   // books, films, TV, music, games
    try {
      const product = PRODUCT.extractProduct(document);
      const urlAsin = (/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/.exec(location.pathname) || [])[1];
      if (!product.asin) product.asin = urlAsin;
      const found = findInitial(product.asin);
      const rec = found && found.rec;
      const initial = rec ? { score: rec.s, tier: rec.t, reasons: rec.r.map(([pts, text, tag]) => ({ pts, text, tag: tag || undefined })) } : null;
      const refined = PRODUCT.refineScore(initial, product, scoringConfig(), BIGRAMS, SCORER);
      refined.variantOf = found && found.asin !== product.asin ? found.asin : null;
      // Remember the check for the search results, under this ASIN and the one the estimate came from.
      const check = { s: refined.score, t: refined.tier, base: refined.baseScore != null ? refined.baseScore : refined.score, at: Date.now(),
                      ch: refined.changes.map(x => [x.pts, x.text]) };
      listings[product.asin] = Object.assign(listings[product.asin] || { q: rec ? rec.q : "", at: Date.now() }, { p: check });
      if (found && found.asin !== product.asin) listings[found.asin].p = check;
      pruneListings();
      storeSet(KEY_LISTINGS, listings);

      const panel = productPanel(refined, product);
      if (reopen) panel.querySelector(".dsa-ph-details").open = true;
      if (old) old.replaceWith(panel); else anchor.insertAdjacentElement("afterend", panel);
    } catch (e) {
      // Never fail silently: say so on the page, with the error, so it can be reported.
      console.error("[Disenshittify] product page:", e);
      const panel = el("div", { id: "dsa-product", class: "dsa-product dsa-product-error" },
        el("div", { class: "dsa-ph-head" }, el("span", { class: "dsa-ph-title" }, "Disenshittify")),
        el("div", { class: "dsa-ph-compare" }, "Couldn't rate this page: " + (e && e.message || e)));
      if (old) old.replaceWith(panel); else anchor.insertAdjacentElement("afterend", panel);
    }
  }

  // ---------- promos and ad blocks ----------
  // Amazon fills the results grid with full-width blocks that aren't results: sponsored brand
  // banners and videos, "Explore the collection", Amazon Haul's "Crazy-good finds", "Brands related
  // to your search", stray "Sponsored Ad" boxes… Rather than chase each one, everything in the
  // results grid is hidden except product cards, section headings, the "Narrow your search"
  // filters, pagination and help.

  function isKeeper(node) {
    if (node.nodeType !== 1) return true;
    if (/^(SCRIPT|LINK|STYLE|TEMPLATE|NOSCRIPT)$/.test(node.tagName)) return true;
    if (node.matches(CARD_SEL)) return true;
    const KEEP = '[data-component-type="s-messaging-widget-results-header"], [data-component-type="s-pagination"], ' +
                 '[data-component-type="s-result-info-bar"], .s-pagination-strip, .s-pagination-container';
    if (node.matches(KEEP) || node.querySelector(KEEP)) return true;
    if (node.id === "dsa-toggle") return true;
    const head = (node.innerText || node.textContent || "").trim().slice(0, 40);
    if (/^(Results|More results|Narrow your search|Need help\?|Previous\b)/i.test(head)) return true;
    // Empty spacers: leave them; hiding them changes nothing.
    if (!head && !node.querySelector("img, video, iframe")) return true;
    return false;
  }

  // Promo blocks are removed from the page outright (not just hidden), after stopping any video and
  // unloading any embedded frame, so their images, video and ad frames can be freed. Nothing keeps a
  // reference to them; they come back on the next page load.
  let promosRemoved = 0;

  function unloadMedia(node) {
    for (const v of node.querySelectorAll("video, audio")) {
      try { v.pause(); v.removeAttribute("src"); v.srcObject = null; v.load(); } catch (e) { /* ignore */ }
    }
    for (const f of node.querySelectorAll("iframe")) {
      try { f.src = "about:blank"; } catch (e) { /* ignore */ }
    }
  }

  function removeClutter() {
    const slots = new Set([...document.querySelectorAll(".s-main-slot")]);
    for (const c of cards()) if (c.parentElement) slots.add(c.parentElement);
    const gone = new Set();
    for (const slot of slots) {
      for (const node of [...slot.children]) {
        if (isKeeper(node)) continue;
        unloadMedia(node);
        node.remove();
        gone.add(node);
        promosRemoved++;
      }
    }
    // Drop our own references to them too (the saved original order), so they can be freed.
    if (gone.size && snapshot) {
      for (const [parent, children] of snapshot.order) snapshot.order.set(parent, children.filter(n => !gone.has(n)));
    }
    return promosRemoved;
  }

  // ---------- apply / restore ----------

  function cards() { return [...document.querySelectorAll(CARD_SEL)].filter(c => c.dataset.asin); }

  // Books, films, TV, music and games aren't rated. A search where nearly everything (80%+) is
  // media gets no Disenshittify at all; on mixed pages the media results are just left alone.
  function isMedia(card) {
    if (card.dataset.dsaMedia === undefined) card.dataset.dsaMedia = PRODUCT.isMediaCard(card) ? "1" : "";
    return card.dataset.dsaMedia === "1";
  }
  function isMediaSearch() {
    const list = cards();
    return list.length > 0 && list.filter(isMedia).length >= list.length * 0.8;
  }

  function apply() {
    const list = cards();
    if (!list.length) return;
    applying = true;
    try {
      list.forEach(undecorate);

      // Amazon can split results across several containers; the main slot receives the sorted list.
      const slot = document.querySelector(".s-main-slot") || list[0].parentElement;
      const parents = new Set(list.map(c => c.parentElement).concat(slot));
      // Snapshot the original order of every container involved, unless we already hold one for these cards.
      if (!snapshot || list.some(c => !snapshot.cards.has(c))) {
        snapshot = { order: new Map([...parents].map(p => [p, [...p.children]])), cards: new Set(list) };
      }

      const media = list.filter(isMedia);
      const rated = list.filter(c => !isMedia(c));
      const raws = rated.map(scrapeCard);
      const results = SCORER.scorePage(raws, scoringConfig(), BIGRAMS);
      rememberEstimates(results);
      applyProductChecks(results);

      // Learn from this page (uses brand-free evidence, so it can't reinforce itself).
      memory = MEMORY.recordPage(memory, results, currentQuery(), CFG.learning);
      refreshLearned();
      saveMemory();

      // Decorate every card, and hide repeat placements of the same product
      // (keeping the organic copy over the sponsored one).
      const keep = new Map();
      rated.forEach((card, i) => {
        const r = results.get(i);
        decorate(card, r);
        const prev = keep.get(r.asin);
        if (!prev) keep.set(r.asin, { card, sponsored: r.listing.sponsored });
        else if (prev.sponsored && !r.listing.sponsored) {
          prev.card.classList.add("dsa-dupe");
          keep.set(r.asin, { card, sponsored: false });
        } else {
          card.classList.add("dsa-dupe");
        }
      });

      // Order: price per unit when that switch is on; otherwise by trust, but only on Amazon's
      // default order — a sort you picked on Amazon is left alone (colours and badges stay either way).
      restoreOrder();
      const mode = currentMode();
      if (mode !== "amazon") {
        const sorted = mode === "unit"
          ? unitOrder(rated, raws, results)
          : rated.map((card, i) => ({ card, i, score: results.get(i).score })).sort((a, b) => b.score - a.score || a.i - b.i);
        // Unrated media (games, books, films) keep the places Amazon gave them — a search for a game
        // keeps the game on top; the rated listings are sorted around them.
        const order = [];
        let next = 0;
        for (const card of cards()) {
          if (media.includes(card)) order.push({ card });
          else if (next < sorted.length) order.push(sorted[next++]);
        }
        while (next < sorted.length) order.push(sorted[next++]);
        const firstResult = [...slot.children].find(node => node.matches(CARD_SEL));
        const anchor = document.createComment("dsa-sorted");
        slot.insertBefore(anchor, firstResult);
        for (const { card } of order) slot.insertBefore(card, anchor);
        anchor.remove();
      }
      // Once everything is one re-sorted list, a "More results" heading would sit stranded at the end.
      for (const node of slot.children) {
        if (/^More results/i.test((node.innerText || node.textContent || "").trim())) node.classList.toggle("dsa-stray-head", mode !== "amazon");
      }

      const hidden = CFG.hideClutter === false ? 0 : removeClutter();
      lastResults = results;
      lastPromoCount = promosRemoved;
      updateStatus(results, mode, hidden);
    } finally {
      applying = false;
      reopenAsin = null;
    }
  }

  // Put every result back where Amazon had it (without touching colours or badges).
  function restoreOrder() {
    if (!snapshot) return;
    for (const [parent, children] of snapshot.order) {
      if (!parent.isConnected) continue;
      for (const node of children) if (node.isConnected || snapshot.cards.has(node)) parent.appendChild(node);
    }
  }

  // Price-per-unit order. Listings priced in the page's most common unit come first (cheapest per
  // unit first), then other units, each group cheapest first; listings with no unit price go last,
  // in Amazon's order. Equal unit prices fall back to trust.
  function unitOrder(list, raws, results) {
    const groups = new Map();
    raws.forEach(r => { if (r.unitPrice) groups.set(r.unitPrice.unit, (groups.get(r.unitPrice.unit) || 0) + 1); });
    const rank = new Map([...groups.entries()].sort((a, b) => b[1] - a[1]).map(([u], i) => [u, i]));
    return list
      .map((card, i) => ({ card, i, u: raws[i].unitPrice, score: results.get(i).score }))
      .sort((a, b) => {
        if (!a.u || !b.u) return (a.u ? 0 : 1) - (b.u ? 0 : 1) || a.i - b.i;
        return rank.get(a.u.unit) - rank.get(b.u.unit) || a.u.value - b.u.value || b.score - a.score || a.i - b.i;
      });
  }

  function restore() {
    applying = true;
    try {
      cards().forEach(undecorate);
      document.querySelectorAll(".dsa-stray-head").forEach(n => n.classList.remove("dsa-stray-head"));
      if (snapshot) {
        for (const [parent, children] of snapshot.order) {
          if (!parent.isConnected) continue;
          for (const node of children) if (node.isConnected || snapshot.cards.has(node)) parent.appendChild(node);
        }
      }
      snapshot = null;
      lastResults = null;
      updateStatus(null);
    } finally {
      applying = false;
    }
  }

  // ---------- Disenshittified entries in Amazon's Sort by menu ----------
  // Amazon's menu is a hidden <select id="s-result-sort-select"> whose options Amazon copies into
  // the visible pop-up list each time it opens, so adding <option>s puts entries in the menu.
  // Picking one is caught before Amazon navigates; it re-orders the results already on the page.
  //
  //   Disenshittified: Trust   — most trusted first. Also what a fresh search shows by default.
  //   Disenshittified: $/count — cheapest per unit first.
  //   Amazon's own sorts       — Amazon's order, with colours and badges. Picking "Featured" shows
  //                              Amazon's real Featured order for that search.
  // A Disenshittified choice stays until you pick one of Amazon's sorts.
  const SORTS = { trust: { value: "dsa-trust", label: "Disenshittified: Trust" },
                  unit:  { value: "dsa-unit",  label: "Disenshittified: $/count" } };
  const OUR_VALUES = new Set(Object.values(SORTS).map(x => x.value));

  function sortSelect() { return document.getElementById("s-result-sort-select"); }

  // Amazon's sort for this page, from the URL ("" = none given, i.e. Featured).
  function urlSort() {
    try { return new URLSearchParams(location.search).get("s") || ""; } catch (e) { return ""; }
  }
  function isFeatured(value) { return !value || /^(relevanceblender|relevance-rank|featured-rank)$/i.test(value); }

  function currentMode() {
    if (sortChoice === "unit") return "unit";
    if (sortChoice === "trust") return "trust";
    if (!isFeatured(urlSort())) return "amazon";
    return featuredFor && featuredFor === currentQuery().toLowerCase() ? "amazon" : "trust";
  }

  function amazonSortValue(sel) {
    if (!sel.dataset.dsaAmazon) {
      const chosen = [...sel.options].find(o => o.defaultSelected && !OUR_VALUES.has(o.value)) || sel.options[0];
      sel.dataset.dsaAmazon = chosen ? chosen.value : "";
    }
    return sel.dataset.dsaAmazon;
  }

  function setPrompt(sel, label) {
    const prompt = sel.parentElement && sel.parentElement.querySelector(".a-dropdown-prompt");
    if (prompt) prompt.textContent = label;
  }

  // Add our entries (once) and make the menu show the order that's actually on screen.
  function installSortOption() {
    const sel = sortSelect();
    if (!sel) return;
    const amazonValue = amazonSortValue(sel);
    for (const key of ["trust", "unit"]) {
      if (![...sel.options].some(o => o.value === SORTS[key].value)) {
        const opt = document.createElement("option");
        opt.value = SORTS[key].value;
        opt.textContent = SORTS[key].label;
        sel.appendChild(opt);
      }
    }
    const mode = currentMode();
    if (mode === "amazon") {
      if (OUR_VALUES.has(sel.value)) sel.value = amazonValue;
      setPrompt(sel, (sel.selectedOptions[0] || {}).textContent || "");
    } else {
      sel.value = SORTS[mode].value;
      setPrompt(sel, SORTS[mode].label);
    }
  }

  function removeSortOption() {
    const sel = sortSelect();
    if (!sel) return;
    if (OUR_VALUES.has(sel.value)) sel.value = amazonSortValue(sel);
    setPrompt(sel, (sel.selectedOptions[0] || {}).textContent || "");
    [...sel.options].filter(o => OUR_VALUES.has(o.value)).forEach(o => o.remove());
  }

  function closeSortMenu(from) {
    (from || document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, which: 27, bubbles: true }));
  }

  function setSortChoice(choice) {
    sortChoice = choice;
    storeSet(KEY_SORT, choice);
  }
  function setFeaturedFor(query) {
    featuredFor = query;
    storeSet(KEY_FEATURED_FOR, query);
  }

  // The value of an entry in Amazon's pop-up list: data-value='{"stringVal":"review-rank"}'.
  function entryValue(a) {
    try { return JSON.parse(a.getAttribute("data-value") || "{}").stringVal || null; } catch (e) { return null; }
  }

  function chooseSort(value, label) {
    const sel = sortSelect();
    const q = currentQuery().toLowerCase();
    const ours = Object.keys(SORTS).find(k => SORTS[k].value === value || SORTS[k].label === label);
    if (ours) {
      setSortChoice(ours);
      setFeaturedFor("");
      return true;                                   // handled here, no page load
    }
    // One of Amazon's sorts: hand over to Amazon.
    setSortChoice(null);
    if (isFeatured(value)) setFeaturedFor(q);
    // If it's the sort this page already has, Amazon won't reload, so update in place.
    return !!sel && value === amazonSortValue(sel);
  }

  function onSortEntry(e) {
    if (!enabled) return;
    const a = e.target.closest && e.target.closest('a[id^="s-result-sort-select_"], .a-dropdown-link');
    if (!a || !a.closest(".a-popover, .a-dropdown-common, [role=listbox]")) return;
    const sel = sortSelect();
    if (!sel) return;
    const label = a.textContent.trim();
    const value = entryValue(a) || ([...sel.options].find(o => o.textContent.trim() === label) || {}).value;
    if (chooseSort(value, label)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeSortMenu(a);
      installSortOption();
      apply();
    }
  }

  document.addEventListener("click", onSortEntry, true);
  document.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") onSortEntry(e); }, true);
  // Keyboard / native-select changes: keep Amazon from navigating to our entries.
  document.addEventListener("change", e => {
    if (!enabled || e.target !== sortSelect()) return;
    const sel = e.target;
    const value = sel.value;
    if (OUR_VALUES.has(value) || value === amazonSortValue(sel)) {
      e.stopImmediatePropagation();
      chooseSort(value, "");
      installSortOption();
      apply();
    } else {
      chooseSort(value, "");
    }
  }, true);

  // ---------- toggle + brand manager ----------

  function brandCounts() {
    const yours = Object.keys(memory.votes).length;
    const learnedKeys = Object.keys(learned).filter(k => !memory.votes[k]);
    return { yours, learned: learnedKeys.length };
  }

  function updateStatus(results, mode, hidden) {
    const status = document.querySelector("#dsa-toggle .dsa-status");
    if (!status) return;
    if (!results) {
      status.textContent = promosRemoved ? "Off · reload to bring back the hidden promos" : "Off";
    }
    else {
      // Count what's actually on screen (hidden repeat placements don't count).
      const visible = cards().filter(c => c.dataset.dsaScored && !c.classList.contains("dsa-dupe"));
      const tiers = [0, 0, 0, 0, 0, 0];
      for (const c of visible) tiers[+c.dataset.dsaTier]++;
      const extras = [];
      const media = cards().filter(c => c.dataset.dsaMedia === "1").length;
      if (media) extras.push(`${media} book${media === 1 ? "" : "s"}/media not rated`);
      if (hidden) extras.push(`${hidden} promo${hidden === 1 ? "" : "s"} removed`);
      if (mode === "amazon") extras.push("Amazon's order");
      if (mode === "unit") extras.push("ordered by $/count");
      status.textContent = `${visible.length} rated · ${tiers[5] + tiers[4]} trusted · ${tiers[1]} junk` +
        (extras.length ? " · " + extras.join(" · ") : "");
    }
    updateManageLabel();
  }

  function updateManageLabel() {
    const mb = document.querySelector("#dsa-toggle .dsa-manage");
    if (mb) {
      const c = brandCounts();
      mb.textContent = `${panelOpen ? "▾" : "▸"} Brands: ${c.yours} yours · ${c.learned} learned`;
    }
  }

  function panelItem(key, name, label, cls, actions) {
    return el("li", { class: "dsa-pitem" },
      el("span", { class: "dsa-pname" }, name),
      el("span", { class: "dsa-ptag " + cls }, label),
      el("span", { class: "dsa-pactions" }, ...actions));
  }

  function renderPanel() {
    const panel = document.querySelector("#dsa-toggle .dsa-panel");
    updateManageLabel();
    if (!panel) return;
    panel.hidden = !panelOpen;
    if (!panelOpen) return;
    panel.replaceChildren();

    // Your ratings
    const votes = Object.entries(memory.votes).sort((a, b) => (memory.names[a[0]] || a[0]).localeCompare(memory.names[b[0]] || b[0]));
    panel.append(el("div", { class: "dsa-phead" }, "Your ratings"));
    if (!votes.length) panel.append(el("div", { class: "dsa-muted" }, "None yet. Open a card's Trust badge to trust or block its brand."));
    else {
      const ul = el("ul", { class: "dsa-plist" });
      for (const [k, v] of votes) {
        ul.append(panelItem(k, memory.names[k] || k, v === "trust" ? "trusted" : "blocked", v === "trust" ? "dsa-trust" : "dsa-block",
          [button("×", "dsa-x", () => vote(k, null, null))]));
      }
      panel.append(ul);
    }

    // Learned
    const learnedList = Object.entries(learned).filter(([k]) => !memory.votes[k])
      .sort((a, b) => (memory.brands[a[0]].name || a[0]).localeCompare(memory.brands[b[0]].name || b[0]));
    panel.append(el("div", { class: "dsa-phead" }, "Learned from your searches"));
    if (!learnedList.length) panel.append(el("div", { class: "dsa-muted" }, "Nothing yet. Brands are learned after they show up across several different searches."));
    else {
      const ul = el("ul", { class: "dsa-plist" });
      for (const [k, v] of learnedList) {
        const e = memory.brands[k];
        const j = MEMORY.judge(e, CFG.learning);
        const item = panelItem(k, e.name, v === "trust" ? "trusted" : "junk", v === "trust" ? "dsa-trust" : "dsa-block", [
          button("Trust", "dsa-trust", () => vote(k, e.name, "trust")),
          button("Block", "dsa-block", () => vote(k, e.name, "block")),
          button("Forget", "", () => forgetBrand(k))
        ]);
        item.title = `${j.why || ""} — ${j.stats.listings} listings across ${j.stats.searches} searches, average ${j.stats.avgEvidence} before brand points`;
        ul.append(item);
      }
      panel.append(ul);
    }

    const tracked = Object.keys(memory.brands).length;
    panel.append(el("div", { class: "dsa-pfoot" },
      el("span", { class: "dsa-muted" }, `${tracked} brand${tracked === 1 ? "" : "s"} being watched`),
      button(resetArmed ? "Click again to reset" : "Reset learning", "dsa-reset", () => {
        if (!resetArmed) { resetArmed = true; renderPanel(); setTimeout(() => { resetArmed = false; renderPanel(); }, 4000); return; }
        resetArmed = false;
        const votesKept = memory.votes, namesKept = memory.names;
        memory = MEMORY.emptyMemory();
        memory.votes = votesKept; memory.names = namesKept;
        refreshLearned();
        storeSet(KEY_MEMORY, memory);
        if (enabled) apply();
        renderPanel();
      })));
  }

  function buildToggle() {
    const input = el("input", { type: "checkbox", role: "switch", class: "dsa-main" });
    input.checked = enabled;
    input.addEventListener("change", () => {
      enabled = input.checked;
      storeSet(KEY_ENABLED, enabled);
      if (enabled) { installSortOption(); apply(); } else { removeSortOption(); restore(); }
    });
    const wrap = el("div", { id: "dsa-toggle" },
      el("label", { class: "dsa-switch" },
        input,
        el("span", { class: "dsa-track" }, el("span", { class: "dsa-thumb" })),
        el("span", { class: "dsa-label" }, "Disenshittify")),
      el("div", { class: "dsa-status" }, "Off"),
      el("div", { class: "dsa-legend", "aria-hidden": "true" }, el("span")),
      el("button", {
        type: "button", class: "dsa-manage",
        on: { click: e => { e.preventDefault(); panelOpen = !panelOpen; renderPanel(); } }
      }, ""),
      el("div", { class: "dsa-panel", hidden: "" }));
    return wrap;
  }

  function placeToggle() {
    if (document.getElementById("dsa-toggle")) return;
    if (!document.querySelector(CARD_SEL) || isMediaSearch()) return;
    const toggle = buildToggle();
    const sidebar = document.querySelector("#s-refinements, #s-filters-content");
    if (sidebar) {
      sidebar.prepend(toggle);
    } else {
      // No left column (narrow window): put it above the results instead.
      toggle.classList.add("dsa-inline");
      const slot = document.querySelector(CARD_SEL).parentElement;
      slot.parentElement.insertBefore(toggle, slot);
    }
    updateStatus(null);
  }

  // ---------- keep up with Amazon's in-page updates ----------

  let pending = null;
  function onMutations() {
    if (applying) return;
    clearTimeout(pending);
    pending = setTimeout(() => {
      if (isMediaSearch()) { leaveMediaSearch(); return; }
      placeToggle();
      const input = document.querySelector("#dsa-toggle .dsa-main");
      if (input) input.checked = enabled;
      if (enabled) installSortOption();
      if (enabled && cards().some(c => !c.dataset.dsaScored && !isMedia(c))) apply();
      else if (enabled && CFG.hideClutter !== false && removeClutter() !== lastPromoCount) {
        lastPromoCount = promosRemoved;
        updateStatus(lastResults, currentMode(), promosRemoved);
      }
    }, 350);
  }

  // A search that turned into a media search (Amazon swapped the results in place): undo everything.
  function leaveMediaSearch() {
    const t = document.getElementById("dsa-toggle");
    if (!t && !lastResults) return;
    if (lastResults) restore();
    removeSortOption();
    if (t) t.remove();
    lastResults = null;
  }

  // Clicking anywhere else closes an open badge.
  document.addEventListener("click", e => {
    if (!e.target.closest || !e.target.closest(".dsa-badge")) {
      document.querySelectorAll(".dsa-badge[open]").forEach(b => { b.open = false; });
    }
  });

  // Remember which result you clicked through (left or middle click), so its product page can find
  // the search-results estimate even when Amazon opens another size or colour.
  const noteClick = e => {
    if (!enabled || PRODUCT.isProductPage(location)) return;
    const a = e.target.closest && e.target.closest("a[href]");
    const card = a && a.closest(CARD_SEL);
    if (!card || !card.dataset.asin || a.closest(".dsa-badge")) return;
    lastClick = { a: card.dataset.asin, at: Date.now() };
    storeSet(KEY_LAST_CLICK, lastClick);
  };
  document.addEventListener("click", noteClick, true);
  document.addEventListener("auxclick", noteClick, true);

  console.info("[Disenshittify] running on this page");
  // v0.1 kept the on/off flag in amazon.com's own localStorage, where Amazon's scripts can see it.
  // Move it into the script's private storage and delete it from the site.
  async function migrateOldSettings() {
    if (!hasExtStorage && !hasGM) return;
    try {
      const old = localStorage.getItem(KEY_ENABLED);
      if (old !== null) {
        if ((await storeGet(KEY_ENABLED, undefined)) === undefined) storeSet(KEY_ENABLED, old === "1" || old === "true");
        localStorage.removeItem(KEY_ENABLED);
      }
    } catch (e) { /* site storage blocked — nothing to clean */ }
    if ((await storeGet(KEY_OLD_UNIT_SORT, false)) === true && (await storeGet(KEY_SORT, undefined)) === undefined) {
      storeSet(KEY_SORT, "unit");
    }
    storeSet(KEY_OLD_UNIT_SORT, false);
  }

  migrateOldSettings().then(() => Promise.all([storeGet(KEY_ENABLED, false), storeGet(KEY_MEMORY, null),
    storeGet(KEY_SORT, null), storeGet(KEY_FEATURED_FOR, ""), storeGet(KEY_LISTINGS, {}), storeGet(KEY_LAST_CLICK, null)])).then(([on, mem, choice, featured, seen, clicked]) => {
    lastClick = clicked && typeof clicked === "object" ? clicked : null;
    enabled = !!on;
    sortChoice = choice === "trust" || choice === "unit" ? choice : null;
    featuredFor = typeof featured === "string" ? featured : "";
    memory = MEMORY.sanitize(mem);
    listings = seen && typeof seen === "object" ? seen : {};
    refreshLearned();
    if (PRODUCT.isProductPage(location)) {
      // Picking another colour or size swaps the product in place (new ASIN in the address, no reload).
      let lastPath = location.pathname;
      let timer = null;
      new MutationObserver(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          const panelGone = enabled && !document.getElementById("dsa-product");
          if (location.pathname !== lastPath || panelGone) { lastPath = location.pathname; runProductPage(false); }
        }, 600);
      }).observe(document.body, { childList: true, subtree: true });
      runProductPage(false);
      return;
    }
    if (!isMediaSearch()) {
      placeToggle();
      if (enabled) { installSortOption(); apply(); }
    }
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  });
})();
