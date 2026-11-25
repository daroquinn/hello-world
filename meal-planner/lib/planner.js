/*
 * Shopping list, cost estimate, leftovers and "use it up" suggestions.
 */
(function (root) {
  const P = typeof module !== 'undefined' && module.exports ? require('./parse.js') : root.MP_PARSE;
  const CAT = typeof module !== 'undefined' && module.exports ? require('../data/catalog.js') : root.MP_CATALOG;
  const { unitInfo } = P;

  // How many base units of `item` is ONE of the given volume unit (ml)?
  function perMl(item) {
    const c = item.conv || {};
    if (c.ml) return c.ml;
    if (c.cup) return c.cup / 236.6;
    if (c.tbsp) return c.tbsp / 14.787;
    if (c.tsp) return c.tsp / 4.929;
    return null;
  }
  function perG(item) {
    const c = item.conv || {};
    if (c.g) return c.g;
    return null;
  }

  // Convert one amount {qty, unit} into item.base units. Returns {amount, approx} or null.
  function convertAmount(a, item, strict) {
    const c = item.conv || {};
    const info = unitInfo(a.unit) || { dim: 'count', unit: 'each' };
    const u = info.unit;
    if (info.dim === 'mass') {
      const g = a.qty * info.factor;
      if (item.base === 'g') return { amount: g };
      if (perG(item)) return { amount: g * perG(item) };
      if (item.base === 'ml' && !strict) return { amount: g, approx: true };
      return null;
    }
    if (info.dim === 'volume') {
      const ml = a.qty * info.factor;
      if (c[u] != null && u !== 'cup') return { amount: a.qty * c[u] };
      if (item.base === 'ml') return { amount: ml };
      if (perMl(item)) return { amount: ml * perMl(item) };
      if (item.base === 'g' && !strict) return { amount: ml, approx: true }; // assume water density
      return null;
    }
    // count units
    if (c[u] != null) return { amount: a.qty * c[u] };
    if (u === 'each' || u === 'egg') {
      if (item.base === 'each') return { amount: a.qty };
      if (c.each != null) return { amount: a.qty * c.each };
      if (!strict) return { amount: a.qty * item.pkg.size, approx: true };
      return null;
    }
    if (u === 'dozen') return convertAmount({ qty: a.qty * 12, unit: 'each' }, item, strict);
    if (['package', 'packet', 'can', 'block', 'jar', 'bag', 'box', 'bottle', 'carton', 'bunch', 'head'].includes(u)) {
      return { amount: a.qty * item.pkg.size, approx: !strict ? true : undefined };
    }
    if (u === 'pinch' && !strict) return { amount: item.base === 'g' ? 0.3 * a.qty : 0.1, approx: true };
    if (u === 'handful' && !strict) return { amount: item.base === 'g' ? 15 * a.qty : a.qty, approx: true };
    if (!strict && c.each != null) return { amount: a.qty * c.each, approx: true };
    if (!strict && item.base === 'each') return { amount: a.qty, approx: true };
    return null;
  }

  // Pick the best amount for this ingredient and convert to base units.
  function convertToBase(ing, item, scale = 1) {
    const list = (ing.amounts || []).map((a) => ({ ...a, qty: a.qty * scale }));
    if (!list.length) return { amount: (item.dflt || 0) * scale, unquantified: true };
    // 0) the recipe's main amount is a counted unit we know exactly ("1 block tofu", "2 heads")
    const main = list[0];
    const mi = unitInfo(main.unit) || { dim: 'count', unit: 'each' };
    if (mi.dim === 'count' && ((item.conv || {})[mi.unit] != null || (mi.unit === 'each' && item.base === 'each'))) return convertAmount(main, item, true);
    // 1) an amount already in the item's own dimension (e.g. "(200g)" for a gram-based item)
    for (const a of list) {
      const info = unitInfo(a.unit);
      if (!info) continue;
      if ((item.base === 'g' && info.dim === 'mass') || (item.base === 'ml' && info.dim === 'volume')) return convertAmount(a, item, true);
    }
    // 2) the first amount with an exact conversion
    for (const a of list) { const r = convertAmount(a, item, true); if (r) return r; }
    // 3) anything at all, flagged approximate
    for (const a of list) { const r = convertAmount(a, item, false); if (r) return { ...r, approx: true }; }
    return { amount: (item.dflt || 0) * scale, unquantified: true };
  }

  function perishOf(item) {
    if (item.perish != null) return item.perish;
    return CAT.SECTION_PERISH[item.cat] ?? 0.5;
  }

  /*
   * recipes:  [{ id, title, ingredients }]
   * plan:     [{ recipeId, scale }]
   * catalog:  merged catalog (defaults + overrides + custom items)
   * opts:     { pantry: Set(itemId), includeOptional: bool, match: fn }
   */
  function computeList(recipes, plan, catalog, opts) {
    const byId = Object.fromEntries(catalog.map((i) => [i.id, i]));
    const recipeById = Object.fromEntries(recipes.map((r) => [r.id, r]));
    const need = {}; // itemId -> { item, amount, uses: [] , approx, unquantified }
    const unmatched = [];
    for (const entry of plan) {
      const r = recipeById[entry.recipeId];
      if (!r) continue;
      for (const ing of r.ingredients) {
        if (ing.header || ing.removed || (ing.free && !ing.itemId)) continue;
        if (ing.optional && !opts.includeOptional) continue;
        const item = ing.itemId === '__none' ? null : ing.itemId ? byId[ing.itemId] : opts.match(ing);
        if (!item) { if (ing.itemId !== '__none') unmatched.push({ recipe: r.title, raw: ing.raw }); continue; }
        const conv = convertToBase(ing, item, entry.scale || 1);
        const n = (need[item.id] = need[item.id] || { item, amount: 0, uses: [], approx: false, unquantified: false });
        n.amount += conv.amount;
        n.approx = n.approx || !!conv.approx;
        n.unquantified = n.unquantified || !!conv.unquantified;
        n.uses.push({ recipe: r.title, recipeId: r.id, raw: ing.raw, amount: conv.amount });
      }
    }
    const lines = [];
    let total = 0;
    for (const n of Object.values(need)) {
      const item = n.item;
      const have = opts.pantry.has(item.id);
      let buyUnits = 0, packages = 0, cost = 0;
      if (!have) {
        if (item.sold === 'weight') {
          buyUnits = Math.max(n.amount, item.minBuy || 0, 1);
          cost = (buyUnits / item.pkg.size) * item.pkg.price;
        } else {
          packages = Math.max(1, Math.ceil(n.amount / item.pkg.size - 1e-6));
          buyUnits = packages * item.pkg.size;
          cost = packages * item.pkg.price;
        }
      }
      const leftover = have ? 0 : Math.max(0, buyUnits - n.amount);
      total += cost;
      lines.push({ ...n, have, packages, buyUnits, cost, leftover, leftoverValue: (leftover / item.pkg.size) * item.pkg.price, perish: perishOf(item) });
    }
    const order = CAT.SECTION_ORDER;
    lines.sort((a, b) => (order.indexOf(a.item.cat) - order.indexOf(b.item.cat)) || a.item.name.localeCompare(b.item.name));
    return { lines, total, unmatched };
  }

  // Rank recipes NOT in the plan by how much leftover (perishable) food they would use.
  function suggest(recipes, plan, catalog, opts, limit = 6) {
    const inPlan = new Set(plan.map((p) => p.recipeId));
    const base = computeList(recipes, plan, catalog, opts);
    const leftovers = Object.fromEntries(base.lines.filter((l) => l.leftover > 0).map((l) => [l.item.id, l]));
    if (!Object.keys(leftovers).length) return [];
    const out = [];
    for (const r of recipes) {
      if (inPlan.has(r.id)) continue;
      const solo = computeList(recipes, [{ recipeId: r.id, scale: 1 }], catalog, { ...opts });
      let score = 0;
      const uses = [];
      for (const l of solo.lines) {
        const left = leftovers[l.item.id];
        if (!left || l.unquantified && !l.amount) continue;
        const used = Math.min(l.amount, left.leftover);
        if (used <= 0) continue;
        const value = (used / l.item.pkg.size) * l.item.pkg.price;
        score += value * left.perish;
        uses.push({ item: l.item, used, value, fraction: used / left.leftover });
      }
      if (score < 0.05) continue;
      const withR = computeList(recipes, plan.concat([{ recipeId: r.id, scale: 1 }]), catalog, opts);
      const before = Object.fromEntries(base.lines.map((l) => [l.item.id, l.cost]));
      let extraFresh = 0, extraPantry = 0;
      for (const l of withR.lines) {
        const d = l.cost - (before[l.item.id] || 0);
        if (d <= 0.001) continue;
        if (perishOf(l.item) >= 0.3) extraFresh += d; else extraPantry += d;
      }
      out.push({ recipe: r, score, uses: uses.sort((a, b) => b.value * perishOf(b.item) - a.value * perishOf(a.item)), extraCost: withR.total - base.total, extraFresh, extraPantry });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }

  // Human-readable amounts
  function fmtAmount(amount, item) {
    const r = (x, d = 1) => (Math.round(x * 10 ** d) / 10 ** d).toString();
    if (item.base === 'g') {
      if (amount >= 1000) return `${r(amount / 1000, 2)} kg (${r(amount / 453.6, 1)} lb)`;
      if (amount >= 100) return `${Math.round(amount)} g (${r(amount / 28.35, 1)} oz)`;
      return `${r(amount, amount < 10 ? 1 : 0)} g`;
    }
    if (item.base === 'ml') {
      if (amount >= 60) return `${r(amount / 236.6, 2)} cups`;
      if (amount >= 14) return `${r(amount / 14.787, 1)} tbsp`;
      return `${r(amount / 4.929, 1)} tsp`;
    }
    let label = item.unitLabel || '';
    if (label && amount <= 1.0001) label = label.replace(/ies$/, 'i').replace(/s$/, '');
    return `${r(amount, amount < 3 ? 2 : 1)}${label ? ' ' + label : ''}`;
  }

  const api = { convertToBase, convertAmount, computeList, suggest, fmtAmount, perishOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_PLANNER = api;
})(typeof window !== 'undefined' ? window : globalThis);
