// Usage: node tests/parse-pdfs.js <folder-of-pdfs> [--json]
// Needs pdfjs-dist installed somewhere Node can resolve it (npm i pdfjs-dist@4.10.38).
const fs = require('fs');
const path = require('path');
const { extractLines } = require('../lib/pdf-extract.js');
const { parseRecipe, buildMatcher } = require('../lib/parse.js');
const { CATALOG } = require('../data/catalog.js');
const { convertToBase } = require('../lib/planner.js');

(async () => {
  const dir = process.argv[2];
  const json = process.argv.includes('--json');
  const pdfjs = await import(process.env.PDFJS || 'pdfjs-dist/legacy/build/pdf.mjs');
  const match = buildMatcher(CATALOG);
  const results = [];
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.pdf')).sort()) {
    const data = new Uint8Array(fs.readFileSync(path.join(dir, f)));
    const doc = await pdfjs.getDocument({ data, verbosity: 0 }).promise;
    const lines = await extractLines(doc);
    const r = parseRecipe(lines, f, match);
    results.push({ file: f, ...r, text: undefined });
    if (json) continue;
    console.log(`\n=== ${r.title}  [serves ${r.servings}]  (${f})`);
    for (const ing of r.ingredients) {
      if (ing.header) { console.log(`  ## ${ing.raw}`); continue; }
      const item = match(ing);
      const conv = item ? convertToBase(ing, item, 1) : null;
      const amt = ing.amounts.map((a) => `${+a.qty.toFixed(2)} ${a.unit}`).join(' | ');
      console.log(`  - ${ing.raw}\n      -> [${amt}] ${item ? item.id : '??? UNMATCHED'}${conv ? ` = ${+conv.amount.toFixed(1)} ${item.base}${conv.approx ? ' ~' : ''}` : ''}${ing.optional ? ' (optional)' : ''}`);
    }
  }
  if (json) console.log(JSON.stringify(results, null, 1));
})();
