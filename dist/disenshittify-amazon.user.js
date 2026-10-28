// ==UserScript==
// @name         Disenshittify Amazon
// @namespace    disenshittify-amazon
// @version      0.5.1
// @description  Rates Amazon search results by trustworthiness, tints them green to red, and sorts the junk to the bottom.
// @match        https://www.amazon.com/s*
// @match        https://amazon.com/s*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// ==/UserScript==

(function () {
  const style = document.createElement("style");
  style.id = "dsa-styles";
  style.textContent = "/* Disenshittify Amazon \u2014 injected styles. Everything is prefixed dsa- to stay out of Amazon's way. */\n\n/* ---------- toggle ---------- */\n#dsa-toggle {\n  box-sizing: border-box;\n  margin: 0 0 14px;\n  padding: 10px 12px;\n  border: 2px solid #8bc34a;\n  border-radius: 10px;\n  background: #fbfdf7;\n  font-family: \"Amazon Ember\", Arial, sans-serif;\n  color: #0f1111;\n}\n#dsa-toggle.dsa-inline { max-width: 360px; margin: 8px 0 12px; }\n\n.dsa-switch {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  cursor: pointer;\n  user-select: none;\n}\n.dsa-switch input { position: absolute; opacity: 0; width: 1px; height: 1px; }\n.dsa-track {\n  position: relative;\n  flex: none;\n  width: 40px;\n  height: 22px;\n  border-radius: 11px;\n  background: #b9bdbd;\n  transition: background 0.15s;\n}\n.dsa-thumb {\n  position: absolute;\n  top: 3px;\n  left: 3px;\n  width: 16px;\n  height: 16px;\n  border-radius: 50%;\n  background: #fff;\n  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);\n  transition: transform 0.15s;\n}\n.dsa-switch input:checked + .dsa-track { background: #2e7d32; }\n.dsa-switch input:checked + .dsa-track .dsa-thumb { transform: translateX(18px); }\n.dsa-switch input:focus-visible + .dsa-track { outline: 2px solid #007185; outline-offset: 2px; }\n.dsa-label { font-size: 16px; font-weight: 700; }\n.dsa-unit { margin-bottom: 6px; }\n\n.dsa-status { margin: 6px 0 0 50px; font-size: 12px; color: #565959; }\n.dsa-legend { margin: 8px 0 0 50px; }\n.dsa-legend span {\n  display: block;\n  height: 6px;\n  border-radius: 3px;\n  background: linear-gradient(90deg, hsl(120 70% 40%), hsl(60 70% 45%), hsl(0 70% 45%));\n}\n\n/* ---------- rated cards ---------- */\n.dsa-paint {\n  background: var(--dsa-bg) !important;\n  box-shadow: inset 6px 0 0 var(--dsa-edge) !important;\n  border-radius: 8px;\n}\n/* Amazon paints white boxes inside the card; let the tint show through. */\n.dsa-paint .a-section,\n.dsa-paint .s-card-border,\n.dsa-paint .puis-card-border,\n.dsa-paint .s-card-container,\n.dsa-paint .puis-padding-left-small {\n  background: transparent !important;\n}\n/* Keep product photos true to colour: a plain white box behind the image, no blending. */\n.dsa-paint .s-product-image-container {\n  background: #fff !important;\n  border-radius: 6px;\n}\n.dsa-paint .s-image { mix-blend-mode: normal !important; }\n\n.dsa-dupe { display: none !important; }\n\n/* ---------- trust badge: a small pill over the card's top-right corner ---------- */\n.dsa-rated { position: relative; }\n.dsa-rated:has(.dsa-badge[open]) { z-index: 60; }\n.dsa-wide [data-cy=\"title-recipe\"] { padding-right: 130px; }       /* open popover sits above neighbouring cards */\n.dsa-badge {\n  position: absolute;\n  top: 6px;\n  right: 6px;\n  z-index: 30;\n  font: 12px/1.35 \"Amazon Ember\", Arial, sans-serif;\n  color: var(--dsa-ink);\n  text-align: left;\n}\n.dsa-badge > summary {\n  display: inline-block;\n  padding: 2px 8px;\n  border-radius: 11px;\n  background: var(--dsa-edge);\n  color: #fff;\n  font-weight: 700;\n  white-space: nowrap;\n  cursor: pointer;\n  list-style: none;\n  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);\n}\n.dsa-badge > summary::-webkit-details-marker { display: none; }\n.dsa-badge > summary::marker { content: \"\"; }\n.dsa-badge > summary::after { content: \" \\25BE\"; font-weight: 400; }\n.dsa-badge[open] > summary::after { content: \" \\25B4\"; }\n.dsa-badge .dsa-score { font-weight: 400; opacity: 0.85; }\n.dsa-badge li { margin: 1px 0; white-space: pre-wrap; padding-left: 2.2em; text-indent: -2.2em; }\n.dsa-badge li.dsa-good { color: #1e6b25; }\n.dsa-badge li.dsa-bad { color: #9b1c1c; }\n\n/* ---------- brand buttons (badge + manager) ---------- */\n.dsa-badge-body {\n  position: absolute;\n  top: calc(100% + 4px);\n  right: 0;\n  width: 280px;\n  max-width: 80vw;\n  max-height: 60vh;\n  overflow-y: auto;\n  padding: 10px 12px;\n  border: 1px solid var(--dsa-edge);\n  border-radius: 8px;\n  background: #fff;\n  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.22);\n}\n\n.dsa-badge .dsa-badge-body ul { margin: 0; padding: 0; list-style: none; background: none; }\n.dsa-brandrow {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 6px;\n  margin-top: 8px;\n  padding-top: 8px;\n  border-top: 1px solid rgba(0, 0, 0, 0.12);\n}\n.dsa-brandname { font-weight: 700; color: #0f1111; margin-right: auto; }\n.dsa-muted { color: #565959; font-size: 12px; }\n.dsa-btn {\n  font: 12px/1 \"Amazon Ember\", Arial, sans-serif;\n  padding: 5px 9px;\n  border: 1px solid #b9bdbd;\n  border-radius: 12px;\n  background: #fff;\n  color: #0f1111;\n  cursor: pointer;\n}\n.dsa-btn:hover { background: #f3f3f3; }\n.dsa-btn.dsa-trust { border-color: #2e7d32; color: #1e6b25; }\n.dsa-btn.dsa-block { border-color: #b71c1c; color: #9b1c1c; }\n.dsa-btn.dsa-on.dsa-trust { background: #2e7d32; color: #fff; }\n.dsa-btn.dsa-on.dsa-block { background: #b71c1c; color: #fff; }\n.dsa-btn.dsa-x { padding: 3px 8px; font-size: 14px; }\n.dsa-btn.dsa-reset { margin-left: auto; }\n\n.dsa-manage {\n  display: block;\n  margin: 8px 0 0 50px;\n  padding: 0;\n  border: 0;\n  background: none;\n  color: #007185;\n  font: 12px \"Amazon Ember\", Arial, sans-serif;\n  cursor: pointer;\n  text-align: left;\n}\n.dsa-manage:hover { text-decoration: underline; }\n.dsa-panel {\n  margin-top: 8px;\n  max-height: 360px;\n  overflow-y: auto;\n  font: 12px/1.4 \"Amazon Ember\", Arial, sans-serif;\n}\n.dsa-panel[hidden] { display: none; }\n.dsa-phead { margin: 8px 0 4px; font-weight: 700; font-size: 12px; }\n.dsa-plist { margin: 0; padding: 0; list-style: none; }\n.dsa-pitem {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 4px 6px;\n  padding: 4px 0;\n  border-bottom: 1px solid #eee;\n}\n.dsa-pname { font-weight: 700; margin-right: auto; word-break: break-word; }\n.dsa-ptag { font-size: 11px; padding: 1px 6px; border-radius: 8px; color: #fff; }\n.dsa-ptag.dsa-trust { background: #2e7d32; }\n.dsa-ptag.dsa-block { background: #b71c1c; }\n.dsa-pactions { display: flex; gap: 4px; width: 100%; justify-content: flex-end; }\n.dsa-pitem .dsa-btn { padding: 3px 7px; font-size: 11px; }\n.dsa-pfoot { display: flex; align-items: center; gap: 6px; margin-top: 10px; }\n\n/* ---------- promos / ad blocks between results ---------- */\n.dsa-clutter,\n.dsa-stray-head { display: none !important; }\n";
  (document.head || document.documentElement).appendChild(style);
})();

// ---- src/config.js ----
// Disenshittify Amazon \u2014 tunable lists and weights.
// Edit these to adjust how listings are scored. All matching is case-insensitive.

