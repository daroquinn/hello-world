/*
 * Recipe parsing: positioned lines -> { title, servings, ingredients[] }
 * and single ingredient lines -> { amounts, name, optional }.
 *
 * Recipe PDFs have no standard structure, so this is heuristic. The app
 * always lets you correct the result by hand.
 */
(function (root) {
  // ---------- text helpers ----------
  const FRACTIONS = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8', '⅜': '3/8', '⅝': '5/8', '⅞': '7/8', '⅕': '1/5', '⅙': '1/6', '⅚': '5/6' };
  function normFractions(s) {
    return s
      .replace(/(\d)\s*([½⅓⅔¼¾⅛⅜⅝⅞⅕⅙⅚])/g, (m, d, f) => `${d} ${FRACTIONS[f]}`)
      .replace(/[½⅓⅔¼¾⅛⅜⅝⅞⅕⅙⅚]/g, (f) => FRACTIONS[f])
      .replace(/(\d)\s*⁄\s*(\d)/g, '$1/$2');
  }
  function fold(s) {
    return s
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[’‘]/g, "'")
      .replace(/yoghurt/g, 'yogurt')
      .replace(/chilli/g, 'chili')
      .replace(/chilies|chiles/g, 'chilies')
      .replace(/\s+/g, ' ')
      .trim();
  }
  const squash = (s) => s.replace(/\s+/g, '').toLowerCase();
  function unspace(t) {
    return t.replace(/\b(?:[A-Z]{1,2} ){3,}[A-Z]{1,2}\b/g, (m) => {
      const toks = m.split(' ');
      return toks.filter((x) => x.length === 1).length >= 3 ? toks.join('') : m;
    });
  }

  // ---------- units ----------
  const MASS = { g: 1, gram: 1, grams: 1, gm: 1, kg: 1000, kilogram: 1000, oz: 28.35, ounce: 28.35, ounces: 28.35, lb: 453.6, lbs: 453.6, pound: 453.6, pounds: 453.6 };
  const VOLUME = { tsp: 4.929, teaspoon: 4.929, teaspoons: 4.929, tbsp: 14.787, tbs: 14.787, tablespoon: 14.787, tablespoons: 14.787, cup: 236.6, cups: 236.6, ml: 1, millilitre: 1, milliliter: 1, millilitres: 1, milliliters: 1, l: 1000, litre: 1000, liter: 1000, litres: 1000, liters: 1000, quart: 946, quarts: 946, pint: 473, pints: 473 };
  const COUNT = {
    clove: 'clove', cloves: 'clove', can: 'can', cans: 'can', tin: 'can', tins: 'can', package: 'package', packages: 'package', packet: 'packet', packets: 'packet', pkg: 'package', pack: 'package',
    block: 'block', blocks: 'block', head: 'head', heads: 'head', bunch: 'bunch', bunches: 'bunch', stalk: 'stalk', stalks: 'stalk', rib: 'rib', ribs: 'rib', sprig: 'sprig', sprigs: 'sprig',
    piece: 'piece', pieces: 'piece', pod: 'pod', pods: 'pod', stick: 'stick', sticks: 'stick', slice: 'slice', slices: 'slice', leaf: 'leaf', leaves: 'leaf', handful: 'handful', handfuls: 'handful',
    pinch: 'pinch', pinches: 'pinch', inch: 'inch', inches: 'inch', dozen: 'dozen', jar: 'jar', bag: 'bag', box: 'box', bottle: 'bottle', carton: 'carton', wedge: 'wedge', wedges: 'wedge',
    egg: 'egg', eggs: 'egg', yolk: 'yolk', yolks: 'yolk',
  };
  const SIZE_WORDS = /^(large|medium|small|big|heaped|heaping|packed|level|scant|generous|whole|extra-large|jumbo)$/i;
  function unitInfo(u) {
    if (!u) return null;
    const k = u.toLowerCase().replace(/\.$/, '');
    if (MASS[k]) return { dim: 'mass', factor: MASS[k], unit: k };
    if (k === 'fl oz') return { dim: 'volume', factor: 29.57, unit: 'fl oz' };
    if (VOLUME[k]) return { dim: 'volume', factor: VOLUME[k], unit: k };
    if (k === 't') return { dim: 'volume', factor: 4.929, unit: 'tsp' };
    if (COUNT[k]) return { dim: 'count', unit: COUNT[k] };
    return null;
  }
  const UNIT_WORDS = Object.keys(MASS).concat(Object.keys(VOLUME), Object.keys(COUNT), ['fl oz']).sort((a, b) => b.length - a.length);
  const UNIT_RE = UNIT_WORDS.map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

  // A number: "1 1/2", "1/2", "1.5", "2"
  const NUM = '(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?)';
  const RANGE = `${NUM}(?:\\s*(?:-|–|—|to|or)\\s*${NUM})?`;
  function numVal(s) {
    s = s.trim();
    let m;
    if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
    if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
    return parseFloat(s);
  }
  function rangeVal(s) {
    const parts = s.split(/\s*(?:-|–|—|\bto\b|\bor\b)\s*/).filter(Boolean);
    return Math.max(...parts.map(numVal)); // buy for the larger end of a range
  }

  // Find every "<number> <unit>" pair inside a string (used for parentheticals).
  function findAmounts(s) {
    const out = [];
    const re = new RegExp(`(?:(\\d+)\\s*x\\s*)?(${RANGE})\\s*-?\\s*(${UNIT_RE})\\b`, 'gi');
    let m;
    while ((m = re.exec(s))) {
      const info = unitInfo(m[3]);
      if (!info || info.dim === 'count') continue;
      out.push({ qty: rangeVal(m[2]) * (m[1] ? +m[1] : 1), unit: info.unit });
    }
    return out;
  }

  // ---------- single ingredient line ----------
  const LEADING_QTY_RE = new RegExp(`^(?:about\\s+|approx\\.?\\s+)?(${RANGE})`, 'i');
  function startsWithQty(s) {
    s = normFractions(s).replace(/^[•·\-*–]\s*/, '');
    return /^(?:about\s+)?\d/.test(s) || /^(a|an|one|two|three|half)\s+(pinch|handful|few|dash|splash|cup|tablespoon|teaspoon|clove|bunch|head)\b/i.test(s) || /^(big|large|small)\s+handful\b/i.test(s);
  }

  function parseIngredient(raw) {
    let s = normFractions(raw).replace(/^[•·\-*–]\s*/, '').replace(/\s+/g, ' ').trim();
    const optional = /\boptional\b/i.test(s);
    const garnish = /\b(for serving|to serve|for garnish|for topping|to garnish|for the top)\b/i.test(s);

    // Pull out parentheticals; keep their amounts as alternatives.
    const parens = [];
    let body = s.replace(/\(([^()]*)\)/g, (m, inner) => { parens.push(inner); return ' '; }).replace(/\s+/g, ' ').trim();
    // Unbalanced "(" left over from wrapping: drop from it onwards into parens
    const open = body.indexOf('(');
    if (open >= 0) { parens.push(body.slice(open + 1)); body = body.slice(0, open).trim(); }

    const amounts = [];
    let rest = body;
    const takeAmount = () => {
      let m = rest.match(LEADING_QTY_RE);
      if (!m) {
        const w = rest.match(/^(a|an|one|half|big|large|small)\s+/i);
        if (w && /^(a|an|one|half|big|large|small)\s+(pinch|handful|few|dash|splash|cup|tablespoon|teaspoon|clove|bunch|head)\b/i.test(rest)) {
          rest = rest.slice(w[0].length);
          m = { qty: /half/i.test(w[1]) ? 0.5 : 1 };
        } else return false;
      } else {
        rest = rest.slice(m[0].length);
        m = { qty: rangeVal(m[1]) };
      }
      // "1-inch", "14-oz", "1 heaped"
      rest = rest.replace(/^\s*-\s*/, ' ').trim();
      while (true) {
        const w = rest.match(/^([a-z-]+)\s*/i);
        if (w && SIZE_WORDS.test(w[1])) { rest = rest.slice(w[0].length); m.size = m.size || w[1].toLowerCase(); continue; }
        break;
      }
      let unit = null;
      const um = rest.match(new RegExp(`^(${UNIT_RE})\\.?(?![a-z])`, 'i'));
      if (um) { unit = unitInfo(um[1]).unit; rest = rest.slice(um[0].length).trim(); }
      // a size spec like "14-oz can" right after the number: "1 14-oz can"
      const spec = rest.match(new RegExp(`^(${NUM})\\s*-?\\s*(${UNIT_RE})\\b\\s*`, 'i'));
      if (!unit && spec) {
        parens.push(spec[0]);
        rest = rest.slice(spec[0].length).trim();
        const um2 = rest.match(new RegExp(`^(${UNIT_RE})\\.?(?![a-z])`, 'i'));
        if (um2) { unit = unitInfo(um2[1]).unit; rest = rest.slice(um2[0].length).trim(); }
      }
      amounts.push({ qty: m.qty, unit: unit || 'each', size: m.size });
      rest = rest.replace(/^\s*(of)\s+/i, '').trim();
      return true;
    };
    if (takeAmount()) {
      // "1 tablespoon plus 1/3 cup sugar"
      const plus = rest.match(/^plus\s+/i);
      if (plus) {
        const first = amounts.pop();
        rest = rest.slice(plus[0].length);
        if (takeAmount()) {
          const second = amounts.pop();
          const a = unitInfo(first.unit), b = unitInfo(second.unit);
          if (a && b && a.dim === b.dim && a.dim !== 'count') {
            amounts.push({ qty: second.qty + (first.qty * a.factor) / b.factor, unit: second.unit });
          } else amounts.push(second, first);
        } else amounts.push(first);
      }
    }
    // "1-inch / 2.5cm piece ginger" -> drop the metric alternative after the slash
    rest = rest.replace(new RegExp(`^/\\s*${NUM}\\s*(${UNIT_RE})\\b`, 'i'), '').trim();
    for (const p of parens) amounts.push(...findAmounts(normFractions(p)));
    const restAlt = findAmounts(rest.replace(/^\s*\S+/, '')); // e.g. "450g / 1 pound" later in the name
    if (amounts.length) amounts.push(...restAlt);

    // Display name: drop prep notes after the first comma and leading filler.
    let name = rest.replace(/^(of|piece|pieces)\s+/i, '').replace(/^\/\s*/, '');
    const nameBeforeComma = name.split(',')[0].trim();
    name = nameBeforeComma
      .replace(/\b(such as|like)\b.*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    const free = /^((cold|warm|hot|lukewarm|boiling|ice|filtered|tap)\s+)?water$|^ice( cubes)?$/i.test(nameBeforeComma.trim());
    return { raw: raw.trim(), amounts, name: name || rest || s, matchText: nameBeforeComma, fullText: rest, optional, garnish, free };
  }

  // ---------- catalog matching ----------
  function buildMatcher(catalog) {
    const entries = [];
    for (const item of catalog) {
      for (const a of item.aliases || []) {
        const al = fold(a);
        const esc = al.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        entries.push({ item, len: al.length, re: new RegExp(`(^|[^a-z])${esc}(e?s)?(?![a-z])`, 'i') });
      }
    }
    function best(text) {
      const t = fold(text);
      let found = null;
      for (const e of entries) {
        const m = e.re.exec(t);
        if (!m) continue;
        const pos = m.index + m[1].length;
        if (!found || pos < found.pos || (pos === found.pos && e.len > found.len)) found = { pos, len: e.len, item: e.item };
      }
      return found;
    }
    return function match(ing) {
      const f = best(ing.matchText || ing.name || '') || best(ing.fullText || '') || best(ing.raw || '');
      return f ? f.item : null;
    };
  }

  // ---------- recipe-level parsing ----------
  const STOP_RE = /^(step\s*\d+\b|\d+\s*[.)]\s+[A-Za-z]|directions\b|preparation\b|instructions\b|method\b|to make\b|how to make|notes?\b|nutrition|tips?\b|cook'?s note|storage\b|serving suggestions?|about this recipe|private notes|ratings?\b|reviews?\b|comments?\b|\d+ thoughts? on)/i;
  const VERB_RE = /^(preheat|heat|place|pour|in a\b|in the\b|in a large|bring|combine|mix|melt|whisk|toast|cook|put|using|roast|line|set|stir|blend|make|prepare|remove|transfer|season|meanwhile|start|fill|arrange|spread|beat|grease|bake|simmer|sauté|saute|drain|rinse|wash|cut|slice|chop|soak)\b/i;
  const DISH_WORD = /\b(dip|sauce|dressing|marinade|crumbles|topping|tadka|glaze|filling|crust|frosting|icing|salad|crudit|crudités|batter|dough|garnish|to serve|for serving|seasoning blend|spice mix|for the)\b/i;

  function isHeader(text, match) {
    const t = text.trim();
    if (/:$/.test(t)) return true;
    if (/^for the\b/i.test(t)) return true;
    if (/^(optional|garnish|to serve|topping|batter|dough|filling|sauce)$/i.test(t)) return true;
    if (/\(optional\)/i.test(t) && match(parseIngredient(t))) return false;
    if (startsWithQty(t) || /,/.test(t) || /\d/.test(t)) return false;
    if (/\b(from|of|and|or|with|large|medium|small|the|a)$/i.test(t)) return false;
    if (t.split(/\s+/).length > 7) return false;
    if (!/^[A-Z]/.test(t)) return false;
    if (DISH_WORD.test(t) && !/\b(salt|pepper|oil)\b/i.test(t)) return true;
    if (!match(parseIngredient(t))) return true; // capitalised phrase naming nothing we know
    // "Gochujang tahini yoghurt": several known items, no and/or -> a sub-recipe name
    if (!/\b(and|or|&)\b|\//i.test(t)) {
      const words = t.split(/\s+/);
      let hits = 0;
      for (const w of words) if (match({ matchText: w })) hits++;
      if (hits >= 2 && words.length <= 4) return true;
    }
    return false;
  }

  function findTitle(lines, filename) {
    const first = lines.filter((l) => l.page === 1).slice(0, 40);
    if (!first.length) return cleanFilename(filename);
    const bad = /^(advertisement|ad|print|jump to|share|save|menu|home|recipes?|log ?in|sign ?in|subscribe)$/i;
    const fileWords = new Set(fold(cleanFilename(filename)).split(/[^a-z]+/).filter((w) => w.length > 2));
    const segs = [];
    first.forEach((l) => l.segments.forEach((sg) => segs.push({ text: sg.text, size: sg.size || l.size, x: sg.x, y: l.y, page: l.page, line: l })));
    const cands = segs.filter((l) => !bad.test(l.text.trim()) && l.text.length > 2 && !/^https?:/i.test(l.text) && !/©|copyright|^\d/i.test(l.text));
    const score = (l) => {
      const words = fold(l.text).split(/[^a-z]+/).filter((w) => w.length > 2);
      const overlap = words.filter((w) => fileWords.has(w)).length;
      return l.size + overlap * 4 - (/^[A-Z\s&|]+$/.test(l.text) && overlap === 0 ? 3 : 0);
    };
    let best = cands[0];
    for (const l of cands) if (score(l) > score(best)) best = l;
    if (!best) return cleanFilename(filename);
    let title = best.text;
    const idx = lines.indexOf(best.line);
    const nextLine = lines[idx + 1];
    const next = nextLine && nextLine.segments.find((sg) => Math.abs(sg.x - best.x) < 5);
    if (next && nextLine.page === best.page && Math.abs((next.size || nextLine.size) - best.size) < 0.5 && best.y - nextLine.y < best.size * 1.8 && !/^(by|recipe)\b/i.test(next.text)) {
      title += ' ' + next.text;
    }
    return title.replace(/\s+/g, ' ').trim();
  }

  function cleanFilename(fn) {
    return (fn || 'Untitled recipe')
      .replace(/\.pdf$/i, '')
      .replace(/^[0-9a-f]{8}-/, '')
      .replace(/[_]+/g, ' ')
      .replace(/\s*\|.*$/, '')
      .replace(/\s+-\s+.*$/, '')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function findServings(lines) {
    for (const l of lines.slice(0, 80)) {
      const t = l.text.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, '')); // "Y I E L D" -> "YIELD"
      const m = t.match(/\b(?:serves|servings?|yield|makes)\s*:?\s*(\d+)(?:\s*(?:-|–|to)\s*(\d+))?/i) || t.match(/\((\d+)\s+servings?/i) || t.match(/\b(\d+)\s+servings\b/i);
      if (m) return +m[1];
    }
    return null;
  }

  function parseRecipe(lines, filename, match) {
    const title = findTitle(lines, filename);
    const servings = findServings(lines);
    const titleIdx = Math.max(0, lines.findIndex((l) => l.text.startsWith(title.slice(0, 20))));

    // Where does the ingredient list start?
    let start = -1, splitX = null, splitPage = null;
    for (let i = titleIdx; i < lines.length; i++) {
      const segs = lines[i].segments;
      const s0 = squash(segs[0].text);
      if (/^(basic)?ingredients/.test(s0) && segs[0].text.split(/\s+/).length <= 8 || /^ingredients/i.test(squash(lines[i].text))) {
        start = i + 1;
        // Two-column layout? ("INGREDIENTS        PREPARATION")
        if (/ingredients(preparation|instructions|directions|method)/.test(squash(lines[i].text))) {
          // Two-column layout. The method column's left edge is the most common
          // text start position to the right of the ingredient column.
          splitPage = lines[i].page;
          const pageLines = lines.slice(i + 1).filter((l) => l.page === splitPage);
          const leftMin = Math.min(...pageLines.map((l) => l.x));
          const counts = {};
          for (const l of pageLines) for (const it of l.items) {
            if (it.x > leftMin + 60) { const k = Math.round(it.x / 3) * 3; counts[k] = (counts[k] || 0) + 1; }
          }
          const xs = Object.keys(counts).map(Number).filter((k) => counts[k] >= 3).sort((a, b) => a - b);
          if (xs.length) splitX = xs[0] - 3;
        }
        break;
      }
    }
    if (start < 0) {
      for (let i = titleIdx; i < lines.length; i++) {
        const t = lines[i].text.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, ''));
        if (/^\s*(serves|yield|makes|servings)\b/i.test(t)) { start = i + 1; break; }
      }
    }
    if (start < 0) start = titleIdx + 1;

    // Apply the column split.
    let section = lines.slice(start).map((l) => {
      if (splitX == null || l.page < splitPage) return l;
      const its = l.items.filter((it) => it.x < splitX);
      if (!its.length) return null;
      let text = '';
      let pr = null;
      for (const it of its) { text += (pr != null && it.x - pr > it.size * 0.12 && !/\s$/.test(text) ? ' ' : '') + it.str; pr = it.right; }
      text = unspace(text.replace(/\s+/g, ' ').trim()).replace(/^FORTHE(?=[A-Z])/, 'FOR THE ');
      if (!text) return null;
      return { ...l, segments: [{ text, x: its[0].x, right: its[its.length - 1].right }], text, right: its[its.length - 1].right };
    }).filter(Boolean);

    // Collect ingredient lines until the method starts.
    const collected = [];
    for (const l of section) {
      const t = normFractions(l.text).trim();
      if (!t) continue;
      if (/^(\*|https?:|page \d|www\.)/i.test(t)) break;
      if (STOP_RE.test(t)) break;
      if (VERB_RE.test(t) && (t.split(/\s+/).length >= 7 || /[˚°]|degrees/.test(t)) && !startsWithQty(t)) break;
      if (collected.length === 0 && /^(vegan|vegetarian|gluten[- ]free|dairy[- ]free|note)\b/i.test(t)) continue;
      if (!startsWithQty(t) && t.split(/\s+/).length > 16) break; // a paragraph
      if (!startsWithQty(t) && t.split(/\s+/).length > 9 && /[a-z]{2}\. [A-Z]/.test(t)) break; // sentences
      if (/^(time|total time|prep|cook|yield|serves|makes)\b/i.test(t) && collected.length === 0) continue;
      collected.push({ ...l, text: t });
      if (collected.length > 80) break;
    }

    const maxRight = Math.max(...collected.map((l) => l.right), 0);
    const minX = Math.min(...collected.map((l) => l.x), Infinity);
    const out = [];
    let prev = null;
    for (const l of collected) {
      const t = l.text.replace(/^[•·]\s*/, '');
      const qty = startsWithQty(t);
      let cont = false;
      const exactHeader = /:$/.test(t) || /^(optional|garnish|to serve|topping|batter|dough|filling|sauce)$/i.test(t);
      if (prev && !qty && !exactHeader && prev.type === 'ing') {
        const pt = prev.raw;
        const wide = (prev._right - minX) >= 0.8 * (maxRight - minX);
        if (/[,(\-\/]$/.test(pt) || /\b(and|or|plus|of|into|cut|to|about|with|from|the|a|at|such as|use|in|for)$/i.test(pt)) cont = true;
        else if (/^(and|or|plus|into|inch|chunks|only\b|\)|room temperature)/i.test(t)) cont = true;
        else if (/\([^)]*$/.test(pt)) cont = true; // unclosed bracket
        else if (splitX != null && /^[a-z]/.test(t)) cont = true; // narrow column: lowercase = wrapped line
        else if (wide && (/^[a-z]/.test(t) || t.split(/\s+/).length <= 2)) {
          // In a narrow column almost every short follow-on line is a wrap. On a
          // full-width page, only treat it as a wrap if it isn't an ingredient itself.
          cont = splitX != null || !match(parseIngredient(t));
        }
      }
      if (cont) {
        prev.raw = (prev.raw.replace(/-$/, '-') + (/-$/.test(prev.raw) ? '' : ' ') + t).replace(/\s+/g, ' ');
        prev._right = l.right;
        continue;
      }
      if (!qty && isHeader(t, match)) {
        prev = { type: 'header', raw: t.replace(/:$/, '') };
        out.push(prev);
        continue;
      }
      if (prev && prev.type === 'ing' && fold(prev.raw).replace(/[^a-z]/g, '').endsWith(fold(t).replace(/[^a-z]/g, ''))) continue;
      prev = { type: 'ing', raw: t, _right: l.right };
      out.push(prev);
    }

    // Split "salt and pepper"-style lines into separate items.
    const ingredients = [];
    let groupOptional = false;
    for (const o of out) {
      if (o.type === 'header') { groupOptional = /^optional$|\(optional/i.test(o.raw.trim()); ingredients.push({ header: true, raw: o.raw }); continue; }
      const p = parseIngredient(o.raw);
      if (groupOptional) p.optional = true;
      if (!p.amounts.length && /\band\b/i.test(p.matchText)) {
        const parts = p.matchText.split(/\s+and\s+/i);
        const items = parts.map((x) => match({ matchText: x }));
        if (parts.length > 1 && items.every(Boolean) && new Set(items.map((i) => i.id)).size === parts.length) {
          parts.forEach((x) => ingredients.push({ ...parseIngredient(x), raw: x.trim(), optional: p.optional, garnish: p.garnish }));
          continue;
        }
      }
      ingredients.push(p);
    }
    const text = lines.map((l) => l.text).join('\n');
    return { title, servings, ingredients, text };
  }

  const api = { parseRecipe, parseIngredient, buildMatcher, unitInfo, fold, normFractions, cleanFilename };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_PARSE = api;
})(typeof window !== 'undefined' ? window : globalThis);
