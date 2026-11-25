/*
 * Ingredient catalog with ESTIMATED H-E-B prices (Austin, TX).
 *
 * These are hand-entered approximations of typical H-E-B shelf prices.
 * They are NOT pulled from heb.com and are NOT verified against the
 * Riverside Drive store. Edit them in the app's "Prices & Pantry" tab;
 * your edits are saved in your browser and override these defaults.
 *
 * Fields
 *   id       unique key
 *   name     display name
 *   cat      store section (used to group the shopping list)
 *   base     unit all amounts are converted into: 'g' | 'ml' | 'each'
 *   pkg      what you actually buy: { size (in base units), label, price }
 *   sold     'pkg' (whole packages/units) or 'weight' (loose, priced per pkg.size)
 *   minBuy   for 'weight' items: smallest realistic purchase, in base units
 *   conv     extra conversions: base units per 1 of a unit (cup, tbsp, each, clove, g, ml…)
 *   aliases  phrases that identify this item in recipe text (lower case)
 *   unitLabel  how to name 'each' amounts (e.g. 'cloves')
 *   staple   true = assumed already in your pantry until you say otherwise
 *   perish   0–1, how much a leftover matters (1 = spoils fast). Defaults by section.
 *   dflt     amount (base units) assumed when a recipe gives no quantity
 *   note     shown next to the item (e.g. availability warnings)
 */