globalThis.DSA_CONFIG = {
  // Hide promo / ad blocks between results (Haul carousels, brand banners, video ads\u2026) while on.
  hideClutter: true,

  // Brand lists live in src/brands.js. Learned brands and your own Trust/Block choices
  // are kept in browser storage (see src/memory.js).

  // Marketing / overwrought phrases (regex source strings). Each hit costs points.
  floridPhrases: [
    "\\bunleash\\b", "\\belevate\\b", "inner chef", "\\bultimate\\b", "\\bpremium\\b",
    "perfect for", "perfect gift", "ideal gift", "gifts? for (?:mom|dad|men|women|him|her|every)",
    "every occasion", "must[- ]have", "game[- ]changer", "\\bupgraded?\\b", "\\bgifts?\\b",
    "mother's gifts?", "effortless(?:ly)?", "say goodbye", "next level", "revolutioni[sz]e",
    "masterpiece", "exquisite", "\\bdelight", "\\bhealth homemade\\b", "\\bperfectly\\b"
  ],

  // Words that look like ALL-CAPS shouting but are just acronyms or units.
  capsWhitelist: [
    "PFOA", "PTFE", "BPA", "USA", "LED", "USB", "FDA", "LFGB", "NSF", "UV", "XL", "XXL",
    "HD", "AC", "DC", "II", "III", "IV", "PRO", "MAX", "MINI", "TV"
  ],

  // Points. Positive = more trustworthy.
  weights: {
    base: 55,
    knownBrand: 22,
    blockedBrand: -26,
    gibberishBrand: -18,
    unrecognizedBrand: -6,
    noBrand: -10,
    titleOver120: -3,
    titleOver150: -6,
    titleOver200: -10,
    conciseTitle: 3,
    brackets: -4,         // per bracket symbol pair beyond the first
    bracketsCap: -15,
    florid: -5,           // per phrase
    floridCap: -15,
    shouting: -8,
    obfuscatedWord: -20,
    oddCharacters: -6,
    sentenceTitle: -5,
    keywordStuffing: -4,
    specs: 4,             // per spec type (dimensions, thickness, temperature, model no.)
    specsCap: 8,
    materialConflict: -12,
    copiedPhrase: -12,
    noReviews: -12,
    under10Reviews: -8,
    under50Reviews: -4,
    over200Reviews: 3,
    over1000Reviews: 6,
    over3000Reviews: 8,
    tooPerfect: -5,
    lowRating: -6,
    newListing: -4,
    sharedReviewPool: -8,
    sharedImage: -12,
    asinVintage: 10,      // listing 10+ years old (ASIN B00\u2026)
    asinOld: 6,           // ~2015\u20132018
    asinRecent: 2,        // ~2018\u20132020
    asinNew: -4,          // created in the last year or so
    cheapOutlier: 0,      // off: on pages mixing accessories with main products (or sorted by price) it was noise
    // Brands you rated from the badge (replace the normal brand points)
    userTrusted: 25,
    userBlocked: -40,
    // Brands learned from your searches (replace the normal brand points)
    learnedTrusted: 10,
    learnedBlocked: -20
  },

  // When a brand gets learned. "Evidence" is a listing's score with all brand points removed,
  // so a brand's own rating can't feed back into what's learned about it.
  learning: {
    blockMinListings: 2,       // different products from the brand
    blockMinSearches: 2,       // different search terms it showed up in
    blockMaxAvgEvidence: 42,   // average evidence at or below this \u2192 learned junk
    blockFlaggedShare: 0.5,    // \u2026or at least this share of its listings carry serious red flags
    trustMinListings: 3,
    trustMinSearches: 3,
    trustMinAvgEvidence: 60,
    trustMinReviews: 500,      // every listing needs at least this many reviews
    maxListingsPerBrand: 40,   // memory cap per brand
    maxBrands: 3000            // memory cap overall (least recently seen dropped first)
  },

  // Gibberish threshold for the average letter-pair log probability of a brand name.
  // English-looking words score about -2.4 to -3.0; random strings score lower.
  gibberishThreshold: -3.2,

  // Score \u2192 tier (1\u20135) cutoffs.
  tiers: [76, 60, 42, 24] // >=76 \u2192 5, >=60 \u2192 4, >=42 \u2192 3, >=24 \u2192 2, else 1
};

if (typeof module !== "undefined") module.exports = DSA_CONFIG;

;
// ---- src/brands.js ----
// Disenshittify Amazon \u2014 starter brand lists.
// These seed the scorer. The extension also learns brands as you browse, and your own
// Trust/Block choices (from the badge on each card) override everything here.
//
// Matching is case-insensitive against the brand line, or the start of the title.
// Single common words and platform names ("Apple", "Ring", "Xbox", "Kindle", "Lifetime") are left
// out on purpose: knock-off listings often start with them ("Xbox Controller Charger\u2026").

