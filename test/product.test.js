// Refines search-results estimates with product-page data captured from live amazon.com pages.
// Run: node test/product.test.js [--verbose]
const brands = require("../src/brands.js");
const cfg = Object.assign({}, require("../src/config.js"), { knownBrands: brands.known, blockedBrands: brands.blocked, ambiguousBrands: brands.ambiguous });
const bigrams = require("../src/bigrams.js");
const scorer = require("../src/scorer.js");
const product = require("../src/product.js");
const products = require("./fixtures/products-2026-10-28.json");
const verbose = process.argv.includes("--verbose");

// Search-results estimates for the same listings, from the captured results pages.
const baguette = require("./fixtures/baguette-tray.json");
const live = Object.assign({}, require("./live.js")("live-2026-10-27.tsv"), require("./live.js")("live-shopvac.tsv"));
const initial = {};
for (const page of [{ listings: baguette.listings }, ...Object.values(live)]) {
  for (const r of scorer.scorePage(page.listings, cfg, bigrams).values()) if (!initial[r.asin]) initial[r.asin] = r;
}

const out = {};
console.log("ASIN        brand                 results → product   change");
for (const [asin, p] of Object.entries(products)) {
  if (asin.startsWith("_")) continue;
  const init = initial[asin] || null;
  const r = product.refineScore(init, p, cfg, bigrams, scorer, Date.parse("2026-10-28"));
  out[asin] = r;
  const before = init ? `${init.tier}/5 ${String(init.score).padStart(3)}` : "  (none)";
  console.log(`${asin}  ${(p.brand || "").padEnd(20)}  ${before} → ${r.tier}/5 ${String(r.score).padStart(3)}   ${r.changes.filter(c => c.pts).map(c => (c.pts > 0 ? "+" : "") + c.pts).join(" ")}`);
  if (verbose) for (const c of r.changes) console.log(`        ${c.pts > 0 ? "+" : ""}${c.pts}  ${c.text}`);
}

const t = a => out[a].tier;
const checks = [
  ["Established brands rate 4–5 after the product page", ["B003YKGQWO", "B00127Z4E2", "B0002D00H8", "B00KZHMZ1K", "B000Q87DAQ", "B09T3W8VSY", "B09GQVKYBQ", "B000065DKJ", "B0017CRZIK"].every(a => t(a) >= 4),
    ["B003YKGQWO", "B00127Z4E2", "B0002D00H8", "B00KZHMZ1K", "B000Q87DAQ", "B09T3W8VSY", "B09GQVKYBQ", "B000065DKJ", "B0017CRZIK"].map(t).join("")],
  ["Junk listings rate 1–2", ["B0D2NG692S", "B0DHZ2VGKX", "B0H7XQNFYS", "B0DZLT5XHQ", "B0HMBN7LQP"].every(a => t(a) <= 2),
    ["B0D2NG692S", "B0DHZ2VGKX", "B0H7XQNFYS", "B0DZLT5XHQ", "B0HMBN7LQP"].map(t).join("")],
  ["Pavsrmy's 【bracketed】 bullets are caught", out.B0D2NG692S.changes.some(c => /bracketed/.test(c.text))],
  ["Baguet-te kit's broken words in bullets are caught", out.B0DZLT5XHQ.changes.some(c => /broken words/.test(c.text))],
  ["Anonymous trading-company sellers are caught", out.B0DZLT5XHQ.changes.some(c => /anonymous/.test(c.text)) && out.B0HMBN7LQP.changes.some(c => /anonymous/.test(c.text))],
  ["Ordinary third-party sellers aren't", ["prune", "MyConnects", "Blue Tag Distribution LLC", "Pattern.", "easttop harmonica", "HOOMIL Direct"].every(n => !product.isAnonymousSeller(n))],
  ["A hidden brand is found on the product page", out.B0DLKJFK39.reasons.some(r => /Hagaday/.test(r.text))],
  ["Exact listing date replaces the ID estimate", out.B0017CRZIK.reasons.some(r => /March 1, 2005/.test(r.text)) && !out.B0017CRZIK.reasons.some(r => /Listed on Amazon for 10\+ years/.test(r.text))],
  ["Every change is explained", Object.values(out).every(r => r.changes.every(c => c.text && typeof c.pts === "number"))],
  ["Confirmations show even when nothing moves", out.B0002D00H8.changes.some(c => c.pts === 0 && /Brand confirmed as Hohner/.test(c.text))],
  ["Score adds up", Object.values(out).every(r => r.score === Math.max(0, Math.min(100, cfg.weights.base + r.reasons.reduce((s, x) => s + x.pts, 0))))],
  ["Dates parse", +product.parseDate("March 1, 2005") === +new Date(2005, 2, 1) && +product.parseDate("1 Mar. 2005") === +new Date(2005, 2, 1)]
];
let failed = 0;
console.log("");
for (const [name, ok, detail] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