(function (root) {
  const C = [];
  const add = (o) => C.push(o);
  const spice = (id, name, aliases, jarG, price, tspG, extra = {}) =>
    add({ id, name, cat: 'Spices', base: 'g', pkg: { size: jarG, label: `${(jarG / 28.35).toFixed(1)} oz jar`, price }, conv: { tsp: tspG }, aliases, dflt: tspG, ...extra });

  // ---------- Produce ----------
  add({ id: 'beets', name: 'Beets', cat: 'Produce', base: 'g', sold: 'weight', pkg: { size: 454, label: 'per lb (loose)', price: 1.48 }, conv: { each: 150 }, aliases: ['beetroot', 'beets', 'beet', 'golden beets'] });
  add({ id: 'red_onion', name: 'Red onion', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.89 }, conv: { g: 1 / 200, cup: 1 }, aliases: ['red onion'], perish: 0.4 });
  add({ id: 'yellow_onion', name: 'Yellow onion', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.69 }, conv: { g: 1 / 220, cup: 0.8 }, aliases: ['yellow onion', 'brown onion', 'brown/yellow onion', 'yellow/brown onion', 'white onion', 'onion'], perish: 0.4 });
  add({ id: 'garlic', name: 'Garlic', cat: 'Produce', base: 'each', unitLabel: 'cloves', pkg: { size: 10, label: 'head (~10 cloves)', price: 0.5 }, conv: { clove: 1, head: 10, tsp: 1, tbsp: 3, g: 1 / 5 }, aliases: ['garlic cloves', 'garlic clove', 'garlic'], perish: 0.4, dflt: 1 });
  add({ id: 'ginger', name: 'Ginger root', cat: 'Produce', base: 'g', sold: 'weight', minBuy: 50, pkg: { size: 454, label: 'per lb (loose)', price: 3.98 }, conv: { inch: 15, piece: 30, each: 30, tbsp: 6, tsp: 2 }, aliases: ['ginger', 'fresh ginger'], perish: 0.6 });
  add({ id: 'serrano', name: 'Serrano / fresh chili', cat: 'Produce', base: 'each', unitLabel: 'chilies', pkg: { size: 1, label: 'each (loose)', price: 0.12 }, conv: { g: 1 / 15 }, aliases: ['serrano', 'serrano pepper', 'green chili pepper', 'green chili', 'red chili', 'green or red chili', 'chili pepper', 'jalapeno', 'chili'], perish: 0.6 });
  add({ id: 'thai_chili', name: 'Thai chili', cat: 'Produce', base: 'each', unitLabel: 'chilies', pkg: { size: 1, label: 'each (loose)', price: 0.08 }, aliases: ['thai chili', 'birds eye chili', "bird's eye chili"], perish: 0.6 });
  add({ id: 'cilantro', name: 'Cilantro', cat: 'Produce', base: 'g', pkg: { size: 40, label: 'bunch', price: 0.79 }, conv: { cup: 16, handful: 10, bunch: 40, sprig: 1 }, aliases: ['cilantro', 'coriander/cilantro', 'cilantro/coriander', 'coriander leaves', 'fresh coriander'], dflt: 10 });
  add({ id: 'lime', name: 'Lime', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.33 }, conv: { ml: 1 / 30, wedge: 0.25 }, aliases: ['lime', 'lime juice', 'lime wedges'] });
  add({ id: 'lemon', name: 'Lemon', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.69 }, conv: { ml: 1 / 45 }, aliases: ['lemon juice', 'lemon', 'lemon zest', 'freshly squeezed lemon juice'] });
  add({ id: 'orange', name: 'Orange', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.99 }, conv: { ml: 1 / 80 }, aliases: ['orange', 'oranges', 'orange juice', 'orange zest'], dflt: 1 });
  add({ id: 'kale', name: 'Kale', cat: 'Produce', base: 'g', pkg: { size: 227, label: 'bunch (~8 oz)', price: 1.98 }, conv: { cup: 30, bunch: 227 }, aliases: ['kale', 'lacinato kale', 'green or lacinato kale', 'tuscan kale', 'curly kale'] });
  add({ id: 'spinach', name: 'Baby spinach', cat: 'Produce', base: 'g', pkg: { size: 142, label: '5 oz clamshell', price: 3.28 }, conv: { cup: 28, bunch: 300 }, aliases: ['baby spinach', 'spinach', 'spinach leaves', 'baby spinach leaves'] });
  add({ id: 'cauliflower', name: 'Cauliflower', cat: 'Produce', base: 'g', pkg: { size: 900, label: 'head (~2 lb)', price: 2.98 }, conv: { each: 900, head: 900, cup: 110 }, aliases: ['cauliflower', 'chinese cauliflower', 'western cauliflower', 'cauliflower florets'] });
  add({ id: 'chives', name: 'Chives', cat: 'Produce', base: 'g', pkg: { size: 21, label: '0.75 oz pack', price: 1.98 }, conv: { cup: 48, bunch: 21 }, aliases: ['chives', 'chopped chives', 'chives or scallions'] });
  add({ id: 'green_beans', name: 'Green beans / long beans', cat: 'Produce', base: 'g', sold: 'weight', pkg: { size: 454, label: 'per lb (loose)', price: 2.48 }, conv: { cup: 110 }, aliases: ['green beans', 'string beans', 'dao gok', 'long beans'] });
  add({ id: 'carrots', name: 'Carrots', cat: 'Produce', base: 'g', pkg: { size: 907, label: '2 lb bag', price: 1.68 }, conv: { each: 70, cup: 130 }, aliases: ['carrots', 'carrot', 'rainbow carrots', 'small rainbow carrots'], perish: 0.6 });
  add({ id: 'snap_peas', name: 'Sugar snap peas', cat: 'Produce', base: 'g', pkg: { size: 227, label: '8 oz bag', price: 3.48 }, conv: { cup: 65 }, aliases: ['snap peas', 'snow peas', 'sugar snap peas'] });
  add({ id: 'celery', name: 'Celery', cat: 'Produce', base: 'each', unitLabel: 'ribs', pkg: { size: 9, label: 'bunch (~9 ribs)', price: 1.48 }, conv: { rib: 1, stalk: 1, g: 1 / 40, cup: 2.5 }, aliases: ['celery', 'celery ribs', 'celery stalks', 'chinese celery'], perish: 0.8 });
  add({ id: 'broccoli', name: 'Broccoli crowns', cat: 'Produce', base: 'g', sold: 'weight', pkg: { size: 454, label: 'per lb (loose)', price: 1.78 }, conv: { head: 340, each: 340, cup: 90 }, aliases: ['broccoli', 'broccoli florets'] });
  add({ id: 'scallions', name: 'Green onions', cat: 'Produce', base: 'each', unitLabel: 'scallions', pkg: { size: 7, label: 'bunch (~7)', price: 0.79 }, conv: { g: 1 / 15, cup: 8, bunch: 7 }, aliases: ['scallions', 'scallion', 'green onions', 'green onion', 'spring onions'], dflt: 2 });
  add({ id: 'potatoes', name: 'Russet potatoes', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each (loose)', price: 0.89 }, conv: { g: 1 / 300 }, aliases: ['russet potatoes', 'russet potato', 'potatoes', 'potato', 'starchy baking potato'], perish: 0.4 });
  add({ id: 'kabocha', name: 'Kabocha squash', cat: 'Produce', base: 'g', sold: 'weight', minBuy: 1300, pkg: { size: 454, label: 'per lb (whole squash ~3 lb)', price: 1.48 }, conv: { each: 1300 }, aliases: ['kabocha', 'kabocha squash', 'butternut', 'butternut squash', 'honeynut', 'delicata'], perish: 0.5 });
  add({ id: 'lemongrass', name: 'Lemongrass', cat: 'Produce', base: 'each', unitLabel: 'stalks', pkg: { size: 1, label: 'stalk', price: 0.59 }, conv: { stalk: 1 }, aliases: ['lemongrass', 'lemongrass stalks'] });
  add({ id: 'napa', name: 'Napa cabbage', cat: 'Produce', base: 'g', sold: 'weight', minBuy: 1000, pkg: { size: 454, label: 'per lb (whole head ~2 lb)', price: 1.28 }, conv: { each: 1000, head: 1000 }, aliases: ['napa cabbage', 'wombok', 'chinese cabbage'] });
  add({ id: 'tomatoes', name: 'Tomatoes', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each (loose)', price: 0.75 }, conv: { g: 1 / 150, cup: 1.1 }, aliases: ['tomatoes', 'tomato'] });
  add({ id: 'cherry_tomatoes', name: 'Cherry tomatoes', cat: 'Produce', base: 'g', pkg: { size: 283, label: '10 oz pint', price: 2.98 }, conv: { cup: 150, pint: 283 }, aliases: ['cherry tomatoes', 'grape tomatoes'] });
  add({ id: 'curry_leaves', name: 'Curry leaves', cat: 'Produce', base: 'g', pkg: { size: 7, label: '0.25 oz pack', price: 2.49 }, conv: { leaf: 0.1, each: 0.1, sprig: 0.5 }, aliases: ['curry leaves'], note: 'Often not stocked at H-E-B. Try an Indian grocer.' });
  add({ id: 'radicchio', name: 'Radicchio', cat: 'Produce', base: 'g', pkg: { size: 227, label: 'head (~8 oz)', price: 2.49 }, conv: { head: 227, each: 227, cup: 75 }, aliases: ['radicchio'] });
  add({ id: 'parsley', name: 'Flat-leaf parsley', cat: 'Produce', base: 'g', pkg: { size: 60, label: 'bunch', price: 0.89 }, conv: { cup: 30, bunch: 60 }, aliases: ['flat-leaf parsley', 'parsley', 'italian parsley'] });
  add({ id: 'eggplant', name: 'Eggplant', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 1.49 }, conv: { g: 1 / 400 }, aliases: ['eggplant', 'aubergine'] });
  add({ id: 'zucchini', name: 'Zucchini', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.89 }, conv: { g: 1 / 200 }, aliases: ['zucchini', 'courgette'] });
  add({ id: 'yellow_squash', name: 'Yellow squash', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.89 }, conv: { g: 1 / 200 }, aliases: ['yellow squash', 'summer squash'] });
  add({ id: 'bell_pepper', name: 'Red bell pepper', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 1.29 }, conv: { g: 1 / 170 }, aliases: ['red bell pepper', 'bell pepper', 'capsicum'] });
  add({ id: 'butter_lettuce', name: 'Butter lettuce', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'head (living)', price: 2.98 }, conv: { head: 1 }, aliases: ['butter lettuce', 'bibb lettuce', 'butter or bibb lettuce', 'lettuce'] });
  add({ id: 'basil', name: 'Basil', cat: 'Produce', base: 'g', pkg: { size: 21, label: '0.75 oz pack', price: 1.98 }, conv: { cup: 24, sprig: 1 }, aliases: ['basil', 'fresh basil'] });
  add({ id: 'okra', name: 'Okra', cat: 'Produce', base: 'g', sold: 'weight', pkg: { size: 454, label: 'per lb (loose)', price: 2.98 }, conv: { each: 12, pod: 12, cup: 100 }, aliases: ['okra', 'okra pods'] });
  add({ id: 'swiss_chard', name: 'Swiss chard', cat: 'Produce', base: 'g', pkg: { size: 340, label: 'bunch', price: 1.98 }, conv: { bunch: 340, cup: 36 }, aliases: ['swiss chard', 'chard', 'rainbow chard'] });
  add({ id: 'cucumber', name: 'Cucumber', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.69 }, conv: { cup: 0.6, g: 1 / 300 }, aliases: ['cucumber', 'english cucumber'] });
  add({ id: 'dill', name: 'Dill', cat: 'Produce', base: 'g', pkg: { size: 21, label: '0.75 oz pack', price: 1.98 }, conv: { cup: 16, sprig: 1 }, aliases: ['dill', 'fresh dill'] });
  add({ id: 'banana', name: 'Bananas', cat: 'Produce', base: 'each', pkg: { size: 1, label: 'each', price: 0.25 }, conv: { g: 1 / 100, cup: 2.3 }, aliases: ['banana', 'mashed banana', 'ripe banana'] });

  // ---------- Dairy, eggs & refrigerated ----------
  add({ id: 'greek_yogurt', name: 'Plain Greek yogurt', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 907, label: '32 oz tub', price: 4.98 }, conv: { cup: 245 }, aliases: ['greek yogurt', 'yogurt', 'coconut yogurt', 'plain yogurt', 'full-fat yogurt'], dflt: 120 });
  add({ id: 'parmesan', name: 'Parmesan', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 170, label: '6 oz wedge', price: 5.98 }, conv: { cup: 90 }, aliases: ['parmesan', 'parmesan cheese', 'parmigiano', 'parmigiano-reggiano'], perish: 0.5 });
  add({ id: 'butter', name: 'Butter', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 454, label: '1 lb (4 sticks)', price: 4.98 }, conv: { tbsp: 14.2, cup: 227, stick: 113 }, aliases: ['unsalted butter', 'salted butter', 'butter', 'vegan butter', 'vegan or dairy butter', 'ghee'], perish: 0.3 });
  add({ id: 'cheddar', name: 'Sharp cheddar', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 227, label: '8 oz block', price: 2.98 }, conv: { cup: 100 }, aliases: ['sharp cheddar', 'cheddar', 'cheddar cheese'], perish: 0.5 });
  add({ id: 'sour_cream', name: 'Sour cream', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 454, label: '16 oz tub', price: 2.28 }, conv: { cup: 230 }, aliases: ['sour cream'] });
  add({ id: 'cream_cheese', name: 'Cream cheese', cat: 'Dairy & Eggs', base: 'g', pkg: { size: 227, label: '8 oz brick', price: 2.48 }, conv: { cup: 232 }, aliases: ['cream cheese'], perish: 0.7 });
  add({ id: 'eggs', name: 'Eggs (large)', cat: 'Dairy & Eggs', base: 'each', pkg: { size: 12, label: 'dozen', price: 3.48 }, conv: { egg: 1, yolk: 1 }, aliases: ['eggs', 'egg', 'large eggs', 'egg yolk'], perish: 0.5 });
  add({ id: 'tofu', name: 'Extra-firm tofu', cat: 'Refrigerated', base: 'g', pkg: { size: 397, label: '14 oz block', price: 2.48 }, conv: { block: 397, package: 397, each: 397, cup: 250 }, aliases: ['extra-firm tofu', 'firm tofu', 'tofu'] });
  add({ id: 'silken_tofu', name: 'Silken tofu', cat: 'Refrigerated', base: 'g', pkg: { size: 454, label: '16 oz pack', price: 2.49 }, conv: { package: 454, block: 454, each: 454 }, aliases: ['silken tofu'] });
  add({ id: 'tempeh', name: 'Tempeh', cat: 'Refrigerated', base: 'g', pkg: { size: 227, label: '8 oz pack', price: 3.49 }, conv: { package: 227, block: 227, each: 227 }, aliases: ['tempeh'], perish: 0.7 });
  add({ id: 'kewpie', name: 'Kewpie mayonnaise', cat: 'International', base: 'ml', pkg: { size: 355, label: '12 oz bottle', price: 5.98 }, aliases: ['kewpie mayonnaise', 'kewpie mayo', 'mayonnaise', 'mayo'], perish: 0.3 });

  // ---------- Frozen ----------
  add({ id: 'frozen_peas', name: 'Frozen peas', cat: 'Frozen', base: 'g', pkg: { size: 454, label: '16 oz bag', price: 1.98 }, conv: { cup: 140 }, aliases: ['frozen peas', 'peas', 'green peas'] });
  add({ id: 'frozen_corn', name: 'Frozen corn', cat: 'Frozen', base: 'g', pkg: { size: 454, label: '16 oz bag', price: 1.98 }, conv: { cup: 150 }, aliases: ['frozen corn kernels', 'frozen corn', 'corn kernels', 'sweet corn', 'corn'] });
  add({ id: 'udon', name: 'Udon noodles', cat: 'Frozen', base: 'g', pkg: { size: 600, label: '3 x 200 g frozen udon', price: 4.49 }, conv: { package: 200, each: 200 }, aliases: ['udon noodles', 'thick udon noodles', 'fresh or frozen thick udon noodles', 'udon'] });

  // ---------- Pantry ----------
  add({ id: 'olive_oil', name: 'Extra virgin olive oil', cat: 'Pantry', base: 'ml', pkg: { size: 500, label: '16.9 oz bottle', price: 7.98 }, aliases: ['extra virgin olive oil', 'extra-virgin olive oil', 'olive oil'], staple: true, dflt: 30 });
  add({ id: 'neutral_oil', name: 'Canola / neutral oil', cat: 'Pantry', base: 'ml', pkg: { size: 1420, label: '48 oz bottle', price: 4.98 }, aliases: ['neutral oil', 'canola oil', 'vegetable oil', 'vegetable or canola oil', 'canola or other neutral oil', 'canola', 'oil'], staple: true, dflt: 30 });
  add({ id: 'coconut_oil', name: 'Coconut oil', cat: 'Pantry', base: 'ml', pkg: { size: 414, label: '14 oz jar', price: 5.98 }, aliases: ['coconut oil'] });
  add({ id: 'sesame_oil', name: 'Toasted sesame oil', cat: 'International', base: 'ml', pkg: { size: 148, label: '5 oz bottle', price: 3.98 }, aliases: ['sesame oil', 'toasted sesame oil'] });
  add({ id: 'salt', name: 'Salt', cat: 'Spices', base: 'g', pkg: { size: 737, label: '26 oz canister', price: 0.88 }, conv: { tsp: 5.7, pinch: 0.4 }, aliases: ['salt', 'sea salt', 'kosher salt', 'table salt', 'fine sea salt'], staple: true, dflt: 3 });
  add({ id: 'black_pepper', name: 'Black pepper', cat: 'Spices', base: 'g', pkg: { size: 113, label: '4 oz grinder', price: 3.98 }, conv: { tsp: 2.3, pinch: 0.2 }, aliases: ['black pepper', 'pepper', 'ground pepper', 'ground black pepper', 'freshly ground black pepper'], staple: true, dflt: 1 });
  add({ id: 'basmati', name: 'Basmati rice', cat: 'Pantry', base: 'g', pkg: { size: 907, label: '2 lb bag', price: 4.48 }, conv: { cup: 195 }, aliases: ['basmati rice', 'basmati'] });
  add({ id: 'arborio', name: 'Arborio rice', cat: 'Pantry', base: 'g', pkg: { size: 454, label: '1 lb box', price: 3.48 }, conv: { cup: 200 }, aliases: ['arborio rice', 'arborio', 'risotto rice'] });
  add({ id: 'white_rice', name: 'Jasmine / white rice', cat: 'Pantry', base: 'g', pkg: { size: 907, label: '2 lb bag', price: 3.28 }, conv: { cup: 185 }, aliases: ['cooked rice', 'white rice', 'jasmine rice', 'steamed rice', 'rice'], dflt: 300 });
  add({ id: 'red_lentils', name: 'Red lentils', cat: 'Pantry', base: 'g', pkg: { size: 454, label: '1 lb bag', price: 2.28 }, conv: { cup: 190 }, aliases: ['red lentils', 'lentils', 'masoor dal'] });
  add({ id: 'quinoa', name: 'Quinoa', cat: 'Pantry', base: 'g', pkg: { size: 340, label: '12 oz bag', price: 3.98 }, conv: { cup: 170 }, aliases: ['quinoa'] });
  add({ id: 'pasta', name: 'Short pasta', cat: 'Pantry', base: 'g', pkg: { size: 454, label: '16 oz box', price: 1.25 }, aliases: ['short pasta', 'pasta', 'fusilli', 'macaroni', 'cavatelli', 'cavatappi', 'penne rigate', 'penne', 'rigatoni', 'shells'] });
  add({ id: 'rice_noodles', name: 'Rice vermicelli', cat: 'International', base: 'g', pkg: { size: 227, label: '8 oz pack', price: 2.48 }, aliases: ['rice vermicelli', 'rice noodles', 'vermicelli', 'glass noodles', 'thick rice noodles'], dflt: 150 });
  add({ id: 'veg_broth', name: 'Vegetable broth', cat: 'Pantry', base: 'ml', pkg: { size: 946, label: '32 oz carton', price: 1.98 }, aliases: ['vegetable broth', 'vegetable stock', 'veg stock', 'mushroom stock', 'stock', 'broth'], perish: 0.4 });
  add({ id: 'chickpeas', name: 'Chickpeas (canned)', cat: 'Pantry', base: 'each', unitLabel: 'cans', pkg: { size: 1, label: '15.5 oz can', price: 0.88 }, conv: { can: 1, g: 1 / 250, cup: 1 / 1.5 }, aliases: ['chickpeas', 'garbanzo beans', 'cooked chickpeas'] });
  add({ id: 'hearts_of_palm', name: 'Hearts of palm', cat: 'Pantry', base: 'each', unitLabel: 'cans', pkg: { size: 1, label: '14 oz can', price: 3.49 }, conv: { can: 1, g: 1 / 400 }, aliases: ['hearts of palm'] });
  add({ id: 'tahini', name: 'Tahini', cat: 'Pantry', base: 'g', pkg: { size: 454, label: '16 oz jar', price: 6.98 }, conv: { tbsp: 15 }, aliases: ['tahini', 'tahini paste'], perish: 0.1 });
  add({ id: 'cashews', name: 'Raw cashews', cat: 'Pantry', base: 'g', pkg: { size: 454, label: '16 oz bag', price: 8.48 }, conv: { cup: 140 }, aliases: ['raw cashews', 'cashews'] });
  add({ id: 'walnuts', name: 'Walnuts', cat: 'Pantry', base: 'g', pkg: { size: 227, label: '8 oz bag', price: 4.98 }, conv: { cup: 120 }, aliases: ['walnuts', 'chopped walnuts'] });
  add({ id: 'pecans', name: 'Pecans', cat: 'Pantry', base: 'g', pkg: { size: 227, label: '8 oz bag', price: 5.98 }, conv: { cup: 110 }, aliases: ['pecans', 'chopped pecans', 'pecan pieces'] });
  add({ id: 'balsamic', name: 'Balsamic vinegar', cat: 'Pantry', base: 'ml', pkg: { size: 500, label: '16.9 oz bottle', price: 3.98 }, aliases: ['balsamic vinegar', 'balsamic'] });
  add({ id: 'white_vinegar', name: 'White wine vinegar', cat: 'Pantry', base: 'ml', pkg: { size: 473, label: '16 oz bottle', price: 2.28 }, aliases: ['white wine vinegar', 'white vinegar', 'red wine vinegar', 'vinegar'] });
  add({ id: 'maple', name: 'Maple syrup', cat: 'Pantry', base: 'ml', pkg: { size: 355, label: '12 oz bottle', price: 6.98 }, aliases: ['maple syrup', 'maple', 'honey'] });
  add({ id: 'cornmeal', name: 'Fine white cornmeal', cat: 'Pantry', base: 'g', pkg: { size: 680, label: '24 oz bag', price: 2.48 }, conv: { cup: 125 }, aliases: ['fine white cornmeal', 'white cornmeal', 'cornmeal', 'polenta', 'grits'] });
  add({ id: 'potato_chips', name: 'Potato chips', cat: 'Snacks', base: 'g', pkg: { size: 227, label: '8 oz bag', price: 3.98 }, conv: { cup: 20 }, aliases: ['potato chips'], perish: 0.2 });
  add({ id: 'oyster_crackers', name: 'Oyster crackers', cat: 'Snacks', base: 'g', pkg: { size: 255, label: '9 oz bag', price: 2.98 }, aliases: ['oyster crackers'], perish: 0.1, dflt: 60 });

  // ---------- International aisle ----------
  add({ id: 'soy_sauce', name: 'Soy sauce / tamari', cat: 'International', base: 'ml', pkg: { size: 444, label: '15 oz bottle', price: 2.98 }, aliases: ['soy sauce', 'tamari', 'soy sauce or tamari', 'light soy sauce'] });
  add({ id: 'black_vinegar', name: 'Chinkiang black vinegar', cat: 'International', base: 'ml', pkg: { size: 550, label: '18.6 oz bottle', price: 3.98 }, aliases: ['black vinegar', 'chinkiang vinegar'], note: 'Not always carried. Check the Asian foods aisle or an Asian grocer.' });
  add({ id: 'gochujang', name: 'Gochujang', cat: 'International', base: 'g', pkg: { size: 500, label: '17.6 oz tub', price: 6.98 }, conv: { tbsp: 19 }, aliases: ['gochujang', 'gochujang paste'] });
  add({ id: 'gochugaru', name: 'Gochugaru', cat: 'International', base: 'g', pkg: { size: 100, label: '3.5 oz bag', price: 5.98 }, conv: { tsp: 2 }, aliases: ['gochugaru', 'korean chili flakes'], note: 'May need an Asian grocer.' });
  add({ id: 'chili_crisp', name: 'Chili crisp', cat: 'International', base: 'g', pkg: { size: 210, label: '7.4 oz jar', price: 4.48 }, conv: { tbsp: 15 }, aliases: ['chili crisp', 'chili oil', 'chili crisp/oil', 'chili oil/crisp', 'chili oil/chili crisp'], dflt: 15 });
  add({ id: 'chickpea_flour', name: 'Chickpea flour (besan)', cat: 'International', base: 'g', pkg: { size: 454, label: '16 oz bag', price: 4.98 }, conv: { cup: 105 }, aliases: ['chickpea flour', 'besan', 'gram flour'] });
  add({ id: 'vegeta', name: 'Vegeta seasoning', cat: 'International', base: 'g', pkg: { size: 250, label: '8.8 oz bag', price: 4.98 }, conv: { tbsp: 9 }, aliases: ['vegeta', 'vegeta seasoning', 'bouillon powder'], note: 'Not always carried. Any vegetable bouillon powder works.' });

  // ---------- Baking ----------
  add({ id: 'ap_flour', name: 'All-purpose flour', cat: 'Baking', base: 'g', pkg: { size: 2268, label: '5 lb bag', price: 2.98 }, conv: { cup: 125 }, aliases: ['all-purpose flour', 'unbleached all-purpose flour', 'plain/all-purpose flour', 'plain flour', 'gluten free', 'flour'] });
  add({ id: 'ww_flour', name: 'Whole wheat flour', cat: 'Baking', base: 'g', pkg: { size: 907, label: '2 lb bag', price: 3.98 }, conv: { cup: 113 }, aliases: ['whole wheat flour', 'white whole wheat flour', 'golden wheat flour'] });
  add({ id: 'sugar', name: 'Granulated sugar', cat: 'Baking', base: 'g', pkg: { size: 1814, label: '4 lb bag', price: 3.28 }, conv: { cup: 200 }, aliases: ['granulated sugar', 'white sugar', 'sugar'] });
  add({ id: 'brown_sugar', name: 'Light brown sugar', cat: 'Baking', base: 'g', pkg: { size: 907, label: '2 lb bag', price: 2.48 }, conv: { cup: 213 }, aliases: ['light brown sugar', 'light-brown sugar', 'packed light-brown sugar', 'dark brown sugar', 'brown sugar'] });
  add({ id: 'baking_powder', name: 'Baking powder', cat: 'Baking', base: 'g', pkg: { size: 283, label: '10 oz can', price: 2.48 }, conv: { tsp: 4.6 }, aliases: ['baking powder'] });
  add({ id: 'baking_soda', name: 'Baking soda', cat: 'Baking', base: 'g', pkg: { size: 454, label: '1 lb box', price: 1.18 }, conv: { tsp: 6 }, aliases: ['baking soda', 'bicarbonate of soda'] });
  add({ id: 'vanilla', name: 'Vanilla extract', cat: 'Baking', base: 'ml', pkg: { size: 59, label: '2 oz bottle', price: 6.98 }, aliases: ['vanilla extract', 'pure vanilla extract', 'vanilla'] });
  add({ id: 'yeast', name: 'Active dry yeast', cat: 'Baking', base: 'g', pkg: { size: 21, label: '3-packet strip', price: 1.98 }, conv: { packet: 7, package: 7, tsp: 3.1 }, aliases: ['active dry yeast', 'instant yeast', 'yeast'] });
  add({ id: 'choc_chips', name: 'Semisweet chocolate chips', cat: 'Baking', base: 'g', pkg: { size: 340, label: '12 oz bag', price: 3.48 }, conv: { cup: 170 }, aliases: ['semisweet chocolate chips', 'chocolate chips', 'chocolate chunks'] });
  add({ id: 'oats', name: 'Old-fashioned rolled oats', cat: 'Baking', base: 'g', pkg: { size: 510, label: '18 oz canister', price: 2.98 }, conv: { cup: 85 }, aliases: ['old-fashioned rolled oats', 'rolled oats', 'oats'] });
  add({ id: 'coconut_flakes', name: 'Unsweetened coconut flakes', cat: 'Baking', base: 'g', pkg: { size: 198, label: '7 oz bag', price: 3.98 }, conv: { cup: 60 }, aliases: ['unsweetened flake coconut', 'flake coconut', 'coconut flakes', 'shredded coconut', 'unsweetened coconut'] });

  // ---------- Spices ----------
  spice('turmeric', 'Ground turmeric', ['ground turmeric', 'turmeric'], 60, 3.48, 3);
  spice('garam_masala', 'Garam masala', ['garam masala'], 50, 4.48, 2.5);
  spice('curry_powder', 'Curry powder', ['curry powder'], 50, 3.98, 2.5);
  spice('cayenne', 'Cayenne / chili powder', ['cayenne', 'cayenne pepper', 'chili powder', 'cayenne or chili powder'], 50, 3.48, 2);
  spice('cumin_seeds', 'Cumin seeds', ['cumin seeds', 'cumin seed', 'whole cumin'], 50, 3.98, 2.1);
  spice('ground_cumin', 'Ground cumin', ['ground cumin', 'cumin'], 50, 3.48, 2.3);
  spice('ground_coriander', 'Ground coriander', ['ground coriander', 'coriander powder'], 40, 3.48, 1.8);
  spice('amchur', 'Amchur (dried mango powder)', ['amchur', 'amchur powder', 'amchoor', 'dried mango powder'], 100, 3.99, 2.5, { note: 'Rarely at H-E-B. Indian grocer.' });
  spice('five_spice', 'Chinese five spice', ['five spice powder', 'chinese five spice', 'five spice', 'five-spice powder'], 50, 3.98, 2);
  spice('paprika', 'Paprika', ['paprika', 'smoked paprika', 'sweet paprika'], 60, 2.98, 2.3);
  spice('celery_seed', 'Celery seed', ['celery seed', 'celery seeds'], 50, 3.98, 2);
  spice('nutmeg', 'Nutmeg', ['nutmeg', 'ground nutmeg', 'freshly grated nutmeg'], 50, 4.98, 2.2);
  spice('thyme', 'Dried thyme', ['dried thyme', 'thyme'], 20, 2.98, 1);
  spice('italian_seasoning', 'Italian seasoning', ['italian seasoning'], 20, 2.98, 1);
  spice('cinnamon', 'Ground cinnamon', ['ground cinnamon', 'cinnamon'], 70, 2.98, 2.6);
  spice('fennel_seeds', 'Fennel seeds', ['fennel seeds', 'fennel seed'], 40, 3.48, 2);
  spice('poppy_seeds', 'Poppy seeds', ['poppy seeds'], 60, 4.48, 2.8);
  spice('sesame_seeds', 'Sesame seeds', ['sesame seeds', 'white sesame seeds', 'toasted white sesame seeds', 'roasted sesame seeds', 'toasted sesame seeds'], 100, 2.98, 3, { cat: 'International' });
  spice('onion_powder', 'Onion powder', ['onion powder'], 60, 2.98, 2.4);
  spice('msg', 'MSG', ['msg', 'accent seasoning'], 113, 2.48, 4);
  spice('red_pepper_flakes', 'Crushed red pepper flakes', ['red pepper flakes', 'red pepper flake', 'red-pepper flakes', 'crushed red pepper', 'crushed red pepper flake', 'crush red pepper', 'chili flakes', 'red pepper/chili flakes'], 40, 2.98, 1.8);
  add({ id: 'dried_chilies', name: 'Dried red chilies', cat: 'Spices', base: 'each', unitLabel: 'chilies', pkg: { size: 40, label: '1 oz bag (~40)', price: 2.49 }, aliases: ['dried red chilies', 'dried red chili', 'dried chilies', 'chiles de arbol'] });
  add({ id: 'cardamom', name: 'Green cardamom pods', cat: 'Spices', base: 'each', unitLabel: 'pods', pkg: { size: 60, label: '1.5 oz jar (~60 pods)', price: 6.98 }, conv: { pod: 1 }, aliases: ['cardamom pods', 'green cardamom', 'cardamom'] });

  const SECTION_PERISH = { Produce: 1, 'Dairy & Eggs': 0.8, Refrigerated: 1, Frozen: 0.3, Pantry: 0.15, International: 0.15, Baking: 0.1, Spices: 0.05, Snacks: 0.2, Other: 0.5 };
  const SECTION_ORDER = ['Produce', 'Refrigerated', 'Dairy & Eggs', 'Frozen', 'Pantry', 'International', 'Baking', 'Spices', 'Snacks', 'Other'];

  const api = { CATALOG: C, SECTION_PERISH, SECTION_ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_CATALOG = api;
})(typeof window !== 'undefined' ? window : globalThis);