globalThis.DSA_BRANDS = {
  known: [
    // Bakeware & cookware
    "Chicago Metallic", "USA Pan", "CHEFMADE", "Nordic Ware", "Nordicware", "Wilton",
    "Fat Daddio's", "Lodge", "Calphalon", "Simply Calphalon", "Cuisinart", "KitchenAid",
    "Le Creuset", "Staub", "All-Clad", "Emile Henry", "Rachael Ray", "Farberware", "Anolon",
    "Circulon", "GoodCook", "Pyrex", "Anchor Hocking", "CorningWare", "Corelle", "OXO",
    "OXO Good Grips", "Mauviel", "de Buyer", "Matfer", "Matfer Bourgeat", "Made In Cookware",
    "Hestan", "Scanpan", "T-fal", "Tefal", "Zwilling", "Henckels", "Wusthof", "W\u00fcsthof",
    "Victorinox", "Mercer Culinary", "Winco", "Vollrath", "Libbey", "Lenox", "Ball Mason",
    "Bakers Mark", "Mrs. Anderson's", "Harold Import", "HIC Harold Import", "Norpro",
    "Fox Run", "Bellemain", "Silpat", "Ateco", "Paderno", "Cuisipro", "Microplane",
    "Joseph Joseph", "Great Jones", "Caraway", "GreenPan", "Our Place", "Misen", "Zyliss",
    "Brod & Taylor", "King Arthur", "Sassafras", "Ooni", "Baking Steel", "Doughmakers",
    "Kaiser Bakeware", "Birkmann", "St\u00e4dter", "Stadter", "RBV Birkmann", "Zenker", "Dr. Oetker", "L\u00e9ku\u00e9", "Lekue", "R\u00f6sle", "Rosle", "Tramontina",
    "Cuisinox", "Demeyere", "Viking Culinary", "Cook N Home", "Prepworks", "Chef'n", "Ninja", "Instant Pot", "Instant Brands", "Crock-Pot", "Hamilton Beach",
    "Proctor Silex", "Breville", "De'Longhi", "DeLonghi", "Nespresso", "Keurig", "Mr. Coffee",
    "Bodum", "Hario", "Chemex", "Baratza", "Bonavita", "Zojirushi", "Vitamix", "Blendtec", "NutriBullet", "Magic Bullet", "Oster", "Sunbeam", "Black+Decker",
    "Black & Decker", "Chefman", "COSORI", "Philips", "Smeg", "Rubbermaid",
    "Tupperware", "Weck", "Ziploc", "Stasher", "Weber", "Traeger",
    "Char-Broil", "Solo Stove", "Blackstone", "ThermoWorks", "Thermapen", "Taylor Precision",
    "Escali", "Etekcity", "Ozeri", "Polder",

    // Drinkware & food storage
    "Stanley", "Thermos", "Yeti", "Hydro Flask", "Owala", "Contigo", "CamelBak", "Nalgene",
    "Klean Kanteen", "S'well", "Simple Modern", "Brita", "PUR", "ZeroWater",

    // Home & cleaning
    "Amazon Basics", "AmazonBasics", "Amazon Commercial", "Amazon Brand", "Bissell", "Dyson",
    "Hoover", "Eureka", "iRobot", "Roomba", "Shark Ninja", "SharkNinja", "Miele", "K\u00e4rcher",
    "Karcher", "O-Cedar", "Libman", "Swiffer", "Clorox", "Lysol", "Mrs. Meyer's",
    "Seventh Generation", "Scotch-Brite", "3M", "Post-it", "Sterilite", "IRIS USA", "mDesign", "SimpleHuman", "Umbra", "Honeywell",
    "Levoit", "Coway", "Winix", "Blueair", "Vornado", "Lasko", "Dreo", "Frigidaire", "GE", "Whirlpool", "LG", "Samsung", "Panasonic", "Toshiba", "Brother", "Singer", "Janome", "Fiskars", "Westcott", "Duck Brand", "Gorilla Glue", "Loctite", "Elmer's", "WD-40", "Rust-Oleum", "Krylon", "Minwax",
    "Purdy", "Wooster", "Hampton Bay", "Moen", "Delta Faucet", "Kohler", "American Standard",
    "Waterpik", "Brondell", "Philips Hue", "Lutron", "Leviton", "Kasa", "TP-Link", "Wyze",
    "Eufy", "Arlo", "Blink", "Govee", "Feit Electric", "Cree", "Sylvania", "GE Lighting",
    "Energizer", "Duracell", "Rayovac", "Panasonic Eneloop", "EBL",

    // Bedding, bath, furniture
    "Mellanni", "Bedsure", "California Design Den", "Cozy Earth", "Boll & Branch", "Coyuchi",
    "Riley Home", "Snowe", "Quince", "Magic Linen", "Sleep Number", "Tempur", "Nectar", "Saatva",
    "Pottery Barn Kids", "Threshold", "Hearth & Hand", "Room Essentials", "Brielle Home",
    "Brooklinen", "Parachute", "Pottery Barn", "West Elm", "Casper", "Tempur-Pedic",
    "Zinus", "Linenspa", "Sealy", "Serta", "Beautyrest", "Utopia Bedding",
    "Utopia Towels", "Pinzon", "Martex", "Mainstays", "Better Homes & Gardens", "Sauder",
    "South Shore", "Ashley", "Signature Design by Ashley", "Stone & Beam",
    "Flash Furniture", "HON", "Herman Miller", "Steelcase", "FlexiSpot", "VIVO", "Ergotron", "Bush Furniture", "Nathan James",

    // Electronics & computing
    "Sony", "Bose", "Sennheiser", "Audio-Technica", "Shure", "JBL", "Harman Kardon",
    "Ultimate Ears", "Skullcandy", "Jabra", "Plantronics", "Poly", "Anker",
    "Soundcore", "Belkin", "Mophie", "Zagg", "OtterBox", "Spigen", "Incipio",
    "Case-Mate", "Logitech", "Razer", "Corsair", "SteelSeries", "HyperX", "Turtle Beach",
    "ASUS", "Acer", "Dell", "HP", "Lenovo", "Microsoft", "MSI", "Gigabyte", "Intel", "AMD",
    "NVIDIA", "EVGA", "Crucial", "Kingston", "SanDisk", "Western Digital", "Seagate",
    "Lexar", "PNY", "Netgear", "Linksys", "Ubiquiti", "Eero", "Synology",
    "QNAP", "APC", "CyberPower", "Tripp Lite", "Monoprice", "Cable Matters", "UGREEN",
    "Baseus", "Satechi", "Twelve South", "Native Union", "Peak Design",
    "Elgato", "Blue Yeti", "Rode", "R\u00d8DE", "Canon", "Nikon", "Fujifilm", "Olympus",
    "OM System", "Panasonic Lumix", "GoPro", "DJI", "Insta360", "Garmin", "Fitbit",
    "Suunto", "Amazfit", "Withings", "Google Nest", "Apple AirPods", "Apple iPad", "Apple iPhone", "Apple MacBook",
    "Apple Watch Series", "Apple Watch SE", "Apple Watch Ultra", "Apple AirTag",
    "Apple Magic", "Apple Pencil", "Apple TV", "Vizio", "TCL", "Hisense", "LG Electronics",
    "Epson", "Xerox", "Kodak", "Polaroid", "Fujifilm Instax", "Texas Instruments",
    "Casio", "8BitDo", "PowerA", "Hori",
    "Raspberry Pi", "Arduino", "Adafruit", "SparkFun", "Elegoo", "Creality", "Prusa",
    "Bambu Lab", "Chipolo", "Ring Video", "Ring Doorbell", "Ring Spotlight",
    "Nest Thermostat", "Nest Cam", "ecobee", "Philips Sonicare", "Oral-B", "Braun",
    "Remington", "Wahl", "Conair", "BaBylissPRO", "Revlon", "Dyson Supersonic",
    "Panasonic Arc", "Norelco", "Gillette",

    // Tools, hardware, auto
    "DeWalt", "Milwaukee", "Makita", "Bosch", "Ryobi", "Ridgid", "Craftsman",
    "Stanley Tools", "Kobalt", "Metabo", "Metabo HPT", "Hitachi", "Festool",
    "Klein Tools", "Knipex", "Wera", "Wiha", "Channellock", "Irwin", "Vise-Grip",
    "Gearwrench", "Tekton", "Crescent", "Estwing", "Leatherman", "Gerber",
    "Benchmade", "Kershaw", "Spyderco", "Buck Knives", "Fluke", "Dremel",
    "Porter-Cable", "Skil", "WORX", "Greenworks", "EGO", "Husqvarna",
    "Stihl", "Toro", "Sun Joe", "Scotts", "Miracle-Gro", "Ortho", "Rain Bird",
    "Gilmour", "Flexzilla", "Melnor", "Suncast", "Keter", "Chamberlain", "LiftMaster", "Master Lock", "Kwikset", "Schlage", "Yale", "August",
    "Armor All", "Meguiar's", "Chemical Guys", "Turtle Wax", "Rain-X",
    "Mobil 1", "Castrol", "Valvoline", "Pennzoil", "Bosch Automotive", "NOCO",
    "Schumacher", "Michelin", "Thule", "Yakima", "WeatherTech", "Husky Liners",
    "Lasfit", "Sylvania Automotive", "Philips Automotive", "Fram", "K&N", "Motorcraft",
    "ACDelco", "Gates", "Dorman", "Moog", "Monroe", "Bilstein", "Uniden",
    "Midland", "Garmin DriveSmart",

    // Outdoor, sports, travel
    "Coleman", "REI Co-op", "Patagonia", "The North Face", "Columbia", "Marmot",
    "Arc'teryx", "Osprey", "Deuter", "Gregory", "Kelty", "Big Agnes", "MSR", "Jetboil",
    "Black Diamond", "Petzl", "Nite Ize", "Fenix", "Streamlight", "Olight", "Maglite",
    "Goal Zero", "Jackery", "EcoFlow", "Bluetti", "Anker SOLIX", "Sawyer", "LifeStraw",
    "Katadyn", "Therm-a-Rest", "Sea to Summit", "Nemo", "Igloo",
    "RTIC", "Pelican", "Oakley", "Ray-Ban", "Maui Jim", "Garmin Forerunner",
    "Bowflex", "NordicTrack", "Peloton", "Schwinn", "Sunny Health & Fitness", "CAP Barbell",
    "Rogue", "Titan Fitness", "Gaiam", "Manduka", "Lululemon", "Hyperice", "Theragun",
    "TriggerPoint", "Wilson", "Spalding", "Rawlings", "Easton", "Franklin Sports",
    "Callaway", "TaylorMade", "Titleist", "Bushnell", "Vortex", "Leupold",
    "Samsonite", "Travelpro", "Briggs & Riley", "Tumi", "Delsey", "American Tourister",
    "Eagle Creek", "Herschel", "JanSport", "Eastpak", "Matein", "Swiss Gear", "SwissGear",

    // Clothing & shoes
    "Nike", "Adidas", "Under Armour", "Puma", "Reebok", "New Balance", "ASICS",
    "Brooks", "Hoka", "Saucony", "On Running", "Merrell", "Salomon", "Keen",
    "Teva", "Chaco", "Birkenstock", "Crocs", "Vans", "Skechers", "Clarks",
    "Dr. Martens", "Timberland", "Wolverine", "Red Wing", "Carhartt", "Dickies", "Levi's",
    "Wrangler", "Hanes", "Fruit of the Loom", "Gildan", "Jockey", "Calvin Klein",
    "Tommy Hilfiger", "Ralph Lauren", "Polo Ralph Lauren", "Lacoste", "Columbia Sportswear",
    "L.L.Bean", "Eddie Bauer", "Smartwool", "Darn Tough", "Bombas", "Injinji", "Amazon Essentials",
    "Goodthreads", "Daily Ritual", "Champion Athletic", "Russell Athletic", "Jerzees",
    "Wigwam", "Thorlo", "Uniqlo",

    // Health, beauty, personal care
    "Neutrogena", "CeraVe", "Cetaphil", "La Roche-Posay", "Aveeno", "Olay", "Eucerin",
    "Vanicream", "The Ordinary", "Paula's Choice", "Burt's Bees", "Aquaphor", "Vaseline",
    "Nivea", "Pantene", "Head & Shoulders", "Garnier", "L'Or\u00e9al", "L'Oreal",
    "Maybelline", "e.l.f.", "NYX", "Colgate", "Crest", "Sensodyne", "Listerine",
    "Philips Norelco", "Schick", "Bic", "Tylenol", "Advil", "Motrin",
    "Aleve", "Bayer", "Benadryl", "Zyrtec", "Claritin", "Allegra", "Flonase", "Mucinex",
    "Vicks", "Nature Made", "Nature's Bounty", "Centrum", "One A Day", "Garden of Life",
    "NOW Foods", "NOW Supplements", "Optimum Nutrition", "Vital Proteins", "Orgain",
    "Omron", "Braun ThermoScan", "iHealth", "Band-Aid", "Nexcare", "Curad",
    "Johnson & Johnson", "Kleenex", "Charmin", "Cottonelle", "Huggies", "Pampers",

    // Pets
    "Purina", "Purina Pro Plan", "Blue Buffalo", "Hill's Science Diet", "Royal Canin",
    "Merrick", "Taste of the Wild", "Greenies", "Nylabone", "KONG", "Chuckit!", "Outward Hound", "Frisco", "PetSafe", "Petmate", "Kurgo", "Ruffwear",
    "Furminator", "Tidy Cats", "Fresh Step", "Arm & Hammer", "Dr. Elsey's",
    "Seresto", "Frontline", "Nature's Miracle", "Tetra", "Fluval", "Zilla",
    "Zoo Med", "Kaytee", "Oxbow", "Vitakraft",

    // Shop vacs & cleaning equipment
    "Shop-Vac", "Shop Vac Corporation", "Vacmaster", "Koblenz", "Dustless Technologies", "Prolux",
    "WORKSHOP Wet/Dry", "Fein", "Nilfisk", "Hoover Commercial",
    "Sanitaire", "ProTeam", "Oreck", "Rug Doctor", "Bissell Commercial", "Tineco", "Roborock", "Ecovacs",
    "Dreame", "Vax", "Kenmore", "Electrolux", "Dirt Devil",

    // Musical instruments & audio gear
    "Hohner", "Fender", "Seydel", "Lee Oskar", "Suzuki Music", "Suzuki", "Special 20",
    "Yamaha", "Gibson", "Epiphone", "Ibanez", "Squier", "Gretsch", "PRS", "Taylor Guitars",
    "Martin", "C.F. Martin", "Cordoba", "Kala", "Lanikai", "D'Addario", "Ernie Ball", "Elixir",
    "Dunlop", "Jim Dunlop", "Boss", "Roland", "Korg", "Behringer", "Marshall", "Vox", "Orange Amps",
    "Peavey", "Pearl", "Ludwig", "Zildjian", "Sabian", "Meinl", "Paiste", "Vic Firth", "Promark",
    "Remo", "Evans", "Hal Leonard", "Snark", "Planet Waves", "Levy's", "Gator", "Hercules",
    "K&M", "On-Stage", "Alesis", "M-Audio", "Akai", "Novation", "Arturia", "Native Instruments",
    "Focusrite", "PreSonus", "Universal Audio", "Steinberg", "Kawai", "Nord", "Electro-Harmonix",
    "MXR", "TC Electronic", "Line 6", "Positive Grid", "Fishman", "LR Baggs", "Seymour Duncan",
    "Gemeinhardt", "Selmer", "Bach", "Jupiter", "Buffet Crampon", "Vandoren", "Rico", "Hohner Kids",
    // Fans, heaters, air conditioning
    "Bionaire", "Holmes", "Comfort Zone", "Air King", "Pelonis", "Midea", "Haier", "Whynter",
    "Hurricane", "Rowenta", "Dyson Pure", "Boneco", "Stadler Form", "Hunter Fan", "Hunter",
    "Westinghouse", "Minka-Aire", "Emerson", "Friedrich", "Keystone", "Danby", "TOSOT", "Mr. Heater",
    "Dr. Infrared Heater", "Duraflame", "Broan", "Broan-NuTone", "Panasonic WhisperCeiling",
    "iLIVING", "Air King America",
    // Strollers, car seats, nursery
    "Chicco", "Graco", "Britax", "Joie", "Bugaboo", "BOB Gear", "BOB", "Baby Jogger", "Veer",
    "Cosco", "Cosco Kids", "Safety 1st", "Maxi-Cosi", "Nuna", "Cybex", "Doona", "UPPAbaby",
    "Evenflo", "Summer Infant", "Baby Trend", "hauck", "Zoe", "Delta Children", "Dream On Me",
    "Kolcraft", "Joovy", "Diono", "Clek", "Mockingbird", "Silver Cross", "Stokke",
    "Babyzen", "Ergobaby", "BabyBj\u00f6rn", "BabyBjorn", "Fisher-Price", "Skip Hop", "Munchkin",
    "Boppy", "4moms", "Nanit", "Owlet", "Hatch Baby", "Frida", "FridaBaby", "NoseFrida",

    // Toys, kids, baby
    "LEGO", "Mattel", "Hasbro", "Melissa & Doug", "Hot Wheels", "Barbie",
    "Nerf", "Play-Doh", "Crayola", "Ravensburger", "Magna-Tiles", "Learning Resources",
    "VTech", "LeapFrog", "Philips Avent", "Dr. Brown's", "Tommee Tippee", "Infant Optics", "Little Tikes", "Step2",
    "Radio Flyer", "Schleich", "Playmobil", "Funko", "Bandai", "Spin Master",

    // Office & school
    "Sharpie", "Uni-ball", "Pentel", "Paper Mate", "BIC Cristal", "Staedtler", "Faber-Castell", "Prismacolor", "Moleskine", "Leuchtturm1917", "Rhodia",
    "Five Star", "Mead", "Avery", "Swingline", "Bostitch", "Fellowes", "Smead", "Pendaflex",
    "Rocketbook", "Quartet", "Scotch Brand", "Elmer's Glue", "Texas Instruments TI"
  ],

  // Real brands whose names are ordinary words or other companies' platforms. They count as
  // established only when the page isn't using the word as ordinary vocabulary, and never on
  // accessory titles ("Kindle Case Compatible with Kindle\u2026").
  ambiguous: [
    "Shark", "Apple", "Ring", "Nest", "Kindle", "Echo", "Roku", "Google", "Purple", "Tiger",
    "Lifetime", "Method", "Command", "Halo", "Hatch", "Fellow", "Dash", "Away", "Branch", "Tile",
    "Polar", "Lucid", "Pilot", "Zebra", "Expo", "Orbit", "Cobra", "Smith", "Costa", "Ping",
    "Nomad", "Rivet", "Uplift", "Beats", "Lee", "Hart", "Sharp", "Klein", "Gorilla", "Scotch",
    "Mothers", "Optima", "Champion", "Converse", "Coach", "Glad", "Dove", "Bounty", "Tide"
  ],

  // Throwaway / nonsense names confirmed by hand.
  blocked: [
    "Pavsrmy", "Gicyiit", "HOOMIL", "Tiawudi", "Coukre", "Yupjlia"
  ]
};

