// Stand-in Amazon search results page built from the captured baguette-tray listings, with the same
// card structure and Sort by menu behaviour as amazon.com. Shared by ui.test.js and memory-footprint.js.
const fixture = require("./fixtures/baguette-tray.json");

const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
// Stand-in unit prices: most listings priced per count, a few per ounce, some with none.
function unitFor(l) {
  const n = parseInt(l.asin.replace(/\D/g, "").slice(-3) || "0", 10);
  return n % 5 === 0 ? null : (n % 97) / 10 + 0.05;
}
function card(l) {
  const title = l.title.replace(/^Sponsored\s*/, "");
  const count = (/\(([\d.,]+K?)\)/.exec(l.reviews || "") || [])[1];
  const exact = count && !/K/.test(count) ? count : null;
  return `
  <div data-component-type="s-search-result" data-asin="${l.asin}" class="sg-col-4-of-24 s-result-item">
    <div class="puis-card-container s-card-container" style="border:1px solid #ddd;padding:8px;background:#fff">
      <img class="s-image" src="${esc(l.img)}" alt="" width="120" height="90" style="background:#eee">
      <div data-cy="title-recipe">
        ${l.sponsored ? '<span class="puis-sponsored-label-text">Sponsored</span>' : ""}
        <a href="#"><h2 aria-label="${esc(title)}"><span>${esc(title)}</span></h2></a>
        ${l.asin === "B003YKGQWO" ? '<div class="a-row"><span class="a-size-base a-color-secondary">Baguette pan, nonstick perforated French bread baking tray for home baking, crisp golden crust every time, oven safe</span></div>' : ""}
      </div>
      ${l.rating ? `<div data-cy="reviews-block"><span class="a-icon-alt">${esc(l.rating)}</span>
        <a href="#" ${exact ? `aria-label="${exact} ratings"` : ""}>(${esc(count || "")})</a></div>` :
        (l.reviews ? `<div data-cy="reviews-block">${esc(l.reviews)}</div>` : "")}
      <span class="a-price"><span class="a-offscreen">${esc(l.price || "")}</span></span>
      ${unitFor(l) ? `<span class="a-size-base a-color-secondary">(<span class="a-price a-text-price"><span class="a-offscreen">$${unitFor(l).toFixed(2)}</span><span aria-hidden="true">$${unitFor(l).toFixed(2)}</span></span>/${l.asin.endsWith("K") ? "ounce" : "count"})</span>` : ""}
    </div>
  </div>`;
}
// Stand-in for Amazon's Sort by menu: a hidden <select> whose options are copied into a pop-up list
// when the button is clicked; picking an entry sets the select and fires "change", and Amazon's
// change handler navigates to the option's data-url. Escape closes the pop-up.
const MENU_JS = `
(function () {
  const sorts = [["relevanceblender","Featured"],["price-asc-rank","Price: Low to High"],["review-rank","Avg. Customer Review"],["exact-aware-popularity-rank","Best Sellers"]];
  const current = new URLSearchParams(location.search).get("s") || "relevanceblender";
  const k = new URLSearchParams(location.search).get("k") || "";
  const sel = document.getElementById("s-result-sort-select");
  for (const [v, t] of sorts) {
    const o = document.createElement("option");
    o.value = v; o.textContent = t; o.dataset.url = "/s?k=" + encodeURIComponent(k) + "&s=" + v;
    if (v === current) { o.selected = true; o.defaultSelected = true; }
    sel.appendChild(o);
  }
  const prompt = document.querySelector(".a-dropdown-prompt");
  prompt.textContent = sel.selectedOptions[0].textContent;
  function close() { const pop = document.getElementById("a-popover-3"); if (pop) pop.remove(); }
  document.getElementById("a-autoid-0").addEventListener("click", () => {
    close();
    const pop = document.createElement("div"); pop.id = "a-popover-3"; pop.className = "a-popover";
    const ul = document.createElement("ul"); ul.setAttribute("role", "listbox");
    [...sel.options].forEach((o, i) => {
      const li = document.createElement("li"); const a = document.createElement("a");
      a.id = "s-result-sort-select_" + i; a.className = "a-dropdown-link" + (o.selected ? " a-active" : "");
      a.href = "javascript:void(0)"; a.setAttribute("data-value", JSON.stringify({ stringVal: o.value })); a.textContent = o.textContent;
      a.addEventListener("click", () => {
        close();
        if (sel.value === o.value) return;
        sel.value = o.value; prompt.textContent = o.textContent;
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      li.appendChild(a); ul.appendChild(li);
    });
    pop.appendChild(ul); document.body.appendChild(pop);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") close(); });
  document.addEventListener("change", e => {   // Amazon navigates to the chosen sort
    if (e.target === sel) location.href = sel.selectedOptions[0].dataset.url || ("/s?k=" + k + "&s=" + sel.value);
  });
})();`;

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Amazon.com : baguette tray</title>
<style>body{font-family:Arial;margin:0}.wrap{display:flex}#s-refinements{width:260px;padding:12px}
.s-main-slot{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;flex:1;padding:12px}
h2{font-size:14px;font-weight:400;margin:6px 0}</style></head><body>
<div id="sortbar"><form action="/s"><span class="a-dropdown-container"><select name="s" id="s-result-sort-select" style="display:none"></select><span class="a-button a-button-dropdown" id="a-autoid-0"><span>Sort by: </span><span class="a-dropdown-prompt"></span></span></span></form></div>
<div class="wrap"><div id="s-refinements"><div>Popular Shopping Ideas</div><div>Perforated</div></div>
<div class="s-main-slot s-result-list s-search-results sg-row">
<div class="s-result-item AdHolder" id="promo-banner"><img src="x.jpg" alt="">Baking crispy baguette with baguette bread pan Sponsored</div>
<div class="s-result-item s-flex-full-width"><span data-component-type="s-messaging-widget-results-header"><h2>Results</h2></span></div>
${fixture.listings.slice(0, 20).map(card).join("")}
<div class="s-result-item s-flex-full-width s-widget" id="promo-haul"><div data-component-type="haul-asin-recommendation-widget">Crazy-good finds Shop crazy low prices on Amazon Haul <img src="y.jpg" alt=""></div></div>
<div class="s-result-item s-flex-full-width"><span data-component-type="s-messaging-widget-results-header"><h2>More results</h2></span></div>
${fixture.listings.slice(20).map(card).join("")}
<div class="s-result-item s-flex-full-width" data-component-type="s-pagination" id="pager">Previous 1 2 3 Next</div>
<div class="s-result-item AdHolder" id="promo-brands"><img src="z.jpg" alt="">Brands related to your search Sponsored</div>
<div class="s-result-item s-flex-full-width" id="help">Need help? Visit the help section</div>
</div></div>
<script>${MENU_JS}</script>
</body></html>`;

const GM_SHIM = `
  window.GM_getValue = (k, d) => { const v = localStorage.getItem("gm:" + k); return v == null ? d : JSON.parse(v); };
  window.GM_setValue = (k, v) => localStorage.setItem("gm:" + k, JSON.stringify(v));`;

// Stand-in product page with Amazon's structure, from a captured product record.
function productPage(pr) {
  const hist = pr.histogram ? Object.entries(pr.histogram).map(([star, pct]) =>
    `<li><a aria-label="${pct} percent of reviews have ${star} stars" href="#">${star} star ${pct}%</a></li>`).join("") : "";
  const rows = [["Brand Name", pr.brand], ["Manufacturer", pr.manufacturer], ["Date First Available", pr.dateFirstAvailable], ["ASIN", pr.asin]]
    .filter(r => r[1]).map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Amazon.com: ${esc(pr.title)}</title></head><body>
<div id="dp" class="${pr.dpClass || "kitchen en_US"}"><div id="centerCol">
  <div id="titleSection"><h1 id="title"><span id="productTitle">${esc(pr.title)}</span></h1></div>
  <a id="bylineInfo" href="${pr.brandStore ? "/stores/x/page/1" : "/" + esc(pr.brand || "x") + "/b/"}">${esc(pr.bylineText || "")}</a>
  <div id="averageCustomerReviews"><span id="acrPopover" title="${pr.rating != null ? pr.rating + " out of 5 stars" : ""}"></span>
    <span id="acrCustomerReviewText">${pr.reviewCount != null ? "(" + pr.reviewCount.toLocaleString("en-US") + ")" : ""}</span></div>
  <div id="feature-bullets"><ul>${(pr.bullets || []).map(b => `<li><span class="a-list-item">${esc(b)}</span></li>`).join("")}</ul></div>
  ${pr.frequentlyReturned ? "<div>Frequently returned item</div>" : ""}
</div>
<div id="buybox">
  <div offer-display-feature-name="desktop-fulfiller-info"><span class="offer-display-feature-text-message">${esc(pr.shipsFrom || "")}</span></div>
  <div offer-display-feature-name="desktop-merchant-info"><span class="offer-display-feature-text-message">${esc(pr.soldBy || "")}</span></div>
</div>
${pr.variants ? `<div id="twister_feature_div"><ul>${pr.variants.map(a => `<li data-defaultasin="${a}">variant</li>`).join("")}</ul></div>` : ""}
<ul id="histogramTable">${hist}</ul>
<table id="productDetails_detailBullets_sections1">${rows}</table>
</div></body></html>`;
}

module.exports = { page, GM_SHIM, fixture, productPage };
