// Scores the captured live pages (harmonica / window fans / baby stroller) and checks that
// long-established brands rank where they should. Run: node test/live.test.js [--verbose]
const brands = require("../src/brands.js");
const cfg = Object.assign({}, require("../src/config.js"), { knownBrands: brands.known, blockedBrands: brands.blocked, ambiguousBrands: brands.ambiguous });
const bigrams = require("../src/bigrams.js");
const { scorePage, gibberishCheck } = require("../src/scorer.js");
const pages = Object.assign({}, require("./live.js")("live-2026-10-27.tsv"), require("./live.js")("live-shopvac.tsv"));
const verbose = process.argv.includes("--verbose");

const scored = {};
for (const [q, page] of Object.entries(pages)) {
  const r = scorePage(page.listings, cfg, bigrams);
  const seen = new Set();
  scored[q] = [...r.values()].filter(x => !seen.has(x.asin) && seen.add(x.asin)).sort((a, b) => b.score - a.score);
  const tiers = [0, 0, 0, 0, 0, 0]; scored[q].forEach(x => tiers[x.tier]++);
  console.log(`\n=== ${q} (${page.sort}) — tiers 5..1: ${tiers.slice(1).reverse().join(" / ")}`);
  for (const x of scored[q]) {
    console.log(`${x.tier} ${String(x.score).padStart(3)}  ${x.listing.title.slice(0, 70)}`);
    if (verbose) console.log("        " + x.reasons.map(r => (r.pts > 0 ? "+" : "") + r.pts + " " + r.text).join(" | "));
  }
}

const tierOf = (q, re) => scored[q].filter(x => re.test(x.listing.title)).map(x => x.tier);
const all = (arr, f) => arr.length > 0 && arr.every(f);
const checks = [
  ["Hohner listings rate 4–5", all(tierOf("harmonica", /^Hohner/), t => t >= 4), tierOf("harmonica", /^Hohner/).join("")],
  ["Fender listings rate 4–5", all(tierOf("harmonica", /^Fender/), t => t >= 4), tierOf("harmonica", /^Fender/).join("")],
  ["Lee Oskar and Suzuki rate 4–5", all(tierOf("harmonica", /^(Lee Oskar|Suzuki)/), t => t >= 4), tierOf("harmonica", /^(Lee Oskar|Suzuki)/).join("")],
  ["Unbranded '4 Pack C Key' sets rate 1–2", all(tierOf("harmonica", /^4 Pack C Key/), t => t <= 2), tierOf("harmonica", /^4 Pack C Key/).join("")],
  ["Bionaire, Holmes, Air King, Pelonis rate 3+", all(tierOf("window fans", /^(Bionaire|Holmes|HOLMES|Air King|PELONIS)/), t => t >= 3), tierOf("window fans", /^(Bionaire|Holmes|HOLMES|Air King|PELONIS)/).join("")],
  ["Vornado, Black+Decker, LG, Amazon Basics rate 4+", all(tierOf("window fans", /^(Vornado|BLACK\+DECKER|LG |Amazon Basics)/), t => t >= 4)],
  ["Chicco, Graco rate 5", all(tierOf("baby stroller", /^(Chicco|Graco)/), t => t === 5), tierOf("baby stroller", /^(Chicco|Graco)/).join("")],
  ["Unbranded 'Baby Stroller, 2-in-1…' rates ≤3", all(tierOf("baby stroller", /^Baby Stroller, 2-in-1/), t => t <= 3)],
  ["Shop-Vac, Vacmaster, Koblenz rate 4+ (Best Sellers)", all(tierOf("wet-dry shop vacs", /^(Shop-Vac \d|Vacmaster|Koblenz)/).filter((t, i, a) => true), t => t >= 4), tierOf("wet-dry shop vacs", /^(Shop-Vac \d|Vacmaster|Koblenz)/).join("")],
  ["WORKSHOP vacs are recognised as a brand", scored["wet-dry shop vacs | price-desc-rank"].filter(x => /^WORKSHOP/.test(x.listing.title)).every(x => x.brand.kind !== "none")],
  ["Shark counts as established", all(tierOf("wet-dry shop vacs", /^Shark/), t => t >= 4), tierOf("wet-dry shop vacs", /^Shark/).join("")],
  ["Category phrasing isn't 'copied'", scored["wet-dry shop vacs"].every(x => !x.reasons.some(r => /Copies phrasing/.test(r.text)))],
  ["Unbranded 'Industrial Wet Dry Shop Vacuum' rate 1–2", all(tierOf("wet-dry shop vacs | price-desc-rank", /^(Industrial Wet Dry|Wet\/Dry Vac,Shop Vac)/), t => t <= 2), tierOf("wet-dry shop vacs | price-desc-rank", /^(Industrial Wet Dry|Wet\/Dry Vac,Shop Vac)/).join("")],
  ["'Sponsored Ad –' prefix stripped", require("../src/scorer.js").normalizeListing({ title: "Sponsored Ad - Fender Blues Deluxe Harmonica" }).title === "Fender Blues Deluxe Harmonica"],
  ["Real foreign names aren't 'gibberish'", ["Suzuki", "Xiaomi", "Zojirushi", "Miyabi", "EastRock", "Fujifilm", "Sweetfull", "JDR"].every(w => !gibberishCheck(w, bigrams, cfg))],
  ["Unpronounceable names still are", ["Pavsrmy", "Yupjlia", "Cadpxs", "AYCCNH", "Eavnbaek", "ABuff", "Dxdzt"].every(w => gibberishCheck(w, bigrams, cfg))]
];
let failed = 0;
console.log("");
for (const [name, ok, detail] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