if (typeof module !== "undefined") module.exports = DSA_BRANDS;

;
// ---- src/bigrams.js ----
// Letter-pair log probabilities for English words (generated by tools/train_bigrams.py).
// Row = first letter ('^' = word start); columns = 'abcdefghijklmnopqrstuvwxyz$' ('$' = word end).
globalThis.DSA_BIGRAMS = {"^":[-2.84,-3.25,-2.65,-2.94,-3.22,-3.23,-2.94,-3.55,-3.16,-3.98,-3.79,-3.08,-2.91,-3.46,-3.59,-2.83,-3.66,-2.95,-2.47,-3.07,-3.66,-3.9,-3.68,-4.33,-4.48,-4.49,-12.22],"a":[-5.06,-3.31,-2.79,-3.21,-5.29,-4.99,-3.65,-5.06,-3.4,-5.52,-4.11,-2.28,-3.01,-2.15,-5.51,-3.32,-6.16,-2.12,-2.78,-2.08,-3.64,-3.98,-4.75,-4.99,-3.89,-5.71,-2.86],"b":[-2.28,-4.03,-3.82,-4.42,-2.24,-4.91,-4.85,-4.86,-2.54,-3.57,-4.95,-2.16,-4.26,-4.81,-2.52,-4.14,-5.42,-2.81,-2.99,-4.3,-2.5,-5.06,-5.58,-5.05,-3.68,-4.78,-2.24],"c":[-2.36,-5.29,-3.8,-4.68,-2.32,-5.26,-5.48,-2.27,-3.19,-5.91,-2.85,-3.07,-4.36,-5.34,-1.72,-4.69,-5.52,-3.23,-4.05,-2.49,-3.22,-5.26,-5.46,-6.08,-4.63,-5.48,-2.36],"d":[-2.8,-4.19,-4.46,-3.93,-1.57,-4.5,-4.68,-5.11,-2.04,-5.24,-5.28,-3.88,-4.67,-4.81,-2.87,-4.35,-5.92,-3.23,-3.34,-4.34,-3.55,-4.86,-5.32,-5.89,-4.6,-5.43,-1.35],"e":[-3.38,-4.77,-3.06,-2.62,-3.95,-4.01,-4.12,-5.37,-4.37,-6.13,-5.18,-3.02,-3.51,-2.27,-4.56,-3.97,-5.17,-1.87,-2.37,-2.94,-5.3,-4.0,-4.81,-3.49,-4.68,-5.38,-1.8],"f":[-2.81,-4.62,-4.45,-3.98,-2.59,-2.52,-4.86,-5.16,-1.85,-5.54,-5.42,-2.96,-4.32,-4.75,-2.22,-4.51,-5.21,-2.58,-3.45,-3.24,-3.05,-5.33,-4.9,-5.13,-4.3,-5.31,-2.0],"g":[-3.07,-4.78,-4.67,-4.54,-1.89,-5.17,-3.94,-3.48,-2.89,-6.03,-5.65,-3.21,-4.11,-3.38,-3.29,-4.66,-5.78,-2.75,-2.09,-4.44,-3.34,-5.15,-5.31,-5.44,-5.21,-5.16,-1.37],"h":[-1.78,-5.09,-4.99,-4.52,-1.77,-4.84,-5.4,-4.93,-2.3,-5.23,-4.84,-4.07,-4.18,-4.06,-2.15,-4.91,-5.26,-3.34,-4.32,-3.41,-3.42,-5.4,-4.96,-5.41,-4.04,-5.15,-1.77],"i":[-3.37,-3.43,-2.72,-3.31,-3.16,-3.97,-3.49,-6.03,-5.4,-5.76,-4.56,-2.8,-3.24,-1.51,-2.58,-3.86,-6.05,-3.38,-2.61,-2.57,-5.65,-3.72,-6.19,-4.56,-6.0,-3.97,-2.96],"j":[-2.28,-3.98,-3.57,-3.76,-2.26,-3.97,-4.62,-4.35,-3.01,-3.91,-4.0,-4.06,-4.02,-3.78,-2.32,-3.49,-4.24,-4.37,-3.67,-4.0,-2.61,-4.28,-4.35,-4.72,-3.91,-4.33,-1.64],"k":[-2.46,-4.74,-4.22,-4.17,-1.93,-4.5,-4.24,-3.81,-2.48,-4.76,-4.17,-3.38,-4.07,-3.88,-2.84,-4.42,-5.31,-3.63,-2.92,-4.13,-3.33,-5.06,-4.07,-5.16,-4.13,-5.0,-1.41],"l":[-2.26,-4.8,-4.69,-3.55,-1.74,-4.53,-4.95,-5.31,-1.9,-6.11,-5.0,-2.53,-4.05,-4.98,-2.49,-4.57,-6.14,-4.9,-3.39,-3.37,-3.55,-4.71,-5.9,-6.09,-3.11,-5.69,-2.06],"m":[-1.68,-3.44,-4.77,-4.21,-1.7,-4.32,-5.27,-5.57,-2.44,-5.49,-4.94,-3.98,-3.37,-4.8,-2.49,-2.54,-5.63,-4.71,-3.38,-4.33,-3.26,-5.02,-5.32,-5.27,-4.66,-5.6,-2.25],"n":[-2.75,-5.18,-2.93,-2.57,-2.51,-3.94,-2.21,-5.15,-2.99,-5.48,-4.04,-4.68,-5.21,-3.97,-3.18,-4.83,-5.86,-4.64,-2.62,-2.13,-4.01,-4.31,-5.59,-5.32,-4.86,-5.24,-1.76],"o":[-4.34,-3.79,-3.19,-3.06,-4.69,-4.21,-3.79,-5.01,-4.28,-5.54,-4.3,-2.94,-2.87,-1.68,-3.59,-3.09,-6.56,-2.04,-3.03,-3.19,-2.99,-3.58,-3.45,-4.97,-5.05,-5.32,-2.6],"p":[-2.02,-4.86,-4.3,-4.39,-1.95,-4.6,-5.07,-3.53,-3.09,-5.88,-5.01,-2.55,-4.84,-4.86,-2.54,-3.0,-5.6,-2.19,-3.46,-3.04,-3.5,-5.09,-5.13,-5.71,-3.9,-5.67,-2.26],"q":[-3.38,-3.82,-3.43,-3.4,-3.92,-4.17,-4.23,-3.46,-3.84,-4.15,-4.51,-3.94,-3.29,-3.37,-3.8,-3.54,-2.98,-3.57,-3.17,-3.16,-1.58,-4.1,-3.75,-4.28,-4.48,-4.23,-1.85],"r":[-2.28,-4.79,-3.52,-3.74,-1.73,-4.81,-4.06,-5.55,-2.39,-6.02,-4.41,-4.18,-3.64,-3.96,-2.52,-4.62,-6.28,-3.61,-2.91,-2.97,-4.03,-4.72,-5.33,-6.48,-3.92,-5.63,-1.71],"s":[-3.48,-5.64,-3.33,-4.92,-2.24,-4.91,-5.15,-3.25,-2.71,-6.23,-4.34,-4.16,-4.5,-5.13,-3.33,-3.41,-5.73,-4.15,-2.98,-1.81,-3.26,-5.39,-5.17,-6.04,-4.3,-5.4,-1.28],"t":[-2.53,-4.91,-3.92,-4.37,-1.78,-4.51,-5.62,-2.97,-1.98,-6.0,-5.44,-4.12,-4.44,-5.29,-2.82,-4.15,-6.41,-2.47,-3.03,-3.46,-3.76,-5.04,-4.86,-5.71,-3.68,-4.95,-1.87],"u":[-3.46,-3.14,-3.53,-3.38,-3.07,-3.82,-3.79,-4.89,-3.18,-5.66,-4.47,-2.62,-2.81,-2.08,-4.14,-3.2,-5.82,-2.31,-2.52,-2.27,-5.13,-5.06,-5.2,-4.21,-5.19,-5.05,-2.77],"v":[-2.07,-4.62,-4.38,-4.0,-1.16,-4.75,-4.62,-5.03,-1.86,-5.13,-4.92,-4.6,-4.39,-4.4,-3.09,-4.48,-5.28,-3.93,-4.2,-4.25,-4.59,-4.49,-4.77,-4.78,-4.82,-4.99,-2.06],"w":[-1.94,-4.46,-4.08,-3.87,-2.33,-4.24,-4.4,-3.28,-2.13,-5.55,-4.92,-3.63,-4.31,-3.15,-2.85,-4.41,-4.7,-2.93,-3.04,-4.43,-4.59,-4.69,-4.01,-4.49,-4.87,-4.9,-1.73],"x":[-3.16,-3.85,-3.01,-3.91,-2.71,-3.58,-4.41,-4.04,-2.94,-4.98,-4.85,-3.89,-3.6,-4.36,-4.14,-2.69,-4.56,-4.07,-3.51,-2.14,-4.24,-4.18,-4.4,-3.89,-3.78,-4.44,-1.36],"y":[-3.25,-4.47,-4.28,-4.37,-3.56,-4.45,-4.45,-4.79,-3.69,-5.06,-4.82,-3.73,-3.62,-3.39,-3.58,-2.65,-5.27,-3.62,-2.91,-3.24,-4.12,-4.73,-4.46,-4.94,-4.47,-4.55,-0.8],"z":[-2.67,-4.2,-4.16,-4.23,-1.71,-4.49,-4.52,-3.85,-2.75,-4.57,-4.15,-3.98,-3.93,-4.02,-3.29,-4.79,-4.19,-4.23,-4.02,-4.3,-4.07,-4.44,-4.22,-4.61,-3.94,-3.75,-1.16]};
if (typeof module !== 'undefined') module.exports = DSA_BIGRAMS;

