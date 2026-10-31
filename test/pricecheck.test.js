// Google Shopping matching: model numbers from Amazon titles, and which Google results are the
// identical item. Cases are real titles from live Amazon and Google Shopping pages (2026-10-28).
// Run: node test/pricecheck.test.js
const P = require("../src/pricecheck.js");
let fails = 0;
const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  ${name}`); if (!ok) fails++; };

const models = [
  ["DEWALT 20V MAX Drill and Impact Driver (DCK240C2)", "DCK240C2"],
  ["BLACK+DECKER 20V MAX* POWERCONNECT 1/4 in. Cordless Impact Driver Kit (BDCI20C)", "BDCI20C"],
  ["Milwaukee 3453-20 12V Fuel 1/4\" Cordless Hex Impact Driver (Bare Tool)", "3453-20"],
  ["RYOBI ONE+ 18V Cordless 1/4 in. Impact Driver - 1,800 in-lbs Torque, 0-3,400 IPM, Tool Only (Battery Not Included) - PCL235B", "PCL235B"],
  ["Makita XDT18ZB 18V LXT Lithium-Ion Sub-Compact Brushless Cordless Impact Driver, Tool Only, Black", "XDT18ZB"],
  ["CRAFTSMAN V20 MAX Cordless Drill and Impact Driver, 2 Batteries, Charger", null],
  ["Milwaukee Electric - M18 Fuel. 1/4 HEX Impact Driver", null],
  ["Cordless Impact Wrench 1/2\", 1600N.m 3-in-1 Brushless Impact Wrench", null],
  ["Seesii Brushless Impact Wrench, High Torque (1475FT-LBS) 1/2 inch", null],
  ["Greenworks 24V Drill/Driver Combo, 65W USB-C Fast Charger(3-Port)", null]
];
for (const [t, m] of models) check(`model of "${t.slice(0, 50)}…" is ${m}`, P.modelFromTitle(t) === m);

const A787 = "DEWALT 20V MAX Impact Driver, 1/4 Inch, Battery and Charger Included (DCF787D1)";
const A850 = "DEWALT ATOMIC 20V MAX 1/4 in. Brushless Cordless Impact Driver Kit with Battery and Charger Included (DCF850P1)";
const cases = [
  [true,  "dewalt-dcf787d1-impact-driver-kit-battery-included-20-v-2-ah-14-in-drive-hex-drive", "DCF787D1", A787],
  [true,  "DEWALT DCF787D1 Impact Driver Kit with 2Ah Battery and Charger", "DCF787D1", A787],
  [false, "DEWALT 20V MAX Brushless Cordless 1/4 Inch Impact Driver Kit & Series 100pc Drill Driver Set - DCF787D1-DWAFE100SET", "DCF787D1", A787],
  [false, "DeWalt DCF787D1 20V MAX 1/4 in. Impact Driver Kit W/ DCBL722B Handheld Blower", "DCF787D1", A787],
  [false, "DeWalt DCB245-2C 20V MAX 4.0Ah and 5.0Ah Battery Starter Kit W/ DCF787D1 Impact Driver Kit", "DCF787D1", A787],
  [false, "DeWalt 20V MAX* Brushless Cordless Impact Driver Kit DCF787C1", "DCF787D1", A787],
  [false, "Charger for Dewalt DCF787D1", "DCF787D1", A787],
  [false, "Dewalt DCF850P1 Battery Replacement 4.0Ah", "DCF850P1", A850],
  [true,  "Safford Equipment DeWalt 20V Max Atomic Brushless Cordless 3-Speed 1/4\" Impact Driver Kit #DCF850P1", "DCF850P1", A850],
  [false, "Ryobi PCL235B Battery", "PCL235B", models[3][0]],
  [true,  "DeWalt 20V MAX Drill / Impact Driver Combo Kit DCK240C2", "DCK240C2", models[0][0]],
  [false, "Milwaukee 3453-20-48-59-2424 M12 FUEL 12V Lithium-Ion Brushless Cordless", "3453-20", models[2][0]],
  [false, "Milwaukee 48-11-2425 M12 Battery-2Pk w/ FREE 3453-20 Impact Driver", "3453-20", models[2][0]],
  [true,  "Milwaukee Tool 3453-20 M12 FUEL 1/4\" HEX IMPACT DRIVER BARE", "3453-20", models[2][0]],
  [true,  "Makita 18V LXT Brushless Sub-Compact Lithium-Ion Cordless Impact Driver xdt18zb", "XDT18ZB", models[4][0]]
];
for (const [exp, g, m, a] of cases) check(`${exp ? "identical" : "not identical"}: "${g.slice(0, 60)}"`, P.isIdentical(g, m, a) === exp);

// UPCitemdb answer (shape from a live search for "DEWALT DCF845B", 2026-10-28)
const now = 1793224173000;
const A845 = "DEWALT 20V MAX XR Impact Driver, 1/4 Inch High Torque Brushless 3 Speed Premium Cordless with LED Light, Extended Runtime, Tool Only (DCF845B)";
const upc = { code: "OK", items: [
  { title: "DEWALT 20V MAX XR Impact Driver Brushless 1/4 3-Speed Bare Tool Only (DCF845B)", model: "DCF845B", offers: [
    { merchant: "Wal-Mart.com", domain: "walmart.com", price: 89, condition: "New", availability: "Out of Stock", link: "https://www.upcitemdb.com/norob/alink/?id=1", updated_t: 1790624238 }] },
  { title: "DeWalt DCF845B 20V MAX XR Cordless Brushless 1/4 3-Speed Impact Driver (Bare Tool)", model: "DCF845B", offers: [
    { merchant: "Wal-Mart.com", domain: "walmart.com", price: 90, condition: "New", link: "https://www.upcitemdb.com/norob/alink/?id=2", updated_t: 1714984445 }] },
  { title: "DEWALT 20V MAX XR 1/4 in. Brushless Impact Driver (DCF845B)", model: "DCF845B", offers: [
    { merchant: "Home Depot", domain: "homedepot.com", price: 129, condition: "New", link: "https://www.upcitemdb.com/norob/alink/?id=3", updated_t: 1793075043, title: "20V MAX XR Cordless Brushless 1/4 in. 3-Speed Impact Driver " },
    { merchant: "WalMart Canada", domain: "walmart.ca", price: 95, condition: "New", link: "https://www.upcitemdb.com/norob/alink/?id=4", updated_t: 1786582466 },
    { merchant: "Wal-Mart.com", domain: "walmart.com", price: 95.28, condition: "New", link: "https://www.upcitemdb.com/norob/alink/?id=5", updated_t: 1790627354 }] },
  { title: "Dewalt DCF845B Battery Replacement 5.0Ah", model: "DCF845B-BAT", offers: [
    { merchant: "BatteryShip", domain: "batteryship.example", price: 40, condition: "New", link: "https://www.upcitemdb.com/norob/alink/?id=6", updated_t: 1793075043 }] }] };
const pick = P.pickOffer(upc, "DCF845B", A845, now, 60);
check("UPCitemdb: cheapest identical offer that's new, in stock, US and seen in the last 60 days", pick && pick.m === "Walmart" && pick.p === "$95.28" && pick.u.endsWith("id=5"));
check("UPCitemdb: nothing identical → null", P.pickOffer({ code: "OK", items: [upc.items[3]] }, "DCF845B", A845, now, 60) === null);

console.log(fails ? `\n${fails} failed` : "\nall passed");
process.exit(fails ? 1 : 0);
