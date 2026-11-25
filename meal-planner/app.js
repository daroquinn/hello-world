/* Meal Planner UI. Plain JavaScript, no build step. */
(function () {
  const { CATALOG, SECTION_ORDER } = window.MP_CATALOG;
  const P = window.MP_PARSE;
  const PL = window.MP_PLANNER;
  const S = window.MP_STORE;
  const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs';
  const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';

  const state = {
    recipes: [],
    plan: [],          // [{ recipeId, scale }]
    pantry: new Set(), // item ids you already have
    overrides: {},     // itemId -> { price, label, size }
    custom: [],        // user-added catalog items
    checked: new Set(),
    includeOptional: true,
    catalog: [],
    match: null,
  };

  // ---------- helpers ----------
  const $ = (sel, el = document) => el.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n) => `$${(Math.round(n * 100) / 100).toFixed(2)}`;
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  const hebLink = (name) => `https://www.heb.com/search?q=${encodeURIComponent(name)}`;

  function rebuildCatalog() {
    state.catalog = CATALOG.concat(state.custom).map((it) => {
      const o = state.overrides[it.id];
      if (!o) return it;
      return { ...it, pkg: { ...it.pkg, ...o } };
    });
    state.match = P.buildMatcher(state.catalog);
  }
  const itemById = (id) => state.catalog.find((i) => i.id === id);
  function itemFor(ing) {
    if (ing.itemId === '__none') return null;
    if (ing.itemId) return itemById(ing.itemId) || null;
    if (ing.free) return null;
    return state.match(ing);
  }
  const opts = () => ({ pantry: state.pantry, includeOptional: state.includeOptional, match: state.match });

  async function savePrefs() {
    await Promise.all([
      S.setKV('plan', state.plan),
      S.setKV('pantry', [...state.pantry]),
      S.setKV('overrides', state.overrides),
      S.setKV('custom', state.custom),
      S.setKV('checked', [...state.checked]),
      S.setKV('includeOptional', state.includeOptional),
    ]);
  }

  // ---------- PDF import ----------
  let pdfjsPromise = null;
  function loadPdfjs() {
    if (!pdfjsPromise) {
      pdfjsPromise = import(PDFJS_URL).then((m) => { m.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; return m; });
    }
    return pdfjsPromise;
  }

  async function importFiles(files) {
    const status = $('#uploadStatus');
    const pdfs = [...files].filter((f) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) { status.textContent = 'Those files are not PDFs.'; return; }
    let pdfjs;
    try { pdfjs = await loadPdfjs(); } catch (e) {
      status.innerHTML = '<span class="warn">Could not load the PDF reader. It comes from cdn.jsdelivr.net, so you need an internet connection.</span>';
      return;
    }
    let ok = 0; const problems = [];
    for (const [n, f] of pdfs.entries()) {
      status.textContent = `Reading ${n + 1} of ${pdfs.length}: ${f.name}…`;
      if (state.recipes.some((r) => r.filename === f.name && r.size === f.size)) { problems.push(`${f.name}: already uploaded`); continue; }
      try {
        const buf = await f.arrayBuffer();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
        const lines = await window.MP_PDF.extractLines(doc);
        if (!lines.length) { problems.push(`${f.name}: no text found (it may be a scanned image)`); continue; }
        const parsed = P.parseRecipe(lines, f.name, state.match);
        const id = uid();
        const recipe = { id, filename: f.name, size: f.size, addedAt: Date.now(), title: parsed.title, servings: parsed.servings, ingredients: parsed.ingredients, text: parsed.text };
        await S.put('files', { id, blob: new Blob([buf], { type: 'application/pdf' }) });
        await S.put('recipes', recipe);
        state.recipes.push(recipe);
        ok++;
      } catch (e) {
        console.error(e);
        problems.push(`${f.name}: ${e.message || 'could not be read'}`);
      }
    }
    status.innerHTML = `Added ${ok} recipe${ok === 1 ? '' : 's'}.` + (problems.length ? ` <span class="warn">${problems.map(esc).join('; ')}</span>` : '') + (ok ? ' Open a recipe to check its ingredients.' : '');
    renderAll();
  }

  // ---------- Recipes tab ----------
  function searchTokens() { return P.fold($('#search').value).split(/[^a-z0-9]+/).filter(Boolean); }
  function highlight(title, tokens) {
    if (!tokens.length) return esc(title);
    return title.split(/(\s+)/).map((w) => {
      const f = P.fold(w).replace(/[^a-z0-9]/g, '');
      const tok = tokens.find((t) => f.startsWith(t));
      if (!tok) return esc(w);
      const lead = w.match(/^[^A-Za-z0-9À-ɏ]*/)[0].length;
      return esc(w.slice(0, lead)) + '<mark>' + esc(w.slice(lead, lead + tok.length)) + '</mark>' + esc(w.slice(lead + tok.length));
    }).join('');
  }
  function renderRecipes() {
    const el = $('#recipeList');
    const tokens = searchTokens();
    const alsoIng = $('#searchIngredients').checked;
    const inPlan = new Set(state.plan.map((p) => p.recipeId));
    const list = state.recipes
      .filter((r) => {
        if (!tokens.length) return true;
        const words = P.fold(r.title).split(/[^a-z0-9]+/);
        const ingWords = alsoIng ? P.fold(r.ingredients.map((i) => i.raw).join(' ')).split(/[^a-z0-9]+/) : [];
        return tokens.every((t) => words.some((w) => w.startsWith(t)) || ingWords.some((w) => w.startsWith(t)));
      })
      .sort((a, b) => a.title.localeCompare(b.title));
    if (!state.recipes.length) { el.innerHTML = '<div class="empty">No recipes yet. Upload some PDFs to get started.</div>'; return; }
    if (!list.length) { el.innerHTML = `<div class="empty">No recipe titles match “${esc($('#search').value)}”.</div>`; return; }
    el.innerHTML = list.map((r) => {
      const ings = r.ingredients.filter((i) => !i.header && !i.removed);
      const unmatched = ings.filter((i) => !itemFor(i) && i.itemId !== '__none' && !i.free).length;
      const planned = inPlan.has(r.id);
      return `<article class="card ${planned ? 'inplan' : ''}">
        <h4 data-open="${r.id}">${highlight(r.title, tokens)}</h4>
        <div class="meta">${r.servings ? `Serves ${r.servings} · ` : ''}${ings.length} ingredients${unmatched ? ` · <span class="warn">${unmatched} need a store item</span>` : ''}</div>
        <div class="actions">
          ${planned ? `<button class="btn small" data-unplan="${r.id}">✓ In plan, remove</button>` : `<button class="btn small primary" data-plan="${r.id}">Add to plan</button>`}
          <button class="btn small" data-open="${r.id}">Review</button>
        </div>
      </article>`;
    }).join('');
  }

  // ---------- Recipe dialog ----------
  let openId = null;
  function itemOptions(selected, auto) {
    const items = [...state.catalog].sort((a, b) => a.name.localeCompare(b.name));
    return `<option value="">${auto ? `Auto: ${esc(auto.name)}` : 'Auto: (no match)'}</option>
      <option value="__none" ${selected === '__none' ? 'selected' : ''}>Not a shopping item</option>
      ${items.map((i) => `<option value="${i.id}" ${selected === i.id ? 'selected' : ''}>${esc(i.name)}</option>`).join('')}`;
  }
  function renderDialog() {
    const r = state.recipes.find((x) => x.id === openId);
    if (!r) return;
    $('#dTitle').value = r.title;
    $('#dServings').value = r.servings || '';
    $('#dFile').textContent = r.filename;
    const rows = r.ingredients.map((ing, idx) => {
      if (ing.removed) return '';
      if (ing.header) return `<tr class="hdr"><td colspan="4">${esc(ing.raw)}</td><td><button class="btn small ghost" data-rm="${idx}" title="Remove">✕</button></td></tr>`;
      const auto = ing.free ? null : state.match(ing);
      const item = itemFor(ing);
      let amt = '';
      if (item) {
        const c = PL.convertToBase(ing, item, 1);
        amt = c.unquantified ? '<span class="small">no amount given</span>' : `${esc(PL.fmtAmount(c.amount, item))}${c.approx ? ' <span class="small" title="Estimated conversion">≈</span>' : ''}`;
      } else if (ing.itemId !== '__none' && !ing.free) amt = '<span class="warn">pick a store item</span>';
      else amt = '<span class="small">not bought</span>';
      return `<tr>
        <td><input class="raw" data-raw="${idx}" value="${esc(ing.raw)}"></td>
        <td><select data-item="${idx}">${itemOptions(ing.itemId, auto)}</select></td>
        <td class="num">${amt}</td>
        <td><label class="check" title="Optional ingredient"><input type="checkbox" data-opt="${idx}" ${ing.optional ? 'checked' : ''}> optional</label></td>
        <td><button class="btn small ghost" data-rm="${idx}" title="Remove">✕</button></td>
      </tr>`;
    }).join('');
    $('#dIngredients').innerHTML = `<div class="table-wrap"><table class="ing-table"><thead><tr><th>From the recipe</th><th>Store item</th><th class="num">Amount</th><th></th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="5">No ingredients found. Add them below.</td></tr>'}</tbody></table></div>`;
  }
  async function saveOpen() {
    const r = state.recipes.find((x) => x.id === openId);
    if (r) await S.put('recipes', r);
    renderAll(false);
  }
  function openRecipe(id) {
    openId = id;
    renderDialog();
    $('#recipeDialog').showModal();
  }

  // ---------- Plan tab ----------
  function renderPlan() {
    const el = $('#planList');
    const recipeById = Object.fromEntries(state.recipes.map((r) => [r.id, r]));
    state.plan = state.plan.filter((p) => recipeById[p.recipeId]);
    if (!state.plan.length) {
      el.innerHTML = '<div class="empty">Your plan is empty. Add recipes from the Recipes tab.</div>';
      $('#planSummary').innerHTML = '';
    } else {
      el.innerHTML = state.plan.map((p) => {
        const r = recipeById[p.recipeId];
        return `<div class="plan-row">
          <span class="t" data-open="${r.id}">${esc(r.title)}</span>
          <select data-scale="${r.id}" title="Make more or less">
            ${[0.5, 1, 1.5, 2, 3].map((s) => `<option value="${s}" ${+p.scale === s ? 'selected' : ''}>${s}× ${r.servings ? `(${Math.round(r.servings * s * 10) / 10} servings)` : ''}</option>`).join('')}
          </select>
          <button class="btn small ghost" data-unplan="${r.id}" title="Remove from plan">✕</button>
        </div>`;
      }).join('');
    }
    const res = PL.computeList(state.recipes, state.plan, state.catalog, opts());
    if (state.plan.length) {
      $('#planSummary').innerHTML = `Estimated shopping cost: <strong>${money(res.total)}</strong> <span class="small">for ${res.lines.filter((l) => !l.have).length} items, not counting what you have at home</span>`;
    }
    const left = res.lines.filter((l) => l.leftover > 0 && l.leftover / l.item.pkg.size > 0.05 && l.item.sold !== 'weight')
      .sort((a, b) => b.leftoverValue * b.perish - a.leftoverValue * a.perish);
    $('#leftovers').innerHTML = left.length
      ? `<div class="chips">${left.map((l) => `<span class="chip" title="About ${money(l.leftoverValue)} worth">${esc(l.item.name)}: ${esc(PL.fmtAmount(l.leftover, l.item))}</span>`).join('')}</div>`
      : '<p class="hint">Nothing significant.</p>';

    const sug = PL.suggest(state.recipes, state.plan, state.catalog, opts());
    $('#suggestions').innerHTML = !state.plan.length ? '<div class="empty">Add a recipe to your plan and suggestions will show up here.</div>'
      : !sug.length ? '<div class="empty">None of your other recipes use up the leftovers.</div>'
        : sug.map((s) => `<div class="sugg">
          <h4>${esc(s.recipe.title)}</h4>
          <div class="uses">Uses up ${s.uses.slice(0, 5).map((u) => `<b>${esc(u.item.name.toLowerCase())}</b> (${esc(PL.fmtAmount(u.used, u.item))})`).join(', ')}${s.uses.length > 5 ? ` and ${s.uses.length - 5} more` : ''}.</div>
          <div class="toolbar" style="margin:0">
            <span class="small">Adds ~${money(s.extraFresh)} of fresh food${s.extraPantry > 0.01 ? ` + ${money(s.extraPantry)} pantry/spices you may already have` : ''} · uses ~${money(s.uses.reduce((a, u) => a + u.value, 0))} of leftovers</span>
            <span class="spacer"></span>
            <button class="btn small" data-open="${s.recipe.id}">Review</button>
            <button class="btn small primary" data-plan="${s.recipe.id}">Add</button>
          </div>
        </div>`).join('');
  }

  // ---------- Shopping list ----------
  function buyLabel(l) {
    if (l.have) return '<span class="ok">have at home</span>';
    if (l.item.sold === 'weight') return `${esc(PL.fmtAmount(l.buyUnits, l.item))} <span class="small">(${esc(l.item.pkg.label)})</span>`;
    return `${l.packages} × ${esc(l.item.pkg.label)}`;
  }
  function renderList() {
    const el = $('#shoppingList');
    if (!state.plan.length) { el.innerHTML = '<div class="empty">Add recipes to your plan to build a shopping list.</div>'; return; }
    const res = PL.computeList(state.recipes, state.plan, state.catalog, opts());
    const groups = {};
    for (const l of res.lines) (groups[l.have ? 'Already at home' : l.item.cat] = groups[l.have ? 'Already at home' : l.item.cat] || []).push(l);
    const order = SECTION_ORDER.concat(['Already at home']);
    let html = `<div class="list-total"><span>Estimated total: <strong>${money(res.total)}</strong></span></div>`;
    for (const sec of order.filter((s) => groups[s])) {
      html += `<div class="section"><h3>${esc(sec)}</h3><div class="table-wrap"><table><thead><tr><th style="width:2em"></th><th>Item</th><th class="hide-sm">Recipes need</th><th>Buy</th><th class="num">Est.</th><th class="num hide-sm">Left over</th><th></th></tr></thead><tbody>`;
      for (const l of groups[sec]) {
        const done = state.checked.has(l.item.id);
        const uses = l.uses.map((u) => `${u.recipe}: ${u.raw}`).join('\n');
        html += `<tr class="${done ? 'done' : ''}">
          <td><input type="checkbox" data-got="${l.item.id}" ${done ? 'checked' : ''} aria-label="Got it"></td>
          <td><span class="iname" title="${esc(uses)}">${esc(l.item.name)}</span>${l.item.note ? `<div class="small warn">${esc(l.item.note)}</div>` : ''}<div class="small">${l.uses.map((u) => esc(u.recipe)).filter((v, i, a) => a.indexOf(v) === i).join(' · ')}</div></td>
          <td class="hide-sm">${l.unquantified && !l.amount ? '<span class="small">some</span>' : esc(PL.fmtAmount(l.amount, l.item))}${l.approx ? ' <span class="small" title="Includes an estimated conversion">≈</span>' : ''}</td>
          <td>${buyLabel(l)}</td>
          <td class="num">${l.have ? '' : money(l.cost)}</td>
          <td class="num hide-sm">${l.leftover > 0 && l.item.sold !== 'weight' ? esc(PL.fmtAmount(l.leftover, l.item)) : ''}</td>
          <td class="num"><a class="heb small" href="${hebLink(l.item.name)}" target="_blank" rel="noopener">H-E-B ↗</a><br>
            <button class="btn small ghost" data-have="${l.item.id}">${l.have ? 'Need it' : 'Have it'}</button></td>
        </tr>`;
      }
      html += '</tbody></table></div></div>';
    }
    if (res.unmatched.length) {
      html += `<div class="section"><h3>Not priced: pick a store item for these</h3><ul>${res.unmatched.map((u) => `<li>${esc(u.raw)} <span class="small">(${esc(u.recipe)})</span></li>`).join('')}</ul></div>`;
    }
    el.innerHTML = html;
  }
  function listAsText() {
    const res = PL.computeList(state.recipes, state.plan, state.catalog, opts());
    const lines = [`Shopping list (est. ${money(res.total)} at H-E-B)`];
    let sec = null;
    for (const l of res.lines.filter((x) => !x.have)) {
      if (l.item.cat !== sec) { sec = l.item.cat; lines.push('', sec.toUpperCase()); }
      const buy = l.item.sold === 'weight' ? PL.fmtAmount(l.buyUnits, l.item) : `${l.packages} × ${l.item.pkg.label}`;
      lines.push(`[ ] ${l.item.name} (${buy}), ~${money(l.cost)}`);
    }
    for (const u of res.unmatched) lines.push(`[ ] ${u.raw} (unpriced)`);
    return lines.join('\n');
  }

  // ---------- Prices & pantry ----------
  function renderPrices() {
    const q = P.fold($('#priceSearch').value);
    const onlyPantry = $('#pantryOnly').checked;
    const items = state.catalog
      .filter((i) => (!q || P.fold(i.name + ' ' + (i.aliases || []).join(' ')).includes(q)) && (!onlyPantry || state.pantry.has(i.id)))
      .sort((a, b) => (SECTION_ORDER.indexOf(a.cat) - SECTION_ORDER.indexOf(b.cat)) || a.name.localeCompare(b.name));
    $('#priceTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Have</th><th>Item</th><th class="hide-sm">Section</th><th>Package</th><th class="num">Price</th><th></th></tr></thead><tbody>
      ${items.map((i) => {
        const custom = state.custom.some((c) => c.id === i.id);
        const edited = !!state.overrides[i.id];
        return `<tr>
          <td><input type="checkbox" data-pantry="${i.id}" ${state.pantry.has(i.id) ? 'checked' : ''} aria-label="I have this at home"></td>
          <td><span class="iname">${esc(i.name)}</span>${i.note ? `<div class="small warn">${esc(i.note)}</div>` : ''}${i.sold === 'weight' ? '<div class="small">sold by weight</div>' : ''}</td>
          <td class="hide-sm small">${esc(i.cat)}</td>
          <td><input class="label-input" data-label="${i.id}" value="${esc(i.pkg.label)}" aria-label="Package description"></td>
          <td class="num">$<input class="price-input" type="number" step="0.01" min="0" data-price="${i.id}" value="${i.pkg.price.toFixed(2)}" aria-label="Price"></td>
          <td class="num"><a class="heb small" href="${hebLink(i.name)}" target="_blank" rel="noopener">H-E-B ↗</a>
            ${edited ? `<button class="btn small ghost" data-reset="${i.id}" title="Back to the default price">reset</button>` : ''}
            ${custom ? `<button class="btn small ghost" data-delitem="${i.id}" title="Delete item">delete</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }

  // ---------- render all ----------
  function renderAll(dialogToo = true) {
    $('#planCount').textContent = state.plan.length;
    const res = PL.computeList(state.recipes, state.plan, state.catalog, opts());
    $('#listTotal').textContent = money(res.total);
    renderRecipes();
    renderPlan();
    renderList();
    renderPrices();
    if (dialogToo && $('#recipeDialog').open) renderDialog();
  }

  // ---------- events ----------
  function switchTab(name) {
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${name}`));
    try { localStorage.setItem('mp-tab', name); } catch (e) { /* ignore */ }
  }
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-tab],[data-open],[data-plan],[data-unplan],[data-have],[data-reset],[data-delitem],[data-rm]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab) { e.preventDefault(); switchTab(d.tab); return; }
    if (d.open) { openRecipe(d.open); return; }
    if (d.plan) { if (!state.plan.some((p) => p.recipeId === d.plan)) state.plan.push({ recipeId: d.plan, scale: 1 }); await savePrefs(); renderAll(); return; }
    if (d.unplan) { state.plan = state.plan.filter((p) => p.recipeId !== d.unplan); await savePrefs(); renderAll(); return; }
    if (d.have) { state.pantry.has(d.have) ? state.pantry.delete(d.have) : state.pantry.add(d.have); await savePrefs(); renderAll(); return; }
    if (d.reset) { delete state.overrides[d.reset]; rebuildCatalog(); await savePrefs(); renderAll(); return; }
    if (d.delitem) { state.custom = state.custom.filter((c) => c.id !== d.delitem); rebuildCatalog(); await savePrefs(); renderAll(); return; }
    if (d.rm != null) {
      const r = state.recipes.find((x) => x.id === openId);
      r.ingredients[+d.rm].removed = true;
      await saveOpen(); renderDialog(); return;
    }
  });
  document.addEventListener('change', async (e) => {
    const t = e.target; const d = t.dataset;
    if (d.scale) { const p = state.plan.find((x) => x.recipeId === d.scale); p.scale = +t.value; await savePrefs(); renderAll(); return; }
    if (d.got) { t.checked ? state.checked.add(d.got) : state.checked.delete(d.got); await savePrefs(); renderList(); return; }
    if (d.pantry) { t.checked ? state.pantry.add(d.pantry) : state.pantry.delete(d.pantry); await savePrefs(); renderAll(); return; }
    if (d.price || d.label) {
      const id = d.price || d.label;
      const o = (state.overrides[id] = state.overrides[id] || {});
      if (d.price) { const v = parseFloat(t.value); if (!isNaN(v) && v >= 0) o.price = v; }
      else o.label = t.value.trim() || itemById(id).pkg.label;
      rebuildCatalog(); await savePrefs(); renderAll(); return;
    }
    const r = state.recipes.find((x) => x.id === openId);
    if (r && d.raw != null) {
      const old = r.ingredients[+d.raw];
      const p = P.parseIngredient(t.value);
      r.ingredients[+d.raw] = { ...p, itemId: old.itemId, optional: p.optional || old.optional };
      await saveOpen(); renderDialog(); return;
    }
    if (r && d.item != null) { r.ingredients[+d.item].itemId = t.value || undefined; await saveOpen(); renderDialog(); return; }
    if (r && d.opt != null) { r.ingredients[+d.opt].optional = t.checked; await saveOpen(); return; }
  });

  $('#fileInput').addEventListener('change', (e) => { importFiles(e.target.files); e.target.value = ''; });
  const drop = $('#drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => importFiles(e.dataTransfer.files));
  $('#search').addEventListener('input', renderRecipes);
  $('#searchIngredients').addEventListener('change', renderRecipes);
  $('#priceSearch').addEventListener('input', renderPrices);
  $('#pantryOnly').addEventListener('change', renderPrices);
  $('#includeOptional').addEventListener('change', async (e) => { state.includeOptional = e.target.checked; await savePrefs(); renderAll(); });
  $('#clearChecked').addEventListener('click', async () => { state.checked.clear(); await savePrefs(); renderList(); });
  $('#printList').addEventListener('click', () => { switchTab('list'); window.print(); });
  $('#copyList').addEventListener('click', async () => {
    const text = listAsText();
    try { await navigator.clipboard.writeText(text); $('#copyList').textContent = 'Copied ✓'; }
    catch (e) { window.prompt('Copy your list:', text); }
    setTimeout(() => { $('#copyList').textContent = 'Copy as text'; }, 1500);
  });

  // dialog
  $('#dTitle').addEventListener('change', async (e) => { const r = state.recipes.find((x) => x.id === openId); r.title = e.target.value.trim() || r.title; await saveOpen(); });
  $('#dServings').addEventListener('change', async (e) => { const r = state.recipes.find((x) => x.id === openId); r.servings = +e.target.value || null; await saveOpen(); });
  $('#dAddLine').addEventListener('click', async () => {
    const v = $('#dNewLine').value.trim(); if (!v) return;
    const r = state.recipes.find((x) => x.id === openId);
    r.ingredients.push(P.parseIngredient(v)); $('#dNewLine').value = '';
    await saveOpen(); renderDialog();
  });
  $('#dNewLine').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#dAddLine').click(); } });
  $('#dViewPdf').addEventListener('click', async () => {
    const f = await S.get('files', openId);
    if (!f) { alert('The original PDF is not stored for this recipe (it may have come from a backup).'); return; }
    window.open(URL.createObjectURL(f.blob), '_blank');
  });
  $('#dDelete').addEventListener('click', async () => {
    const r = state.recipes.find((x) => x.id === openId);
    if (!confirm(`Delete “${r.title}”? This can't be undone.`)) return;
    await S.del('recipes', r.id); await S.del('files', r.id);
    state.recipes = state.recipes.filter((x) => x.id !== r.id);
    state.plan = state.plan.filter((p) => p.recipeId !== r.id);
    await savePrefs();
    $('#recipeDialog').close(); renderAll();
  });

  // add custom item
  const catSel = $('#addItemForm select[name=cat]');
  catSel.innerHTML = SECTION_ORDER.map((c) => `<option>${esc(c)}</option>`).join('');
  $('#addItemForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = f.get('name').trim();
    const aliases = [name.toLowerCase(), ...String(f.get('aliases') || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)];
    const item = { id: 'custom_' + uid(), name, cat: f.get('cat'), base: f.get('base'), pkg: { size: +f.get('size'), label: f.get('label') || `${f.get('size')} ${f.get('base')}`, price: +f.get('price') }, aliases, conv: {} };
    if (+f.get('cup')) item.conv.cup = +f.get('cup');
    state.custom.push(item);
    rebuildCatalog(); await savePrefs(); e.target.reset(); renderAll();
  });

  // backup / restore (recipes + settings; PDFs themselves are not included)
  $('#exportData').addEventListener('click', () => {
    const data = { version: 1, exportedAt: new Date().toISOString(), recipes: state.recipes, plan: state.plan, pantry: [...state.pantry], overrides: state.overrides, custom: state.custom };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    a.download = `meal-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  });
  $('#importData').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.recipes)) throw new Error('not a Meal Planner backup');
      if (!confirm(`Restore ${data.recipes.length} recipes and your settings? Recipes with the same ID are replaced.`)) return;
      for (const r of data.recipes) { await S.put('recipes', r); }
      state.recipes = await S.all('recipes');
      state.plan = data.plan || []; state.pantry = new Set(data.pantry || []); state.overrides = data.overrides || {}; state.custom = data.custom || [];
      rebuildCatalog(); await savePrefs(); renderAll();
    } catch (err) { alert('Could not restore: ' + err.message); }
    e.target.value = '';
  });

  // ---------- start ----------
  (async function init() {
    try {
      state.recipes = await S.all('recipes');
      state.plan = await S.getKV('plan', []);
      const pantry = await S.getKV('pantry', null);
      state.pantry = new Set(pantry || CATALOG.filter((i) => i.staple).map((i) => i.id));
      state.overrides = await S.getKV('overrides', {});
      state.custom = await S.getKV('custom', []);
      state.checked = new Set(await S.getKV('checked', []));
      state.includeOptional = await S.getKV('includeOptional', true);
    } catch (e) {
      $('#uploadStatus').innerHTML = '<span class="warn">This browser blocked local storage, so nothing you do here will be saved.</span>';
    }
    $('#includeOptional').checked = state.includeOptional;
    rebuildCatalog();
    let tab = 'recipes';
    try { tab = localStorage.getItem('mp-tab') || tab; } catch (e) { /* ignore */ }
    switchTab(tab);
    renderAll();
  })();
})();