;
// ---- src/scorer.js ----
// Disenshittify Amazon \u2014 trust scorer.
// Pure functions: no DOM access, so the same code runs in the extension and in Node tests.
//
// scorePage(listings, config, bigrams) takes the listings on one results page and returns
// a Map of listing index \u2192 { score (0\u2013100), tier (1\u20135), brand, reasons: [{ pts, text }] }.
// Several signals are page-relative (shared review pools, reused photos, phrases copied
// from established brands, price outliers), so every listing on the page is scored together.

(function (root) {
  "use strict";

  const STOPWORDS = new Set(("a an and or the of for to with in on by from at as is are " +
    "your you our it its this that be can into up").split(" "));
  const MATERIALS = ["stainless steel", "carbon steel", "alloy steel", "cast iron", "aluminum",
    "aluminium", "silicone", "ceramic", "glass", "stoneware", "copper", "titanium", "bamboo",
    "plastic", "wood", "porcelain", "enamel"];
  const TOOL_NOUNS = /^(scraper|scrapers|blade|blades|cutter|cutters|lame|knife|knives|whisk|spatula|handle|handles|rack|lid|lids|utensils?)$/i;

  // ---------- small helpers ----------

  function norm(s) {
    return (s || "")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .replace(/non-?stick/gi, "nonstick")
      .toLowerCase();
  }

  function words(s) {
    return norm(s).replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/).filter(Boolean);
  }

  function contentWords(s) {
    return words(s).filter(w => !STOPWORDS.has(w) && !/^\d/.test(w));
  }

  function median(arr) {
    if (!arr.length) return null;
    const a = arr.slice().sort((x, y) => x - y);
    const m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }

  // tag: "brand" for brand points (left out of learning evidence), "flag" for serious red flags.
  function add(reasons, pts, text, tag) {
    if (pts) reasons.push(tag ? { pts, text, tag } : { pts, text });
  }

  // Average log-probability of the letter pairs in a word, using the English model.
  function letterScore(word, bigrams) {
    const s = "^" + word.toLowerCase().replace(/[^a-z]/g, "") + "$";
    if (s.length < 4) return 0;
    const cols = "abcdefghijklmnopqrstuvwxyz$";
    let sum = 0, n = 0;
    for (let i = 0; i < s.length - 1; i++) {
      const row = bigrams[s[i]];
      const j = cols.indexOf(s[i + 1]);
      if (!row || j < 0) continue;
      sum += row[j]; n++;
    }
    return n ? sum / n : 0;
  }

  // ---------- raw card data \u2192 normalized listing ----------
  // Accepts the strings scraped from a result card. Used by both content.js and the tests.
  function normalizeListing(raw) {
    let title = (raw.title || "").replace(/\s+/g, " ").trim();
    let sponsored = !!raw.sponsored;
    if (/^sponsored\b/i.test(title)) { sponsored = true; title = title.replace(/^sponsored(\s+ad)?\s*[-\u2013\u2014:]?\s*/i, ""); }

    const rm = /([\d.]+) out of 5/.exec(raw.rating || raw.reviews || "");
    const rating = rm ? parseFloat(rm[1]) : null;

    let reviewCount = null, reviewExact = false;
    if (typeof raw.reviewCount === "number") {
      reviewCount = raw.reviewCount; reviewExact = raw.reviewExact !== false;
    } else {
      const cm = /\(([\d.,]+)\s*([KM])?\)/i.exec(raw.reviews || "");
      if (cm) {
        const n = parseFloat(cm[1].replace(/,/g, ""));
        const mult = cm[2] ? (cm[2].toUpperCase() === "K" ? 1e3 : 1e6) : 1;
        reviewCount = Math.round(n * mult);
        reviewExact = !cm[2];
      } else if (rating == null) {
        reviewCount = 0; reviewExact = true;
      }
    }

    const pm = /[\d,]+(?:\.\d+)?/.exec((raw.price || "").replace(/^[^\d]*/, ""));
    const price = pm ? parseFloat(pm[0].replace(/,/g, "")) : null;

    const im = /\/images\/I\/([^._/]+)/.exec(raw.img || "");
    const imageId = im ? im[1] : null;

    return {
      _normalized: true,
      asin: raw.asin || null,
      title,
      brandLine: (raw.brandLine || "").trim() || null,
      sponsored,
      rating,
      reviewCount,
      reviewExact,
      newListing: /new on amazon/i.test(raw.reviews || "") || !!raw.newListing,
      price,
      imageId,
      unitPrice: raw.unitPrice || null
    };
  }

  // ---------- brand detection ----------

  function matchKnown(title, list) {
    const t = norm(title);
    for (const b of list) {
      const nb = norm(b);
      if (t === nb || t.startsWith(nb + " ") || t.startsWith(nb + ",")) return b;
    }
    return null;
  }

  // Lower-case key used for remembered / voted brands.
  function brandKey(name) {
    return name ? norm(name).replace(/[^a-z0-9&'+ -]/g, "").trim() : null;
  }

  // Accessory titles that lead with someone else's brand: "Kindle Case Compatible with Kindle\u2026".
  // Only counts when the compatibility phrase points back at the title's own first word, so
  // "Anker Charger \u2026 Compatible with iPhone" still belongs to Anker.
  function isAccessoryTitle(title) {
    const lead = (title.match(/^[^\s,(]+/) || [""])[0].replace(/[^A-Za-z0-9]/g, "");
    if (lead.length < 2) return false;
    const re = new RegExp("\\b(?:compatible(?: with)?|replacement(?: for)?|fits?|for use with|works with|for)\\s+(?:[\\w-]+\\s+){0,2}?" + lead + "\\b", "i");
    return re.test(title.slice(lead.length));
  }

  // Returns { kind, name, key }. kind is one of:
  //   user-trusted | user-blocked | known | blocked | learned-trusted | learned-blocked |
  //   gibberish | unrecognized | none
  function detectBrand(listing, ctx, cfg, bigrams) {
    const b = detectBaseBrand(listing, ctx, cfg, bigrams);
    if (!b.name) return b;
    b.key = brandKey(b.name);
    const vote = cfg.userBrands && cfg.userBrands[b.key];
    if (vote === "trust" || vote === "block") return Object.assign(b, { base: b.kind, kind: "user-" + (vote === "trust" ? "trusted" : "blocked") });
    if (b.kind === "known" || b.kind === "blocked") return b;
    const learned = cfg.learnedBrands && cfg.learnedBrands[b.key];
    if (learned === "trust" || learned === "block") return Object.assign(b, { base: b.kind, kind: "learned-" + (learned === "trust" ? "trusted" : "blocked") });
    return b;
  }

  function detectBaseBrand(listing, ctx, cfg, bigrams) {
    const source = listing.brandLine || listing.title;
    if (!listing.brandLine && isAccessoryTitle(listing.title)) {
      return { kind: "none", name: null, accessory: true };
    }

    const known = matchKnown(source, cfg.knownBrands || []);
    if (known) return { kind: "known", name: known };
    const amb = matchKnown(source, cfg.ambiguousBrands || []);
    if (amb && (ctx.midTitleVocab.get(brandKey(amb).replace(/[^a-z]/g, "")) || 0) < 2) {
      return { kind: "known", name: amb };
    }
    const blocked = matchKnown(source, cfg.blockedBrands || []);
    if (blocked) return { kind: "blocked", name: blocked };

    let first;
    if (listing.brandLine) {
      first = listing.brandLine.split(/\s+/)[0];
    } else {
      first = (listing.title.match(/^[^\s,(]+/) || [""])[0];
      // Numbers / pack counts first ("3 Pcs", "2-Pack") mean no brand is named.
      if (!first || /^\d/.test(first)) return { kind: "none", name: null };
      // Amazon's own labels are never brands.
      if (/^(sponsored|new|best|top|limited|deal|overall|amazon's)$/i.test(first)) return { kind: "none", name: null };
      // A word that other titles on this page use mid-title is ordinary vocabulary, not a brand \u2014
      // unless a capitalised word nobody else uses follows it ("Air King", "Comfort Zone").
      const key = first.toLowerCase().replace(/[^a-z]/g, "");
      if (!key) return { kind: "none", name: null };
      // \u2026but a seller writing an ordinary word in capitals at the very start is naming its brand.
      const capsBrand = /^[A-Z][A-Z0-9&+'-]{3,}$/.test(first) &&
        !/^(PACK|PCS|SET|NEW|BEST|PREMIUM|UPGRADED|HEAVY|LARGE|SMALL|MINI)$/.test(first);
      if ((ctx.midTitleVocab.get(key) || 0) >= 2 && !capsBrand) {
        const second = (listing.title.split(/\s+/)[1] || "").replace(/[,.:;]+$/, "");
        const k2 = second.toLowerCase().replace(/[^a-z]/g, "");
        if (/^[A-Z][A-Za-z]+$/.test(second) && k2.length >= 3 && !ctx.midTitleVocab.get(k2) && !ctx.docFreq.get(k2 + "s")) {
          first = first + " " + second;
        } else {
          return { kind: "none", name: null };
        }
      }
    }

    const letters = first.split(/\s+/)[0].replace(/[^A-Za-z]/g, "");
    if (letters.length < 2) return { kind: "none", name: null };
    const g = gibberishCheck(letters, bigrams, cfg);
    if (g) return { kind: "gibberish", name: first, why: g };
    return { kind: "unrecognized", name: first };
  }

  // Only names that can't be pronounced count as gibberish (Pavsrmy, Yupjlia, Cadpxs, ABuff).
  // Pronounceable inventions (Tiawudi, Qiaoxi) look exactly like real foreign brands (Suzuki,
  // Xiaomi, Zojirushi), so those are left to the other evidence rather than guessed at.
  function gibberishCheck(letters, bigrams, cfg) {
    if (/^[A-Z]{2,4}$/.test(letters)) return null;                 // acronyms: JBL, LG, JDR, RTIC
    if (/^[A-Z]{2}[a-z]{2,}$/.test(letters)) return "odd capitals";  // ABuff
    const lower = letters.toLowerCase();
    const run = Math.max(0, ...(lower.match(/[bcdfghjklmnpqrstvwxz]+/g) || []).map(x => x.length));
    if (run >= 4 && !/(sch|tch|ght|str|nst|rst|ngst)/.test(lower)) return "unpronounceable";
    if (run >= 3 && letterScore(lower, bigrams) < cfg.gibberishThreshold) return "unpronounceable";
    return null;
  }

  // ---------- page context ----------

  function buildContext(listings, cfg) {
    // Vocabulary that appears after the first word of titles (document frequency).
    const midTitleVocab = new Map();
    const docFreq = new Map();
    for (const l of listings) {
      const ws = words(l.title);
      const mid = new Set(ws.slice(1).map(w => w.replace(/[^a-z]/g, "")).filter(Boolean));
      for (const w of mid) midTitleVocab.set(w, (midTitleVocab.get(w) || 0) + 1);
      for (const w of new Set(contentWords(l.title))) docFreq.set(w, (docFreq.get(w) || 0) + 1);
    }

    // Distinctive 4-word phrases from established brands' titles on this page.
    const n = listings.length || 1;
    // A phrase used by two or more different established brands is just how the category is
    // described ("2.5-Gal 2 Peak HP Wet/Dry"), not anyone's signature, so it's dropped.
    const phraseBrands = new Map(); // phrase \u2192 Set of established brands using it
    for (const l of listings) {
      const kb = matchKnown(l.brandLine || l.title, cfg.knownBrands || []);
      if (!kb) continue;
      const cw = contentWords(l.title);
      for (let i = 0; i + 4 <= cw.length; i++) {
        const g = cw.slice(i, i + 4);
        const rare = g.filter(w => (docFreq.get(w) || 0) / n < 0.25).length;
        if (rare < 2) continue;
        const key = g.join(" ");
        if (!phraseBrands.has(key)) phraseBrands.set(key, new Set());
        phraseBrands.get(key).add(brandKey(kb));
      }
    }
    const brandPhrases = new Map(); // phrase \u2192 brand
    for (const [phrase, set] of phraseBrands) {
      if (set.size === 1) {
        const owner = listings.map(l => matchKnown(l.brandLine || l.title, cfg.knownBrands || [])).find(b => b && brandKey(b) === [...set][0]);
        brandPhrases.set(phrase, owner);
      }
    }

    // Review pools and photos shared between different ASINs.
    const pools = new Map(), images = new Map();
    for (const l of listings) {
      if (l.reviewExact && l.reviewCount >= 20 && l.rating != null) {
        const k = l.rating + "|" + l.reviewCount;
        if (!pools.has(k)) pools.set(k, new Set());
        pools.get(k).add(l.asin);
      }
      if (l.imageId) {
        if (!images.has(l.imageId)) images.set(l.imageId, new Set());
        images.get(l.imageId).add(l.asin);
      }
    }

    const prices = [...new Map(listings.filter(l => l.price).map(l => [l.asin, l.price])).values()];

    return { midTitleVocab, docFreq, brandPhrases, pools, images, medianPrice: median(prices), n };
  }

  // ---------- per-listing scoring ----------

  function scoreListing(l, ctx, cfg, bigrams, brandsByAsin) {
    const W = cfg.weights;
    const reasons = [];
    const t = l.title;
    const brand = detectBrand(l, ctx, cfg, bigrams);
    brandsByAsin.set(l.asin, brand);

    // Brand
    const B = "brand";
    if (brand.kind === "user-trusted") add(reasons, W.userTrusted, "You trust " + brand.name, B);
    else if (brand.kind === "user-blocked") add(reasons, W.userBlocked, "You blocked " + brand.name, B);
    else if (brand.kind === "known") add(reasons, W.knownBrand, "Established brand: " + brand.name, B);
    else if (brand.kind === "blocked") add(reasons, W.blockedBrand, "Brand on the junk-name list: " + brand.name, B);
    else if (brand.kind === "learned-trusted") add(reasons, W.learnedTrusted, "Learned: " + brand.name + " has looked solid across your searches", B);
    else if (brand.kind === "learned-blocked") add(reasons, W.learnedBlocked, "Learned: " + brand.name + " keeps rating as junk across your searches", B);
    else if (brand.kind === "gibberish") add(reasons, W.gibberishBrand, "Brand looks like a random string: " + brand.name, B);
    else if (brand.kind === "unrecognized") add(reasons, W.unrecognizedBrand, "Unrecognized brand: " + brand.name, B);
    else if (brand.accessory) add(reasons, W.noBrand, "No brand of its own (title leads with the product it fits)", B);
    else add(reasons, W.noBrand, "No brand named", B);

    // Title length
    const len = t.length;
    if (len > 200) add(reasons, W.titleOver200, `Very long title (${len} chars)`);
    else if (len > 150) add(reasons, W.titleOver150, `Long title (${len} chars)`);
    else if (len > 120) add(reasons, W.titleOver120, `Wordy title (${len} chars)`);
    else if (len < 90) add(reasons, W.conciseTitle, "Concise title");

    // Bracket spam \u3010\u3011[]
    const brackets = (t.match(/[\u3010\[\u300c\u3014]/g) || []).length;
    if (brackets > 1) add(reasons, Math.max(W.bracketsCap, W.brackets * (brackets - 1)), `${brackets} bracketed callouts`);

    // Florid marketing language
    const florid = [];
    for (const p of cfg.floridPhrases) {
      const m = new RegExp(p, "i").exec(t);
      if (m) florid.push(m[0]);
    }
    if (florid.length) {
      add(reasons, Math.max(W.floridCap, W.florid * florid.length),
        "Marketing language: " + [...new Set(florid.map(f => f.toLowerCase()))].map(f => `"${f}"`).join(", "));
    }

    // ALL-CAPS shouting (ignoring the brand itself and acronyms)
    // Skip the first few words: brand names are often written in caps ("AMAGABELI GARDEN & HOME").
    const afterBrand = t.split(/\s+/).slice(4).join(" ");
    const caps = (afterBrand.match(/\b[A-Z]{4,}\b/g) || []).filter(w => !cfg.capsWhitelist.includes(w));
    if (caps.length >= 3) add(reasons, W.shouting, "ALL-CAPS phrases: " + caps.slice(0, 3).join(" "));

    // Obfuscated words like "Baguet-te" (a hyphen splitting a normal word)
    const ob = /\b([A-Za-z]{3,})-([A-Za-z]{1,2})\b/.exec(t);
    if (ob) {
      const joined = (ob[1] + ob[2]).toLowerCase();
      if ((ctx.midTitleVocab.get(joined) || 0) >= 1 || ctx.docFreq.has(joined)) {
        add(reasons, W.obfuscatedWord, `Deliberately broken word: "${ob[0]}"`, "flag");
      }
    }

    // Odd characters (non-breaking hyphens, zero-width, full-width punctuation)
    if (/[\u2011\u200b-\u200d\ufeff\uff01-\uff5e]/.test(t)) add(reasons, W.oddCharacters, "Unusual characters in title");

    // Sentences instead of a title
    const deAbbr = t.replace(/\b(Jr|Sr|Dr|Mr|Mrs|Ms|St|No|Vol|vs|oz|fl|ft|in|lb|lbs|Inc|Co|Ltd|approx|Pk|Qt|Gal)\./gi, "$1");
    if (/;/.test(deAbbr) || /[a-z]\.\s+[A-Z]/.test(deAbbr) || /[a-z\u00b0]\.$/.test(deAbbr)) {
      add(reasons, W.sentenceTitle, "Title written as sentences");
    }

    // Keyword stuffing: lots of "for X" uses or comma-separated fragments
    const fors = (t.match(/\bfor\b/gi) || []).length;
    const commas = (t.replace(/\([^)]*\)/g, "").match(/,/g) || []).length;
    if (fors >= 3 || commas >= 6) add(reasons, W.keywordStuffing, "Keyword stuffing");

    // Concrete specs
    let specs = 0;
    if (/\d+(?:\.\d+)?\s*(?:["\u201d\u2033]|in(?:ch(?:es)?)?\b|cm\b|mm\b)?\s*[x\u00d7]\s*\d/i.test(t) ||
        /\d+(?:\.\d+)?\s*[LWH]\s*x\s*\d/i.test(t)) specs++;
    if (/\d+(?:\.\d+)?\s*mm\s+thick|\bgauge\b|\d+\s*ga\b/i.test(t)) specs++;
    if (/\d+\s*\u00b0\s*[FC]\b/.test(t)) specs++;
    if (/\b[A-Z]{1,3}\d{3,}\b/.test(t)) specs++;
    if (specs) add(reasons, Math.min(W.specsCap, W.specs * specs), "Gives concrete specs");

    // Self-contradicting material (Amazon appends the listed material at the end of the title)
    const nt = norm(t);
    const trailing = MATERIALS.find(m => nt.endsWith(" " + m));
    if (trailing) {
      const body = nt.slice(0, nt.length - trailing.length);
      for (const m of MATERIALS) {
        if (m === trailing || trailing.includes(m) || m.includes(trailing)) continue;
        const idx = body.indexOf(m);
        if (idx < 0) continue;
        const after = body.slice(idx + m.length).trim().split(/\s+/).slice(0, 2);
        if (after.some(w => TOOL_NOUNS.test(w.replace(/[^a-z]/g, "")))) continue; // "stainless steel scraper"
        if (!/steel|aluminum|aluminium|cast iron/.test(m + trailing)) continue;   // only flag metal mix-ups
        add(reasons, W.materialConflict, `Says both "${m}" and "${trailing}"`);
        break;
      }
    }

    // Phrase lifted from an established brand's title on this page
    // (A brand you voted on keeps its original identity here, so it can't "copy" itself.)
    if ((brand.base || brand.kind) !== "known") {
      const cw = contentWords(t);
      for (let i = 0; i + 4 <= cw.length; i++) {
        const g = cw.slice(i, i + 4).join(" ");
        if (ctx.brandPhrases.has(g) && brandKey(ctx.brandPhrases.get(g)) !== brand.key) {
          add(reasons, W.copiedPhrase, `Copies phrasing from ${ctx.brandPhrases.get(g)}'s listing`, "flag");
          break;
        }
      }
    }

    // Reviews and rating
    const rc = l.reviewCount;
    if (rc === 0 || rc == null && l.rating == null) add(reasons, W.noReviews, "No reviews");
    else if (rc != null) {
      if (rc < 10) add(reasons, W.under10Reviews, `Only ${rc} review${rc === 1 ? "" : "s"}`);
      else if (rc < 50) add(reasons, W.under50Reviews, `Few reviews (${rc})`);
      else if (rc >= 3000) add(reasons, W.over3000Reviews, `Many reviews (${fmt(rc)})`);
      else if (rc >= 1000) add(reasons, W.over1000Reviews, `Many reviews (${fmt(rc)})`);
      else if (rc >= 200) add(reasons, W.over200Reviews, `Solid review count (${rc})`);
      if (l.rating != null && l.rating >= 4.9 && rc > 0 && rc < 30) {
        add(reasons, W.tooPerfect, `Near-perfect ${l.rating}\u2605 on very few reviews`);
      }
      if (l.rating != null && l.rating < 4.0 && rc >= 20) add(reasons, W.lowRating, `Low rating (${l.rating}\u2605)`);
    }
    if (l.newListing) add(reasons, W.newListing, "New on Amazon this month");

    // Listing age. Amazon hands out product IDs (ASINs) in sequence, so the ID dates the listing.
    // Throwaway sellers churn new listings; long-running products keep their old ones.
    const era = asinEra(l.asin);
    if (era === "vintage") add(reasons, W.asinVintage, "Listed on Amazon for 10+ years");
    else if (era === "old") add(reasons, W.asinOld, "Listed on Amazon since ~2015\u20132018");
    else if (era === "recent") add(reasons, W.asinRecent, "Listed on Amazon since ~2018\u20132020");
    else if (era === "new") add(reasons, W.asinNew, "Listing created in the last year or so");

    // Price far below the page median
    if (l.price && ctx.medianPrice && l.price < 0.45 * ctx.medianPrice) {
      add(reasons, W.cheapOutlier, `Priced far below similar listings ($${l.price} vs ~$${ctx.medianPrice.toFixed(0)})`);
    }

    return reasons;
  }

  // Rough age of a listing from its ASIN (B00\u2026 oldest, B0H\u2026 newest). Books (ISBNs) return null.
  function asinEra(asin) {
    if (!asin || !/^B0[0-9A-Z]{8}$/.test(asin)) return null;
    const c = asin[2];
    if (c === "0") return "vintage";                 // B00\u2026: before ~2015
    if (c >= "1" && c <= "6") return "old";          // B01\u2026\u2013B06\u2026: ~2015\u20132018
    if (c === "7" || c === "8") return "recent";     // B07\u2026, B08\u2026: ~2018\u20132020
    if (c >= "F") return "new";                      // B0F\u2026, B0G\u2026, B0H\u2026: 2025 onward
    return "mid";                                    // B09\u2026, B0B\u2026\u2013B0D\u2026: 2021\u20132024
  }

  // Amazon's unit price, e.g. "($0.13/count)", "($2.99/ounce)", "($1.01/feet)", "($0.16/fluid ounce)".
  // Returns { value, unit, label } with compatible units converted (pounds/grams \u2192 per ounce,
  // litres/millilitres \u2192 per fl oz, inches \u2192 per foot\u2026), or null when there isn't one.
  const UNIT_TABLE = [
    [/^(count|ct|each|ea|piece|pieces|pc|pcs|item|items|unit|units|tablet|tablets|capsule|capsules|softgel|softgels|gummy|gummies|serving|servings|pack|packs)$/, "count", 1],
    [/^(fl\.?\s*oz|fluid\s*ounces?|fl\s*ounces?)$/, "fl oz", 1],
    [/^(ml|milliliters?|millilitres?)$/, "fl oz", 29.5735],
    [/^(l|liters?|litres?)$/, "fl oz", 0.0295735],
    [/^(gal|gallons?)$/, "fl oz", 1 / 128],
    [/^(oz|ounces?)$/, "oz", 1],
    [/^(lb|lbs|pounds?)$/, "oz", 1 / 16],
    [/^(g|grams?)$/, "oz", 28.3495],
    [/^(kg|kilograms?)$/, "oz", 0.0283495],
    [/^(mg|milligrams?)$/, "oz", 28349.5],
    [/^(ft|foot|feet)$/, "foot", 1],
    [/^(in|inch|inches)$/, "foot", 12],
    [/^(yd|yards?)$/, "foot", 1 / 3],
    [/^(m|meters?|metres?)$/, "foot", 0.3048],
    [/^(sq\.?\s*ft|square\s*feet|square\s*foot)$/, "sq ft", 1],
    [/^(load|loads)$/, "load", 1],
    [/^(sheet|sheets)$/, "sheet", 1],
    [/^(roll|rolls)$/, "roll", 1],
    [/^(set|sets)$/, "set", 1],
    [/^(pair|pairs)$/, "pair", 1],
    [/^(dozen|doz)$/, "count", 1 / 12],
    [/^(box|boxes)$/, "box", 1],
    [/^(bottle|bottles)$/, "bottle", 1],
    [/^(bag|bags)$/, "bag", 1]
  ];
  function parseUnitPrice(text) {
    const m = /\(\s*\$\s*([\d,]+(?:\.\d+)?)\s*\/\s*(?:(\d+(?:\.\d+)?)\s*)?([A-Za-z][A-Za-z. ]{0,20}?)\s*\)/.exec(text || "");
    if (!m) return null;
    const qty = m[2] ? parseFloat(m[2]) || 1 : 1;                  // "$12.00/100 gram"
    const price = parseFloat(m[1].replace(/,/g, "")) / qty;
    const raw = m[3].toLowerCase().replace(/\s+/g, " ").trim();
    if (/^(month|mo|year|yr|week|wk|day)s?$/.test(raw)) return null;   // subscription / instalment prices
    m[1] = m[1] + "/" + (m[2] ? m[2] + " " : "");
    for (const [re, unit, perBase] of UNIT_TABLE) {
      // perBase = how many of the listed unit make one base unit (1 oz = 28.35 g, = 1/16 lb).
      if (re.test(raw)) return { value: price * perBase, unit, label: "$" + m[1] + raw };
    }
    return { value: price, unit: raw, label: "$" + m[1] + raw };
  }

  function fmt(n) {
    return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, "") + "K" : String(n);
  }

  // ---------- page-level ----------

  function scorePage(rawListings, cfg, bigrams) {
    // Always normalize scraped cards (strip "Sponsored", parse rating/price/photo), unless already done.
    const listings = rawListings.map(r => (r && r._normalized) ? r : normalizeListing(r));
    const ctx = buildContext(listings, cfg);
    const brandsByAsin = new Map();
    const reasonsByIndex = listings.map(l => scoreListing(l, ctx, cfg, bigrams, brandsByAsin));

    // Cross-listing signals need every brand resolved first.
    listings.forEach((l, i) => {
      const reasons = reasonsByIndex[i];
      const brand = brandsByAsin.get(l.asin) || { kind: "none" };

      // Same exact rating + review count on different ASINs that aren't one brand's variants
      if (l.reviewExact && l.reviewCount >= 20 && l.rating != null) {
        const group = ctx.pools.get(l.rating + "|" + l.reviewCount);
        if (group && group.size > 1) {
          const others = [...group].filter(a => a !== l.asin);
          const sameBrand = brand.name && brand.kind !== "none" &&
            others.every(a => { const b = brandsByAsin.get(a); return b && b.name === brand.name; });
          if (!sameBrand) {
            add(reasons, cfg.weights.sharedReviewPool,
              `Review count (${l.reviewCount}) pooled with ${others.length} other listing${others.length > 1 ? "s" : ""} on this page`, "flag");
          }
        }
      }

      // Main photo reused by different ASINs
      if (l.imageId) {
        const group = ctx.images.get(l.imageId);
        const others = group ? [...group].filter(a => a !== l.asin) : [];
        const sameBrand = brand.name && brand.kind !== "none" &&
          others.every(a => { const b = brandsByAsin.get(a); return b && b.key === brand.key; });
        if (group && group.size > 1 && !sameBrand) {
          add(reasons, cfg.weights.sharedImage, `Main photo reused by ${group.size - 1} other listing${group.size > 2 ? "s" : ""}`, "flag");
        }
      }
    });

    const out = new Map();
    listings.forEach((l, i) => {
      const reasons = reasonsByIndex[i];
      const raw = cfg.weights.base + reasons.reduce((s, r) => s + r.pts, 0);
      // Evidence: the score without any brand points \u2014 what learning is allowed to use.
      const evidence = Math.max(0, Math.min(100, Math.round(
        cfg.weights.base + reasons.filter(r => r.tag !== "brand").reduce((s, r) => s + r.pts, 0))));
      const flags = reasons.filter(r => r.tag === "flag").length;
      const score = Math.max(0, Math.min(100, Math.round(raw)));
      const tier = score >= cfg.tiers[0] ? 5 : score >= cfg.tiers[1] ? 4 : score >= cfg.tiers[2] ? 3 : score >= cfg.tiers[3] ? 2 : 1;
      reasons.sort((a, b) => a.pts - b.pts);
      out.set(i, { asin: l.asin, score, tier, evidence, flags, brand: brandsByAsin.get(l.asin), reasons, listing: l });
    });
    return out;
  }

  const api = { scorePage, normalizeListing, letterScore, detectBrand, brandKey, isAccessoryTitle, asinEra, gibberishCheck, parseUnitPrice };
  if (typeof module !== "undefined") module.exports = api;
  else root.DSA_SCORER = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

;
// ---- src/memory.js ----
// Disenshittify Amazon \u2014 brand memory.
// Remembers how each brand's listings have looked across your searches, and turns that into
// learned "trust" / "block" decisions. Pure functions over a plain object, so it runs in Node tests.
//
// Memory shape (stored as JSON):
// {
//   v: 1,
//   brands: {
//     "<brand key>": {
//       name: "Display Name",
//       seen: 1698000000000,                 // last time seen (ms)
//       gib: 0|1,                            // brand name looked like gibberish
//       queries: ["baguette tray", ...],     // distinct searches it appeared in
//       items: { "<ASIN>": [evidence, reviews, flags] }
//     }
//   },
//   votes: { "<brand key>": "trust" | "block" },   // your choices, never overwritten by learning
//   names: { "<brand key>": "Display Name" }       // display names for voted brands
// }

(function (root) {
  "use strict";

  function emptyMemory() {
    return { v: 1, brands: {}, votes: {}, names: {} };
  }

  function sanitize(mem) {
    if (!mem || typeof mem !== "object" || mem.v !== 1) return emptyMemory();
    mem.brands = mem.brands || {};
    mem.votes = mem.votes || {};
    mem.names = mem.names || {};
    return mem;
  }

  function normQuery(q) {
    return (q || "").toLowerCase().replace(/\s+/g, " ").trim().slice(0, 80);
  }

  // Record one scored results page. `results` is the Map returned by scorePage.
  function recordPage(mem, results, query, rules, now) {
    mem = sanitize(mem);
    const q = normQuery(query);
    now = now || Date.now();
    for (const r of results.values()) {
      const b = r.brand;
      if (!b || !b.key || !r.asin) continue;
      const base = b.base || b.kind;           // what the brand looked like before votes/learning
      if (base === "none") continue;
      let e = mem.brands[b.key];
      if (!e) e = mem.brands[b.key] = { name: b.name, seen: now, gib: 0, queries: [], items: {} };
      e.name = e.name || b.name;
      e.seen = now;
      if (base === "gibberish") e.gib = 1;
      if (q && !e.queries.includes(q)) {
        e.queries.push(q);
        if (e.queries.length > 20) e.queries.shift();
      }
      const reviews = r.listing && r.listing.reviewCount != null ? r.listing.reviewCount : 0;
      e.items[r.asin] = [r.evidence, reviews, r.flags];
      const asins = Object.keys(e.items);
      if (asins.length > rules.maxListingsPerBrand) delete e.items[asins[0]];
    }
    prune(mem, rules);
    return mem;
  }

  function prune(mem, rules) {
    const keys = Object.keys(mem.brands);
    if (keys.length <= rules.maxBrands) return;
    keys.sort((a, b) => mem.brands[a].seen - mem.brands[b].seen);
    for (const k of keys.slice(0, keys.length - rules.maxBrands)) {
      if (!mem.votes[k]) delete mem.brands[k];
    }
  }

  // Decide what a brand has earned from what's been seen. Returns "trust" | "block" | null
  // and a short explanation.
  function judge(entry, rules) {
    const items = Object.values(entry.items || {});
    const n = items.length;
    const searches = (entry.queries || []).length;
    if (!n) return { verdict: null };
    const avg = items.reduce((s, it) => s + it[0], 0) / n;
    const flagged = items.filter(it => it[2] > 0).length;
    const minReviews = Math.min(...items.map(it => it[1]));
    const stats = { listings: n, searches, avgEvidence: Math.round(avg), flagged, minReviews };

    if (n >= rules.blockMinListings && searches >= rules.blockMinSearches) {
      if (avg <= rules.blockMaxAvgEvidence) return { verdict: "block", why: "low ratings", stats };
      if (flagged / n >= rules.blockFlaggedShare) return { verdict: "block", why: "repeated red flags", stats };
    }
    if (!entry.gib && n >= rules.trustMinListings && searches >= rules.trustMinSearches &&
        avg >= rules.trustMinAvgEvidence && flagged === 0 && minReviews >= rules.trustMinReviews) {
      return { verdict: "trust", why: "consistently solid", stats };
    }
    return { verdict: null, stats };
  }

  // Map of brand key \u2192 "trust" | "block" for every brand that has earned a verdict.
  function learnedBrands(mem, rules) {
    mem = sanitize(mem);
    const out = {};
    for (const [k, e] of Object.entries(mem.brands)) {
      const j = judge(e, rules);
      if (j.verdict) out[k] = j.verdict;
    }
    return out;
  }

  function setVote(mem, key, name, vote) {
    mem = sanitize(mem);
    if (vote === "trust" || vote === "block") {
      mem.votes[key] = vote;
      mem.names[key] = name || mem.names[key] || key;
    } else {
      delete mem.votes[key];
      delete mem.names[key];
    }
    return mem;
  }

  // Forget what was learned about a brand (keeps your vote, if any).
  function forget(mem, key) {
    mem = sanitize(mem);
    delete mem.brands[key];
    return mem;
  }

  const api = { emptyMemory, sanitize, recordPage, judge, learnedBrands, setVote, forget };
  if (typeof module !== "undefined") module.exports = api;
  else root.DSA_MEMORY = api;
})(typeof globalThis !== "undefined" ? globalThis : this);

;
// ---- src/content.js ----
// Disenshittify Amazon \u2014 content script for search results pages.
// Adds a toggle above the left-hand filters. When on, every result card is scored,
// tinted green \u2192 yellow \u2192 red by trust, and the results are re-sorted most-trusted first.
// Each card's badge lets you trust or block its brand; brands are also learned across searches.

(function () {
  "use strict";

  const ext = globalThis.browser || globalThis.chrome;
  const CFG = globalThis.DSA_CONFIG;
  const BRANDS = globalThis.DSA_BRANDS;
  const BIGRAMS = globalThis.DSA_BIGRAMS;
  const SCORER = globalThis.DSA_SCORER;
  const MEMORY = globalThis.DSA_MEMORY;
  const CARD_SEL = 'div[data-component-type="s-search-result"]';
  const KEY_ENABLED = "dsaEnabled";
  const KEY_SORT = "dsaSort";                 // "trust" | "unit" | null (Amazon's own sort)
  const KEY_FEATURED_FOR = "dsaFeaturedFor";  // search where you picked Amazon's raw "Featured"
  const KEY_OLD_UNIT_SORT = "dsaUnitSort";    // v0.4.x
  const KEY_MEMORY = "dsaMemory";

  let enabled = false;
  let lastResults = null;   // last scoring, for refreshing the status line
  let lastPromoCount = 0;
  let sortChoice = null;    // "trust" | "unit" chosen in the Sort by menu (kept across searches), or null
  let featuredFor = "";     // you picked Amazon's "Featured" for this search term
  let memory = MEMORY.emptyMemory();
  let learned = {};
  let snapshot = null;      // { order: Map(container \u2192 children), cards: Set } \u2014 for restoring
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
    } catch (e) { /* storage full or blocked \u2014 carry on without saving */ }
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
    // same block ("Vinyl Record Player, Fully Automatic\u2026"); that isn't part of the title.
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
    const hue = Math.round(Math.max(0, Math.min(100, score)) * 1.2); // 0 red \u2192 60 yellow \u2192 120 green
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
      button(current === "trust" ? "Trusted \u2713" : "Trust", current === "trust" ? "dsa-on dsa-trust" : "dsa-trust",
        () => { reopenAsin = result.asin; vote(b.key, b.name, current === "trust" ? null : "trust"); }),
      button(current === "block" ? "Blocked \u2713" : "Block", current === "block" ? "dsa-on dsa-block" : "dsa-block",
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
      el("summary", null, `Trust ${result.tier}/5`, el("span", { class: "dsa-score" }, ` \u00b7 ${result.score}`)));
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
          `${r.pts > 0 ? "+" : "\u2212"}${Math.abs(r.pts)}  ${r.text}`));
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

  // ---------- promos and ad blocks ----------
  // Amazon fills the results grid with full-width blocks that aren't results: sponsored brand
  // banners and videos, "Explore the collection", Amazon Haul's "Crazy-good finds", "Brands related
  // to your search", stray "Sponsored Ad" boxes\u2026 Rather than chase each one, everything in the
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

      const raws = list.map(scrapeCard);
      const results = SCORER.scorePage(raws, scoringConfig(), BIGRAMS);

      // Learn from this page (uses brand-free evidence, so it can't reinforce itself).
      memory = MEMORY.recordPage(memory, results, currentQuery(), CFG.learning);
      refreshLearned();
      saveMemory();

      // Decorate every card, and hide repeat placements of the same product
      // (keeping the organic copy over the sponsored one).
      const keep = new Map();
      list.forEach((card, i) => {
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
      // default order \u2014 a sort you picked on Amazon is left alone (colours and badges stay either way).
      restoreOrder();
      const mode = currentMode();
      if (mode !== "amazon") {
        const order = mode === "unit"
          ? unitOrder(list, raws, results)
          : list.map((card, i) => ({ card, i, score: results.get(i).score })).sort((a, b) => b.score - a.score || a.i - b.i);
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
  //   Disenshittified: Trust   \u2014 most trusted first. Also what a fresh search shows by default.
  //   Disenshittified: $/count \u2014 cheapest per unit first.
  //   Amazon's own sorts       \u2014 Amazon's order, with colours and badges. Picking "Featured" shows
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
      status.textContent = promosRemoved ? "Off \u00b7 reload to bring back the hidden promos" : "Off";
    }
    else {
      // Count what's actually on screen (hidden repeat placements don't count).
      const visible = cards().filter(c => c.dataset.dsaScored && !c.classList.contains("dsa-dupe"));
      const tiers = [0, 0, 0, 0, 0, 0];
      for (const c of visible) tiers[+c.dataset.dsaTier]++;
      const extras = [];
      if (hidden) extras.push(`${hidden} promo${hidden === 1 ? "" : "s"} removed`);
      if (mode === "amazon") extras.push("Amazon's order");
      if (mode === "unit") extras.push("ordered by $/count");
      status.textContent = `${visible.length} rated \u00b7 ${tiers[5] + tiers[4]} trusted \u00b7 ${tiers[1]} junk` +
        (extras.length ? " \u00b7 " + extras.join(" \u00b7 ") : "");
    }
    updateManageLabel();
  }

  function updateManageLabel() {
    const mb = document.querySelector("#dsa-toggle .dsa-manage");
    if (mb) {
      const c = brandCounts();
      mb.textContent = `${panelOpen ? "\u25be" : "\u25b8"} Brands: ${c.yours} yours \u00b7 ${c.learned} learned`;
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
          [button("\u00d7", "dsa-x", () => vote(k, null, null))]));
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
        item.title = `${j.why || ""} \u2014 ${j.stats.listings} listings across ${j.stats.searches} searches, average ${j.stats.avgEvidence} before brand points`;
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
    if (!document.querySelector(CARD_SEL)) return;
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
      placeToggle();
      const input = document.querySelector("#dsa-toggle .dsa-main");
      if (input) input.checked = enabled;
      if (enabled) installSortOption();
      if (enabled && cards().some(c => !c.dataset.dsaScored)) apply();
      else if (enabled && CFG.hideClutter !== false && removeClutter() !== lastPromoCount) {
        lastPromoCount = promosRemoved;
        updateStatus(lastResults, currentMode(), promosRemoved);
      }
    }, 350);
  }

  // Clicking anywhere else closes an open badge.
  document.addEventListener("click", e => {
    if (!e.target.closest || !e.target.closest(".dsa-badge")) {
      document.querySelectorAll(".dsa-badge[open]").forEach(b => { b.open = false; });
    }
  });

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
    } catch (e) { /* site storage blocked \u2014 nothing to clean */ }
    if ((await storeGet(KEY_OLD_UNIT_SORT, false)) === true && (await storeGet(KEY_SORT, undefined)) === undefined) {
      storeSet(KEY_SORT, "unit");
    }
    storeSet(KEY_OLD_UNIT_SORT, false);
  }

  migrateOldSettings().then(() => Promise.all([storeGet(KEY_ENABLED, false), storeGet(KEY_MEMORY, null),
    storeGet(KEY_SORT, null), storeGet(KEY_FEATURED_FOR, "")])).then(([on, mem, choice, featured]) => {
    enabled = !!on;
    sortChoice = choice === "trust" || choice === "unit" ? choice : null;
    featuredFor = typeof featured === "string" ? featured : "";
    memory = MEMORY.sanitize(mem);
    refreshLearned();
    placeToggle();
    if (enabled) { installSortOption(); apply(); }
    new MutationObserver(onMutations).observe(document.body, { childList: true, subtree: true });
  });
})();
