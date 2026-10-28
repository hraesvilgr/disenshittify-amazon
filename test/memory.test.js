// Simulates the same kind of results showing up across several searches and checks what gets learned.
// Run: node test/memory.test.js
const brands = require("../src/brands.js");
const config = require("../src/config.js");
const bigrams = require("../src/bigrams.js");
const { scorePage } = require("../src/scorer.js");
const M = require("../src/memory.js");
const fixture = require("./fixtures/baguette-tray.json");

const baseCfg = Object.assign({}, config, { knownBrands: brands.known, blockedBrands: brands.blocked, ambiguousBrands: brands.ambiguous });
let mem = M.emptyMemory();
let learned = {};
const searches = ["baguette tray", "baguette pan", "french bread pan", "perforated bread pan"];
for (const q of searches) {
  const cfg = Object.assign({}, baseCfg, { learnedBrands: learned, userBrands: mem.votes });
  const results = scorePage(fixture.listings, cfg, bigrams);
  mem = M.recordPage(mem, results, q, config.learning);
  learned = M.learnedBrands(mem, config.learning);
}

console.log("Brand memory after", searches.length, "searches:");
for (const [k, e] of Object.entries(mem.brands).sort()) {
  const j = M.judge(e, config.learning);
  console.log(`  ${(j.verdict || "-").padEnd(6)} ${e.name.padEnd(12)} listings ${j.stats.listings}  avg evidence ${j.stats.avgEvidence}  flagged ${j.stats.flagged}  min reviews ${j.stats.minReviews}${j.why ? "  (" + j.why + ")" : ""}`);
}

// Learning must not change what's already known, and must not be fooled by its own output.
const cfg = Object.assign({}, baseCfg, { learnedBrands: learned, userBrands: {} });
const final = scorePage(fixture.listings, cfg, bigrams);
const byAsin = a => [...final.values()].find(r => r.asin === a);

// A user vote overrides everything.
mem = M.setVote(mem, "chicago metallic", "Chicago Metallic", "block");
const voted = scorePage(fixture.listings, Object.assign({}, cfg, { userBrands: mem.votes }), bigrams);
const cmVoted = [...voted.values()].find(r => r.asin === "B003YKGQWO");

// Evidence is the same with or without learning (no feedback loop).
const plain = scorePage(fixture.listings, Object.assign({}, baseCfg), bigrams);
const sameEvidence = [...plain.values()].every((r, i) => r.evidence === final.get(i).evidence);

const checks = [
  ["Chicago Metallic stays top tier", byAsin("B003YKGQWO").tier === 5],
  ["KITESSENSU (3 products, clean titles) isn't blocked", learned["kitessensu"] !== "block"],
  ["AMAGABELI isn't trusted (contradictory materials)", learned["amagabeli"] !== "trust"],
  ["AMAGABELI isn't blocked either (sloppy, not fraudulent)", learned["amagabeli"] !== "block"],
  ["ABuff gets learned as junk", learned["abuff"] === "block"],
  ["A brand on the junk list isn't 'learned trusted'", learned["pavsrmy"] !== "trust"],
  ["Your Block vote sinks Chicago Metallic", cmVoted.tier <= 2],
  ["Learning never feeds back into evidence", sameEvidence],
  ["Nothing learned from a single search", (() => {
    const one = M.recordPage(M.emptyMemory(), plain, "only one", config.learning);
    return Object.keys(M.learnedBrands(one, config.learning)).length === 0;
  })()]
];
let failed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) failed++; }
process.exit(failed ? 1 : 0);
