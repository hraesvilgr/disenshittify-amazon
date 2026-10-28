// Scores a captured results page and compares the tiers with the hand ratings.
// Run: node test/score.test.js [--verbose]
const path = require("path");
const brands = require("../src/brands.js");
const cfg = Object.assign({}, require("../src/config.js"), { knownBrands: brands.known, blockedBrands: brands.blocked, ambiguousBrands: brands.ambiguous });
const bigrams = require("../src/bigrams.js");
const { scorePage } = require("../src/scorer.js");
const fixture = require(path.join(__dirname, "fixtures", "baguette-tray.json"));

const verbose = process.argv.includes("--verbose");
const results = scorePage(fixture.listings, cfg, bigrams);

const seen = new Set();
let exact = 0, within1 = 0, total = 0, absErr = 0;
const rows = [];
for (const r of results.values()) {
  if (seen.has(r.asin)) continue;
  seen.add(r.asin);
  const hand = fixture.handRatings[r.asin];
  if (hand == null) continue;
  total++;
  const d = r.tier - hand;
  if (d === 0) exact++;
  if (Math.abs(d) <= 1) within1++;
  absErr += Math.abs(d);
  rows.push({ r, hand, d });
}

rows.sort((a, b) => b.r.score - a.r.score);
for (const { r, hand, d } of rows) {
  const flag = d === 0 ? "  " : Math.abs(d) === 1 ? "~ " : "!!";
  console.log(`${flag} ${String(r.score).padStart(3)}  auto ${r.tier} hand ${hand}  ${r.asin}  ${r.listing.title.slice(0, 70)}`);
  if (verbose || Math.abs(d) >= 2) {
    for (const x of r.reasons) console.log(`        ${x.pts > 0 ? "+" : ""}${x.pts}  ${x.text}`);
  }
}
console.log(`\n${total} listings · exact tier ${exact} (${Math.round(100 * exact / total)}%) · within 1 tier ${within1} (${Math.round(100 * within1 / total)}%) · mean abs error ${(absErr / total).toFixed(2)}`);

// Ordering sanity checks that should always hold.
const tierOf = a => [...results.values()].find(r => r.asin === a).tier;
const checks = [
  ["Chicago Metallic is top tier", tierOf("B003YKGQWO") === 5],
  ["USA Pan is top tier", tierOf("B00127Z4E2") === 5],
  ["Baguet-te kit is bottom tier", tierOf("B0DZLT5XHQ") === 1],
  ["Yupjlia is bottom tier", tierOf("B0DHZ2VGKX") <= 2],
  ["No listing is off by 3+ tiers", rows.every(x => Math.abs(x.d) < 3)],
  ["Within-1-tier agreement ≥ 90%", within1 / total >= 0.9]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
