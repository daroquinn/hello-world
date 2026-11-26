// Builds data/seasons-tx.js from the seasonalfoodguide.org Texas data.
// Usage: node tests/gen-seasons.js texas.json data/seasons-tx.js
// (texas.json = the guide's produce records that have a "TX" entry, taken from its site data.)
const fs = require('fs');
const [txPath, outPath] = process.argv.slice(2);
const tx = JSON.parse(fs.readFileSync(txPath, 'utf8'));
const { CATALOG } = require(require('path').join(__dirname, '../data/catalog.js'));
const ids = new Set(CATALOG.map((i) => i.id));
// Site item -> catalog item ids (fresh forms only; canned/frozen/dried versions are not seasonal)
const MAP = {
  'Apples': ['apples'], 'Arugula': ['arugula'], 'Asparagus': ['asparagus'], 'Basil': ['basil'], 'Beets': ['beets'],
  'Black Eyed Peas': ['black_eyed_peas'], 'Blackberries': ['blackberries'], 'Blueberries': ['blueberries'], 'Bok Choy': ['bok_choy'],
  'Broccoli': ['broccoli'], 'Brussels Sprouts': ['brussels_sprouts'], 'Cabbage': ['cabbage', 'red_cabbage', 'napa'], 'Cantaloupe': ['cantaloupe'],
  'Cardoons': ['cardoons'], 'Carrots': ['carrots'], 'Cauliflower': ['cauliflower'], 'Celery': ['celery'], 'Celery Root': ['celery_root'],
  'Chard': ['swiss_chard'], 'Cherries': ['cherries'], 'Chicories': ['radicchio'], 'Chile Peppers': ['serrano', 'thai_chili', 'jalapeno', 'poblano'],
  'Chives': ['chives'], 'Cilantro': ['cilantro'], 'Collard Greens': ['collards'], 'Corn': ['corn_ears'], 'Cucumbers': ['cucumber'],
  'Endive': ['endive'], 'Fava Beans': ['fava_beans'], 'Figs': ['figs'], 'Garlic': ['garlic'], 'Garlic Scapes': ['garlic_scapes'],
  'Gooseberries': ['gooseberries'], 'Grapefruit': ['grapefruit'], 'Grapes': ['grapes'], 'Green Beans': ['green_beans'], 'Green Onions': ['scallions'],
  'Ground Cherries': ['ground_cherries'], 'Horseradish': ['horseradish'], 'Jicama': ['jicama'], 'Kale': ['kale'], 'Kohlrabi': ['kohlrabi'],
  "Lamb's Quarters": ['lambs_quarters'], 'Leeks': ['leeks'], 'Lemons': ['lemon'], 'Lettuce': ['romaine', 'butter_lettuce'],
  'Loquats': ['loquats'], 'Mandarins': ['mandarins'], 'Melons': ['honeydew'], 'Mint': ['mint'], 'Mushrooms': ['white_mushrooms', 'cremini'],
  'Mustard Greens': ['mustard_greens'], 'Nectarines': ['nectarines'], 'Nopales': ['nopales'], 'Okra': ['okra'], 'Onions': ['yellow_onion', 'red_onion'],
  'Oranges': ['orange'], 'Oregano': ['oregano_fresh'], 'Parsley': ['parsley'], 'Pawpaw': ['pawpaw'], 'Pea Shoots': ['pea_shoots'],
  'Peaches': ['peaches'], 'Pears': ['pears'], 'Peas': ['snap_peas'], 'Pecans': ['pecans'], 'Peppers': ['bell_pepper', 'green_bell_pepper'],
  'Persimmons': ['persimmons'], 'Plums': ['plums'], 'Pomegranates': ['pomegranates'], 'Potatoes': ['potatoes'], 'Pummelo': ['pummelo'],
  'Pumpkin': ['pie_pumpkin'], 'Purslane': ['purslane'], 'Quince': ['quince'], 'Radicchio': ['radicchio'], 'Rapini': ['rapini'],
  'Raspberries': ['raspberries'], 'Rosemary': ['rosemary'], 'Sage': ['sage'], 'Salsify': ['salsify'], 'Shallots': ['shallots'],
  'Shell Beans': ['shell_beans'], 'Sorrel': ['sorrel'], 'Spinach': ['spinach'], 'Sprouts': ['sprouts'], 'Strawberries': ['strawberries'],
  'Summer Squash': ['yellow_squash'], 'Sunchokes': ['sunchokes'], 'Sweet Potatoes': ['sweet_potatoes'], 'Tangerines': ['tangerines'],
  'Tarragon': ['tarragon'], 'Thyme': ['thyme_fresh'], 'Tomatillos': ['tomatillos'], 'Tomatoes': ['tomatoes', 'cherry_tomatoes'],
  'Turnips': ['turnips'], 'Watercress': ['watercress'], 'Watermelon': ['watermelon'], 'Winter Squash': ['butternut', 'kabocha'], 'Zucchini': ['zucchini'],
};
// Not tagged: umbrella categories, and items only stocked here in shelf-stable form.
const SKIP = new Set(['Brambles', 'Citrus', 'Chickpeas', 'Lavender', 'Lima Beans', 'Peanuts', 'Pigeon Peas']);
const seasons = {};
const unmapped = [];
for (const d of tx) {
  if (SKIP.has(d.name)) continue;
  const targets = MAP[d.name];
  if (!targets) { unmapped.push(d.name); continue; }
  for (const id of targets) {
    if (!ids.has(id)) throw new Error('unknown catalog id ' + id);
    const set = new Set([...(seasons[id] || []), ...d.states.TX.seasons]);
    seasons[id] = [...set].sort((a, b) => a - b);
  }
}
if (unmapped.length) throw new Error('unmapped: ' + unmapped.join(', '));
const lines = Object.keys(seasons).sort().map((id) => `    ${id}: [${seasons[id].join(',')}],`).join('\n');
fs.writeFileSync(outPath, `/*
 * When produce is in season in Texas, by half-month period:
 *   1 = early January (1st-15th), 2 = late January (16th-end), ... 24 = late December.
 * Source: Seasonal Food Guide (seasonalfoodguide.org, a FoodPrint / GRACE Communications
 * Foundation project), Texas data, retrieved November 2026. Each catalog item takes the
 * season of the guide entry it belongs to (e.g. jalapeños use "Chile Peppers").
 * Regenerate with the script in tests/ if the guide changes.
 */
(function (root) {
  const SEASONS_TX = {
${lines}
  };
  // Period for a date: same rule as the guide (days 1-15 = early, 16+ = late).
  function periodFor(date) { return date.getMonth() * 2 + (date.getDate() <= 15 ? 1 : 2); }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function periodName(p) { return (p % 2 ? 'Early ' : 'Late ') + MONTHS[Math.floor((p - 1) / 2)]; }
  function inSeason(itemId, period) { const s = SEASONS_TX[itemId]; return !!s && s.includes(period); }
  const api = { SEASONS_TX, periodFor, periodName, inSeason };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_SEASONS = api;
})(typeof window !== 'undefined' ? window : globalThis);
`);
console.log('items with seasons:', Object.keys(seasons).length);
