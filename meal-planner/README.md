# Meal Planner

A meal-planning tool that runs in your browser. You upload recipe PDFs, search them by title, build a plan, and get a shopping list with estimated H-E-B prices. It also suggests other recipes that use up what's left over.

## How to run it

Double-click `index.html`, or open it in Chrome, Edge, Firefox or Safari. Nothing to install.
You need an internet connection the first time you upload, because the PDF reader (pdf.js) loads from cdn.jsdelivr.net.

You can also turn on GitHub Pages for this repo and open `…/meal-planner/` from anywhere.

Your recipes, plan and price edits are saved **in that browser only** (IndexedDB). Use *Prices & pantry → Back up data* to save a copy or move it to another computer. The backup holds the parsed recipes and settings, not the PDFs.

## What it does

| Tab | |
|---|---|
| **Recipes** | Upload PDFs (drag and drop, several at once). Search by words in the title, or tick "also search ingredients". Click **Review** to check and fix what was read from a PDF: edit a line, choose a different store item, mark it optional, or remove it. |
| **Plan** | The recipes you've picked, each with a 0.5×–3× scale. Shows the estimated cost, what will be left over from the packages you buy, and **Use up your leftovers** suggestions. |
| **Shopping list** | Grouped by store section. Shows how much you need, what to buy (whole packages), estimated cost and leftovers. Tick items off as you shop. You can copy it as text or print it. |
| **Prices & pantry** | Every ingredient the app knows, with an editable price and package. Tick **Have** for things already at home and they're left off the list. Salt, pepper, olive oil and neutral oil start ticked. You can add your own ingredients here too. |

### How the suggestions work
For each recipe you haven't planned, the app adds up how much of your leftovers it would use, in dollars. Each item is weighted by how quickly it spoils: produce and dairy count fully, frozen food partly, and pantry goods and spices very little. The best-scoring recipes are shown, along with what each one would add to your list.

## Files
- `data/catalog.js`: ingredient list with estimated prices, package sizes, unit conversions and the words that identify each ingredient in recipes. **This is where to correct prices in bulk.**
- `lib/parse.js`: finds the title, servings and ingredient lines in a PDF, and reads quantities and units.
- `lib/pdf-extract.js`: turns a PDF into positioned lines of text, which is how two-column layouts get split.
- `lib/planner.js`: unit conversion, shopping list, leftovers and suggestions.
- `tests/parse-pdfs.js`: checks the parser against a folder of PDFs:
  `npm i pdfjs-dist@4.10.38 && node tests/parse-pdfs.js path/to/pdfs`

## Known limits
- **Prices are estimates, not live H-E-B data.** H-E-B has no public API for prices or store inventory, and heb.com blocks automated access. The app can't tell whether the Riverside Dr store has something in stock. The *H-E-B ↗* links open a heb.com search, where you can check the real price for your store.
- **Reading ingredients from PDFs is heuristic.** It was tested on 19 recipes in several layouts: single-column, NYT Cooking two-column, King Arthur three-column, blog printouts and Milk Street. Check new uploads with **Review**. Known misses:
  - the banana bread's topping, which sits on a separate printed half-page
  - the second recipe (soor) in the Swiss chard PDF
  - quantities written mid-sentence, such as "zest from 2 oranges"
- Scanned or image-only PDFs have no text to read, so you'll need to type their ingredients in yourself.
- Unit conversions such as cups to grams, or a "bunch" of cilantro, use typical values, so amounts are approximate. These amounts are marked ≈.
