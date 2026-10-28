// End-to-end check of the userscript in headless Chromium, on a stand-in results page built
// from the captured baguette-tray listings (same card structure as amazon.com's search page).
// Tampermonkey's GM_getValue / GM_setValue are emulated on top of localStorage.
// Run: node test/ui.test.js [screenshot-dir]
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.join(__dirname, "..");
const fixture = require("./fixtures/baguette-tray.json");
const userscript = fs.readFileSync(path.join(root, "dist", "disenshittify-amazon.user.js"), "utf8");
const shotDir = process.argv[2];

const { page, GM_SHIM, productPage } = require("./standin.js");
const products = require("./fixtures/products-2026-10-28.json");

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  // Serve the stand-in page on an amazon.com URL so the @match and storage origin are realistic.
  await ctx.route("https://www.amazon.com/**", r => {
    const m = /\/dp\/([A-Z0-9]{10})/.exec(r.request().url());
    r.fulfill({ contentType: "text/html", body: m && products[m[1]] ? productPage(products[m[1]]) : page });
  });
  await ctx.route(/media-amazon\.com/, r => r.abort());
  const p = await ctx.newPage();
  p.on("pageerror", e => errors.push(e.message));
  p.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });

  async function inject() {
    await p.waitForLoadState("domcontentloaded");
    await p.evaluate(GM_SHIM);
    await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
    await p.waitForSelector("#dsa-toggle");
    await p.waitForTimeout(100);
  }

  async function load(q) {
    await p.goto("https://www.amazon.com/s?k=" + encodeURIComponent(q));
    await p.evaluate(GM_SHIM);
    await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
    await p.waitForSelector("#dsa-toggle");
  }

  const results = [];
  const check = (name, ok, extra) => { results.push([name, !!ok]); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); };

  // 1. Toggle appears in the sidebar, off by default
  await load("baguette tray");
  check("Toggle shows at top of left column", await p.$eval("#s-refinements > :first-child", e => e.id === "dsa-toggle"));
  check("Off by default", (await p.textContent("#dsa-toggle .dsa-status")) === "Off");

  // 2. Turn on: cards tinted, sorted, duplicates hidden
  await p.click("#dsa-toggle .dsa-switch");
  await p.waitForSelector(".dsa-badge");
  const order = await p.$$eval(".s-main-slot > [data-asin]:not(.dsa-dupe)", els => els.map(e => +e.dataset.dsaTier));
  check("Every visible card rated", order.length === 51, `${order.length} visible`);
  check("Sorted most-trusted first", order.every((t, i) => i === 0 || order[i - 1] >= t), order.join(""));
  check("Status line filled in", /rated/.test(await p.textContent("#dsa-toggle .dsa-status")), await p.textContent("#dsa-toggle .dsa-status"));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "1-on.png") });
  const left = await p.$$eval("#promo-banner, #promo-haul, #promo-brands", els => els.map(e => e.id).join(","));
  check("Promo blocks removed from the page (banner, Haul, related brands)", left === "", left);
  check("Headings, pagination and help kept", await p.$$eval("#pager, #help", els => els.every(e => getComputedStyle(e).display !== "none")) &&
    (await p.$$eval(".s-main-slot h2", els => els.filter(e => e.offsetParent).map(e => e.textContent).join("|"))).includes("Results"));
  check("Status counts what's on screen", (await p.textContent("#dsa-toggle .dsa-status")).includes("3 promos removed") &&
    (await p.textContent("#dsa-toggle .dsa-status")).startsWith(String(await p.$$eval(".s-main-slot > [data-asin]:not(.dsa-dupe)", e => e.length)) + " rated"));
  check("Stray 'More results' heading hidden while trust-sorted", await p.$$eval(".s-main-slot h2", els => !els.some(e => e.textContent === "More results" && e.offsetParent)));
  check("Product photos aren't colour-blended", await p.$$eval(".dsa-paint .s-image", els => els.every(e => getComputedStyle(e).mixBlendMode === "normal")));

  // 3. Block a brand from its badge: Chicago Metallic
  const cm = '[data-asin="B003YKGQWO"]';
  const tierBefore = await p.$eval(cm, e => +e.dataset.dsaTier);
  if (process.env.DEBUG) console.log("CM reasons:", await p.$eval(cm + " .dsa-badge ul", e => e.textContent));
  await p.click(`${cm} .dsa-badge summary`);
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "2-badge.png"), clip: await p.$eval(cm, e => { const r = e.getBoundingClientRect(); return { x: Math.max(0, r.x - 200), y: r.y, width: r.width + 400, height: Math.min(r.height + 200, 900) }; }) });
  await p.click(`${cm} .dsa-btn.dsa-block`);
  await p.waitForTimeout(100);
  const tierAfter = await p.$eval(cm, e => +e.dataset.dsaTier);
  check("Block vote drops the brand", tierAfter < tierBefore, `${tierBefore} → ${tierAfter}`);
  const geo = await p.$eval(cm, card => {
    const c = card.getBoundingClientRect(), b = card.querySelector(".dsa-badge summary").getBoundingClientRect(),
          body = card.querySelector(".dsa-badge-body").getBoundingClientRect();
    return { right: c.right - b.right, top: b.top - c.top, pillW: b.width, bodyBelow: body.top >= b.bottom, cardH: c.height };
  });
  check("Badge sits in the card's top-right corner", geo.right >= 0 && geo.right < 16 && geo.top >= 0 && geo.top < 16 && geo.pillW < 120, JSON.stringify(geo));
  check("Details open below the pill without overlapping it", geo.bodyBelow);
  check("Pill is coloured by trust", await p.$eval(`${cm} .dsa-badge summary`, e => getComputedStyle(e).backgroundColor !== "rgba(0, 0, 0, 0)"));
  check("Badge doesn't add height to the card", await p.$eval(cm, card => { const b = card.querySelector(".dsa-badge"); return getComputedStyle(b).position === "absolute"; }));
  check("Badge stays open after voting", await p.$eval(`${cm} .dsa-badge`, e => e.open));
  check("Button shows the vote", (await p.textContent(`${cm} .dsa-btn.dsa-block`)).includes("Blocked"));
  check("Subtitle line under the title isn't scored as title", !(await p.textContent(`${cm} .dsa-badge`)).includes("Long title") && !(await p.textContent(`${cm} .dsa-badge`)).includes("Very long title"));
  check("Reason explains it", (await p.textContent(`${cm} .dsa-badge`)).includes("You blocked Chicago Metallic"));
  check("A blocked brand isn't accused of copying itself", !(await p.textContent(`${cm} .dsa-badge`)).includes("Copies phrasing"));

  // 4. Brand manager lists the vote
  await p.click("#dsa-toggle .dsa-manage");
  check("Manager lists your rating", (await p.textContent("#dsa-toggle .dsa-panel")).includes("Chicago Metallic"));
  check("Manager label counts it", /1 yours/.test(await p.textContent("#dsa-toggle .dsa-manage")));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "3-panel.png"), clip: { x: 0, y: 0, width: 300, height: 520 } });

  // 5. Vote and toggle state survive a reload; learning builds over different searches
  for (const q of ["baguette pan", "french bread pan", "perforated bread pan"]) await load(q);
  check("Stays on after reload", (await p.textContent("#dsa-toggle .dsa-status")) !== "Off");
  await p.click(`${cm} .dsa-badge summary`);
  check("Vote survives reload", (await p.textContent(`${cm} .dsa-badge`)).includes("You blocked Chicago Metallic"));
  if (process.env.DEBUG) console.log(await p.evaluate(() => { const m = JSON.parse(localStorage.getItem("gm:dsaMemory") || "null");
    return Object.entries(m.brands).map(([k, e]) => k + " " + JSON.stringify(DSA_MEMORY.judge(e, DSA_CONFIG.learning).stats) + " " + JSON.stringify(e.items)).join("\n"); }),
    await p.$$eval("[data-asin]", els => els.filter(e => /sponsored|yupjlia/i.test(e.querySelector(".dsa-badge")?.textContent || "")).slice(0, 4).map(e => e.dataset.asin + " | " + e.querySelector(".dsa-badge ul").textContent.slice(0, 120))));
  await p.click("#dsa-toggle .dsa-manage");
  const panelText = await p.textContent("#dsa-toggle .dsa-panel");
  check("Learned brands appear after several searches", /ABuff/.test(panelText) && /KITESSENSU/.test(panelText));
  await p.click('[data-asin="B0CM2Y5ZBW"] .dsa-badge summary');
  const abuff = await p.textContent('[data-asin="B0CM2Y5ZBW"] .dsa-badge');
  check("Learned junk brand gets marked on its cards", abuff.includes("Learned: ABuff"));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "4-learned.png"), clip: { x: 0, y: 0, width: 300, height: 620 } });

  // 6. Clearing the vote from the manager restores Chicago Metallic
  await p.click("#dsa-toggle .dsa-panel .dsa-x");
  await p.waitForTimeout(100);
  check("Clearing the vote restores the brand", (await p.$eval(cm, e => +e.dataset.dsaTier)) === tierBefore);

  // 7. Turning off restores Amazon's order
  await p.click("#dsa-toggle .dsa-switch");
  const restored = await p.$$eval(".s-main-slot > [data-asin]", els => els.map(e => e.dataset.asin).join(","));
  check("Off restores original order and colours", restored === fixture.listings.map(l => l.asin).join(",") &&
    !(await p.$(".dsa-paint")) && !(await p.$(".dsa-dupe")));
  check("Off says a reload brings the promos back", /reload to bring back the hidden promos/.test(await p.textContent("#dsa-toggle .dsa-status")));

  // 8. A sort the user picked (here: Avg. Customer Review) keeps Amazon's order but still colours cards
  await p.click("#dsa-toggle .dsa-switch");             // back on
  await p.goto("https://www.amazon.com/s?k=baguette+tray&s=review-rank");
  await p.evaluate(GM_SHIM);
  await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
  await p.waitForSelector(".dsa-badge");
  const sortedOrder = await p.$$eval(".s-main-slot > [data-asin]", els => els.map(e => e.dataset.asin).join(","));
  check("Your chosen sort order is kept", sortedOrder === fixture.listings.map(l => l.asin).join(","));
  check("…and cards are still coloured and rated", (await p.$$(".dsa-paint")).length >= 51 && (await p.$$(".dsa-badge")).length >= 51);
  check("…with Amazon's 'More results' heading left in place", await p.$$eval(".s-main-slot h2", els => els.some(e => e.textContent === "More results" && e.offsetParent)));
  check("Status says it's Amazon's order", /Amazon's order/.test(await p.textContent("#dsa-toggle .dsa-status")));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "5-user-sort.png"), clip: { x: 0, y: 0, width: 1400, height: 700 } });

  // 9. Back on the default order (Featured), trust sorting returns
  await load("baguette tray");
  const back = await p.$$eval(".s-main-slot > [data-asin]:not(.dsa-dupe)", els => els.map(e => +e.dataset.dsaTier));
  check("Featured order is re-sorted by trust", back.every((t, i) => i === 0 || back[i - 1] >= t));

  // 10. Disenshittified entries in Amazon's Sort by menu
  const prompt = () => p.textContent(".a-dropdown-prompt");
  const status = () => p.textContent("#dsa-toggle .dsa-status");
  const asinOrder = () => p.$$eval(".s-main-slot > [data-asin]", els => els.map(e => e.dataset.asin).join(","));
  const tiersShown = () => p.$$eval(".s-main-slot > [data-asin]:not(.dsa-dupe)", els => els.map(e => +e.dataset.dsaTier));
  const amazonOrder = fixture.listings.map(l => l.asin).join(",");
  const openMenu = async () => { await p.click("#a-autoid-0"); return p.$$eval("#a-popover-3 a", as => as.map(a => a.textContent)); };
  const pick = async label => { await p.click(`#a-popover-3 a:text-is('${label}')`); await p.waitForTimeout(150); };

  check("The box has no extra switches", !(await p.$("#dsa-toggle .dsa-unit-switch")) && (await p.$$("#dsa-toggle input")).length === 1);
  check("A fresh search shows 'Sort by: Disenshittified: Trust'", (await prompt()) === "Disenshittified: Trust");
  const entries = await openMenu();
  check("Menu lists both Disenshittified entries last", entries.slice(-2).join(" | ") === "Disenshittified: Trust | Disenshittified: $/count", entries.join(" | "));
  check("…with Trust marked as current", (await p.$$eval("#a-popover-3 a.a-active", as => as.map(a => a.textContent))).join() === "Disenshittified: Trust");

  // $/count
  const urlBefore = p.url();
  await pick("Disenshittified: $/count");
  check("Picking $/count doesn't navigate", p.url() === urlBefore);
  check("Menu closes after picking", !(await p.$("#a-popover-3")));
  check("Sort by label shows $/count", (await prompt()) === "Disenshittified: $/count");
  const unitRows = await p.$$eval(".s-main-slot > [data-asin]:not(.dsa-dupe)", els => els.map(e => {
    return e.dataset.dsaUnit || "";
  }));
  const parsed = unitRows.map(t => { const m = /\$([\d.]+)\/(\w+)/.exec(t); return m ? { v: +m[1], u: m[2] } : null; });
  const firstNone = parsed.findIndex(x => !x);
  const counts = parsed.filter(x => x && x.u === "count").map(x => x.v);
  check("Ordered by price per count, cheapest first", counts.length > 5 && counts.every((v, i) => i === 0 || counts[i - 1] <= v), counts.slice(0, 8).join(" "));
  check("Most common unit first, then other units, then no unit price", parsed.slice(0, counts.length).every(x => x && x.u === "count") &&
    (firstNone === -1 || parsed.slice(firstNone).every(x => !x)));
  check("Closed badges don't build their pop-over", (await p.$$(".dsa-badge:not([open]) .dsa-badge-body")).length === 0);
  check("Colours and badges kept", (await p.$$(".s-main-slot > [data-asin]:not(.dsa-dupe) .dsa-badge")).length === 51);
  check("Status says ordered by $/count", /ordered by \$\/count/.test(await status()));
  await load("baguette pan");
  check("$/count stays chosen on the next search", (await prompt()) === "Disenshittified: $/count" && /ordered by \$\/count/.test(await status()));

  // Featured = Amazon's real Featured order, for this search
  await openMenu();
  await pick("Featured");
  check("Picking Featured shows Amazon's own order, no reload", (await asinOrder()) === amazonOrder && (await prompt()) === "Featured" && /Amazon's order/.test(await status()));
  await load("baguette pan");
  check("…and stays Featured for that search", (await prompt()) === "Featured" && (await asinOrder()) === amazonOrder);
  await load("french bread pan");
  const fresh = await tiersShown();
  check("A new search goes back to Disenshittified: Trust", (await prompt()) === "Disenshittified: Trust" && fresh.every((t, i) => i === 0 || fresh[i - 1] >= t));

  // On one of Amazon's other sorts, Disenshittified: Trust is one click away
  await openMenu();
  await Promise.all([p.waitForNavigation(), pick("Avg. Customer Review")]);
  await inject();
  check("Amazon's sort loads normally", /s=review-rank/.test(p.url()) && (await prompt()) === "Avg. Customer Review" && /Amazon's order/.test(await status()));
  const urlReview = p.url();
  await openMenu();
  await pick("Disenshittified: Trust");
  const trustNow = await tiersShown();
  check("Picking Disenshittified: Trust there re-sorts by trust, no reload", p.url() === urlReview &&
    (await prompt()) === "Disenshittified: Trust" && trustNow.every((t, i) => i === 0 || trustNow[i - 1] >= t));
  await openMenu();
  await pick("Avg. Customer Review");
  check("Picking that page's own sort again returns to Amazon's order", (await asinOrder()) === amazonOrder && (await prompt()) === "Avg. Customer Review");

  // Turning Disenshittify off removes the entries
  await p.click("#dsa-toggle .dsa-switch");
  check("Disenshittify off removes the menu entries", !(await p.$$eval("#s-result-sort-select option", os => os.map(o => o.value))).some(v => v.startsWith("dsa-")));
  await p.click("#dsa-toggle .dsa-switch");

  // 11. Leftover v0.1 setting in amazon.com's localStorage is moved and deleted
  await p.evaluate(() => { localStorage.setItem("dsaEnabled", "1"); localStorage.removeItem("gm:dsaEnabled"); });
  await load("baguette tray");
  check("Old site-storage setting is migrated and removed", (await p.evaluate(() => localStorage.getItem("dsaEnabled"))) === null &&
    (await status()) !== "Off");
  check("Nothing else written to amazon.com's own storage", (await p.evaluate(() => Object.keys(localStorage).filter(k => !k.startsWith("gm:")))).length === 0);

  // 12. Product pages: a better rating, compared with the search-results estimate
  await load("baguette tray");                                   // records the search-results estimates
  const pavBefore = await p.$eval('[data-asin="B0D2NG692S"]', e => +e.querySelector(".dsa-score").textContent.replace(/\D/g, ""));
  const cmBefore = await p.$eval('[data-asin="B003YKGQWO"]', e => +e.querySelector(".dsa-score").textContent.replace(/\D/g, ""));
  const product = async asin => {
    await p.goto("https://www.amazon.com/Some-Product-Name/dp/" + asin);
    await p.evaluate(GM_SHIM);
    await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
    await p.waitForSelector("#dsa-product");
  };
  await product("B0D2NG692S");
  const pav = await p.textContent("#dsa-product");
  check("Product page shows a Disenshittify panel under the title", await p.$eval("#dsa-product", e => e.previousElementSibling && e.previousElementSibling.id === "titleSection"));
  check("…comparing with the search-results estimate", pav.includes(`Search results:`) && pav.includes(`· ${pavBefore}`), pav.slice(0, 140));
  await p.click("#dsa-product .dsa-ph-details summary");
  const pavDetails = await p.textContent("#dsa-product .dsa-ph-details");
  check("…and listing what the product page showed", /bracketed/.test(pavDetails) && /Marketing language in bullet points/.test(pavDetails), pavDetails.slice(0, 160));
  check("A score already at 0 shows no change, and says why", (await p.textContent("#dsa-product .dsa-ph-delta")) === "–" && /already at the bottom/.test(pav), pav.slice(0, 160));
  check("Change sits right of the Trust pill; Disenshittify is right-aligned", await p.$eval("#dsa-product .dsa-ph-head", h => {
    const [pill, d, t] = h.children; const hr = h.getBoundingClientRect(), pr = pill.getBoundingClientRect(), dr = d.getBoundingClientRect(), tr = t.getBoundingClientRect();
    return d.classList.contains("dsa-ph-delta") && dr.left >= pr.right && dr.right < tr.left && hr.right - tr.right < 2; }));
  check("No toggle box on product pages", !(await p.$("#dsa-toggle")));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "6-product-junk.png"), clip: { x: 0, y: 0, width: 900, height: 420 } });
  await product("B003YKGQWO");
  const cmPanel = await p.textContent("#dsa-product");
  check("Established brand's panel shows the check held up", /Search results:/.test(cmPanel) && /^(▲\d+|–)$/.test(await p.textContent("#dsa-product .dsa-ph-delta")), cmPanel.slice(0, 140));
  if (shotDir) await p.screenshot({ path: path.join(shotDir, "7-product-good.png"), clip: { x: 0, y: 0, width: 900, height: 300 } });
  await product("B0017CRZIK");
  check("A product never seen in search results is rated from its own page", /Not in your recent search results/.test(await p.textContent("#dsa-product")));
  check("…and still shows its change, against the title-only estimate", /^(▲\d+|▼\d+|–)$/.test(await p.textContent("#dsa-product .dsa-ph-delta")) &&
    /title, stars and reviews alone \(\d+ → \d+\)/.test(await p.getAttribute("#dsa-product .dsa-ph-delta", "title")));
  // Amazon opens another size/colour than the one clicked: the estimate is found through the swatches…
  products.B0VARIANT1 = Object.assign({}, products.B003YKGQWO, { asin: "B0VARIANT1", variants: ["B0VARIANTX", "B003YKGQWO"] });
  await product("B0VARIANT1");
  const varPanel = await p.textContent("#dsa-product .dsa-ph-compare");
  check("Another size/colour of a search result is compared with that result", varPanel.includes("another size/colour") && varPanel.includes(`· ${cmBefore}`), varPanel);
  // …or through the result you last clicked, when the page has no swatches
  products.B0VARIANT2 = Object.assign({}, products.B003YKGQWO, { asin: "B0VARIANT2" });
  await p.goto("https://www.amazon.com/s?k=baguette+tray");
  await p.evaluate(GM_SHIM);
  await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
  await p.waitForSelector('[data-asin="B003YKGQWO"] .dsa-badge');
  await p.$eval('[data-asin="B003YKGQWO"] h2 a, [data-asin="B003YKGQWO"] a[href]', a => { a.setAttribute("href", "#"); a.click(); });
  await p.goto("https://www.amazon.com/dp/B0VARIANT2", { referer: "https://www.amazon.com/s?k=baguette+tray" });
  await p.evaluate(GM_SHIM);
  await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
  await p.waitForSelector("#dsa-product");
  check("…or with the search result you clicked through", (await p.textContent("#dsa-product .dsa-ph-compare")).includes(`· ${cmBefore}`));
  // Back on the results page, checked listings use the refined rating and say so
  await load("baguette tray");
  const pavAfter = await p.$eval('[data-asin="B0D2NG692S"] summary', e => e.textContent);
  const cmAfter = await p.$eval('[data-asin="B003YKGQWO"] summary', e => e.textContent);
  check("Checked listings are marked ✓ in the results", pavAfter.includes("✓") && cmAfter.includes("✓"), pavAfter + " | " + cmAfter);
  await p.click('[data-asin="B0D2NG692S"] .dsa-badge summary');
  check("…with the product-page check in the reasons", /Checked on its product page/.test(await p.textContent('[data-asin="B0D2NG692S"] .dsa-badge')));
  // Books, films, TV, music and games: no Disenshittify at all
  const mediaLoad = async (n) => {
    await p.goto("https://www.amazon.com/s?k=baguette+tray&media=" + n);
    await p.evaluate(n => [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, n)
      .forEach(c => { const a = document.createElement("a"); a.className = "a-text-bold"; a.textContent = "Paperback"; c.append(a); }), n);
    await p.evaluate(GM_SHIM);
    await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
    await p.waitForTimeout(700);
  };
  await mediaLoad(3);
  const mixed = await p.evaluate(() => {
    const cs = [...document.querySelectorAll('div[data-component-type="s-search-result"]')];
    const media = cs.filter(c => [...c.querySelectorAll("a.a-text-bold")].some(a => a.textContent === "Paperback"));
    return { toggle: !!document.getElementById("dsa-toggle"), mediaBadges: media.filter(c => c.querySelector(".dsa-badge")).length,
             mediaPainted: media.filter(c => c.classList.contains("dsa-rated")).length, others: cs.filter(c => c.querySelector(".dsa-badge")).length,
             last: media.every(c => cs.indexOf(c) >= cs.length - 3 - cs.filter(x => x.classList.contains("dsa-dupe")).length - 3),
             status: (document.querySelector("#dsa-toggle .dsa-status") || {}).textContent || "" };
  });
  check("Mixed page: books get no badge or colour", mixed.toggle && mixed.mediaBadges === 0 && mixed.mediaPainted === 0 && mixed.others > 10, JSON.stringify(mixed));
  check("…and the status line says so", /3 books\/media not rated/.test(mixed.status), mixed.status);
  check("…and they keep Amazon's places in the trust order (a game searched for stays on top)", await p.evaluate(() =>
    [...document.querySelectorAll('div[data-component-type="s-search-result"]')].slice(0, 3).every(c => [...c.querySelectorAll("a.a-text-bold")].some(a => a.textContent === "Paperback"))));
  await mediaLoad(200);
  check("Mostly-media search: no toggle, nothing rated, nothing removed", await p.evaluate(() =>
    !document.getElementById("dsa-toggle") && !document.querySelector(".dsa-badge, .dsa-rated, .dsa-clutter")));
  products["0441013597"] = Object.assign({}, products.B003YKGQWO, { asin: "0441013597", dpClass: "book en_US" });
  await product("B003YKGQWO");
  await p.goto("https://www.amazon.com/Dune/dp/0441013597");
  await p.evaluate(GM_SHIM);
  await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
  await p.waitForTimeout(800);
  check("Book product page: no panel", !(await p.$("#dsa-product")));
  await load("baguette tray");
  // Turning Disenshittify off also turns off product pages
  await p.click("#dsa-toggle .dsa-switch");
  await p.goto("https://www.amazon.com/dp/B0002D00H8");
  await p.evaluate(GM_SHIM);
  await p.addScriptTag({ content: `(function(){${userscript}\n})();` });
  await p.waitForTimeout(400);
  check("Disenshittify off: no product-page panel", !(await p.$("#dsa-product")));

  check("No script errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await browser.close();
  process.exit(results.some(r => !r[1]) ? 1 : 0);
})();
