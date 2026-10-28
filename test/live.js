// Loads the captured live pages (test/fixtures/live-*.tsv) into scorer-ready listings.
const fs = require("fs");
const path = require("path");
module.exports = function loadLive(file) {
  const pages = {};
  let cur = null;
  for (const line of fs.readFileSync(path.join(__dirname, "fixtures", file), "utf8").split("\n")) {
    const q = /^# query: (.+?) \| (.+)$/.exec(line);
    if (q) { const key = pages[q[1]] ? q[1] + " | " + q[2] : q[1]; cur = pages[key] = { query: q[1], sort: q[2], listings: [] }; continue; }
    if (!line || line.startsWith("#") || !cur) continue;
    const [asin, title, rating, count, price, img, sp] = line.split("\t");
    cur.listings.push({
      asin, title, sponsored: sp === "1",
      rating: rating ? rating + " out of 5 stars" : "",
      reviews: rating ? rating + " out of 5 stars" : "",
      reviewCount: count ? +count : undefined, reviewExact: count ? true : undefined,
      price, img: img ? `https://m.media-amazon.com/images/I/${img}._AC_UL320_.jpg` : ""
    });
  }
  return pages;
};
