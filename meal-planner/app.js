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

  // items: File objects, or { file, path, folder } when they come from a folder.
  // ---------- Text recognition (OCR) for scanned / image-only PDFs ----------
  // Uses Tesseract.js from cdn.jsdelivr.net. The hosted page's security rules block
  // the language data download, so OCR only runs in the downloaded app.
  const OCR = {
    script: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js',
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1',
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
    maxPages: 6,
  };
  const canOcr = window.self === window.top;
  let ocrWorkerP = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('could not load the text-recognition library'));
      document.head.appendChild(s);
    });
  }
  function getOcrWorker() {
    if (!ocrWorkerP) {
      ocrWorkerP = (async () => {
        if (!window.Tesseract) await loadScript(OCR.script);
        return window.Tesseract.createWorker('eng', 1, { workerPath: OCR.workerPath, corePath: OCR.corePath, langPath: OCR.langPath });
      })();
      ocrWorkerP.catch(() => { ocrWorkerP = null; });
    }
    return ocrWorkerP;
  }
  // Render each page to an image, recognise the words, and turn them into the same
  // positioned lines the normal PDF reader produces.
  async function ocrLines(doc, onPage) {
    const worker = await getOcrWorker();
    const out = [];
    const pages = Math.min(doc.numPages, OCR.maxPages);
    for (let p = 1; p <= pages; p++) {
      onPage(p, pages);
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 2400 / base.width);
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const { data } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const H = canvas.height;
      const items = [];
      for (const block of data.blocks || []) for (const par of block.paragraphs || []) for (const line of par.lines || []) {
        const lh = line.bbox.y1 - line.bbox.y0;
        const y = (H - line.bbox.y1) / scale;
        const size = Math.max(4, (lh * 0.8) / scale);
        for (const w of line.words || []) {
          const t = (w.text || '').trim();
          if (!t) continue;
          items.push({ str: t, x: w.bbox.x0 / scale, y, w: (w.bbox.x1 - w.bbox.x0) / scale, size });
        }
      }
      out.push(...window.MP_PDF.groupItems(items, p));
    }
    return out;
  }

  // Read a PDF's text: the embedded text if there is any, otherwise OCR.
  async function readPdf(buf, name, status) {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    let lines = await window.MP_PDF.extractLines(doc);
    if (lines.length) return { lines, ocr: false };
    if (!canOcr) return { lines: [], ocr: false, why: 'it\'s a scanned image; open the downloaded app to read it' };
    try {
      lines = await ocrLines(doc, (p, n) => status(`Reading ${name} as a scanned image, page ${p} of ${n}. This takes a few seconds per page…`));
    } catch (e) {
      console.error(e);
      return { lines: [], ocr: false, why: `it's a scanned image and text recognition failed (${e.message || e}). Text recognition needs an internet connection` };
    }
    return { lines, ocr: true, why: lines.length ? null : 'no readable text, even with text recognition' };
  }

  async function importFiles(items, opt = {}) {
    const status = $('#uploadStatus');
    const all = [...items].map((x) => (x instanceof File ? { file: x, path: null, folder: null } : x));
    const pdfs = all.filter(({ file: f }) => /pdf$/i.test(f.type) || /\.pdf$/i.test(f.name));
    if (!pdfs.length) {
      if (opt.fromFolder) { status.textContent = `Checked ${opt.fromFolder}: no new recipes.`; renderAll(); }
      else status.textContent = 'No PDF files were found there.';
      return;
    }
    let pdfjs;
    try { pdfjs = await loadPdfjs(); } catch (e) {
      status.innerHTML = '<span class="warn">Could not load the PDF reader. It comes from cdn.jsdelivr.net, so you need an internet connection.</span>';
      return;
    }
    let ok = 0, skipped = 0, scanned = 0; const problems = [];
    for (const [n, { file: f, path, folder }] of pdfs.entries()) {
      status.textContent = `Reading ${n + 1} of ${pdfs.length}: ${f.name}…`;
      const same = state.recipes.find((r) => (path && r.sourcePath === path && r.sourceFolder === folder) || (r.filename === f.name && r.size === f.size));
      if (same) {
        // Already have it. Link an earlier upload to its place in the folder.
        if (path && (same.sourcePath !== path || same.sourceFolder !== folder || same.missing)) {
          same.sourcePath = path; same.sourceFolder = folder; same.missing = false;
          await S.put('recipes', same);
        }
        skipped++;
        continue;
      }
      try {
        const buf = await f.arrayBuffer();
        const read = await readPdf(buf, f.name, (msg) => { status.textContent = `(${n + 1} of ${pdfs.length}) ${msg}`; });
        // Keep the recipe even when no text could be read, so you can type its ingredients in.
        const parsed = read.lines.length ? P.parseRecipe(read.lines, f.name, state.match) : { title: P.cleanFilename(f.name), servings: null, ingredients: [], text: '' };
        if (read.why) problems.push(`${f.name}: ${read.why}`);
        if (read.ocr) scanned++;
        const id = uid();
        const recipe = { id, filename: f.name, size: f.size, addedAt: Date.now(), title: parsed.title, pdfTitle: parsed.pdfTitle, servings: parsed.servings, ingredients: parsed.ingredients, text: parsed.text, ocr: read.ocr };
        if (path) { recipe.sourcePath = path; recipe.sourceFolder = folder; }
        await S.put('files', { id, blob: new Blob([buf], { type: 'application/pdf' }) });
        await S.put('recipes', recipe);
        state.recipes.push(recipe);
        ok++;
      } catch (e) {
        console.error(e);
        problems.push(`${f.name}: ${e.message || 'could not be read'}`);
      }
    }
    const where = opt.fromFolder ? `Checked ${opt.fromFolder}: ` : '';
    status.innerHTML = esc(where) + (ok ? `added ${ok} new recipe${ok === 1 ? '' : 's'}` : 'no new recipes').replace(/^./, (c) => (where ? c : c.toUpperCase()))
      + (skipped ? ` (${skipped} already imported)` : '') + '.'
      + (scanned ? ` ${scanned} ${scanned === 1 ? 'was a scanned image' : 'were scanned images'} read with text recognition, so check ${scanned === 1 ? 'it' : 'them'} carefully.` : '')
      + (problems.length ? ` <span class="warn">${problems.map(esc).join('; ')}</span>` : '')
      + (ok ? ' Open a recipe to check its ingredients.' : '');
    renderAll();
  }

  // ---------- Recipes folder ----------
  // Vivaldi, Chrome and Edge can remember a folder (File System Access API).
  // Other browsers, and pages shown inside another page, fall back to a one-off folder import.
  const canRememberFolder = 'showDirectoryPicker' in window && window.self === window.top;
  let folderNeedsPermission = false;

  async function listPdfs(dir, prefix = '') {
    const out = [];
    for await (const [name, h] of dir.entries()) {
      if (name.startsWith('.')) continue;
      if (h.kind === 'file' && /\.pdf$/i.test(name)) out.push({ handle: h, path: prefix + name });
      else if (h.kind === 'directory') out.push(...(await listPdfs(h, prefix + name + '/')));
    }
    return out;
  }

  // Mark recipes whose PDF is no longer in the folder (or clear the mark if it's back).
  async function flagMissing(folder, foundPaths) {
    for (const r of state.recipes) {
      if (r.sourceFolder !== folder || !r.sourcePath) continue;
      const missing = !foundPaths.has(r.sourcePath);
      if (!!r.missing !== missing) { r.missing = missing; await S.put('recipes', r); }
    }
  }

  async function scanFolder(interactive) {
    const h = state.folder;
    if (!h) return;
    let perm = 'denied';
    try {
      perm = await h.queryPermission({ mode: 'read' });
      if (perm !== 'granted' && interactive) perm = await h.requestPermission({ mode: 'read' });
    } catch (e) { perm = 'denied'; }
    folderNeedsPermission = perm !== 'granted';
    renderFolderBar();
    if (folderNeedsPermission) return;
    $('#uploadStatus').textContent = `Checking ${h.name} for new recipes…`;
    let entries;
    try { entries = await listPdfs(h); } catch (e) {
      $('#uploadStatus').innerHTML = `<span class="warn">Couldn't read ${esc(h.name)}. It may have been moved or deleted. Choose the folder again.</span>`;
      return;
    }
    await flagMissing(h.name, new Set(entries.map((e) => e.path)));
    const known = new Set(state.recipes.filter((r) => r.sourceFolder === h.name && !r.missing).map((r) => r.sourcePath));
    const items = [];
    for (const e of entries) {
      if (known.has(e.path)) continue;
      items.push({ file: await e.handle.getFile(), path: e.path, folder: h.name });
    }
    await importFiles(items, { fromFolder: h.name });
    const missing = state.recipes.filter((r) => r.sourceFolder === h.name && r.missing).length;
    if (missing) $('#uploadStatus').insertAdjacentHTML('beforeend', ` <span class="warn">${missing} recipe${missing === 1 ? '' : 's'} no longer in the folder (marked on the cards).</span>`);
  }

  function renderFolderBar() {
    const info = $('#folderInfo');
    const h = state.folder;
    $('#pickFolder').hidden = !canRememberFolder;
    $('#pickFolder').textContent = h ? 'Change folder' : 'Choose recipes folder';
    $('#scanFolder').hidden = !canRememberFolder || !h;
    $('#scanFolder').textContent = folderNeedsPermission ? 'Reconnect folder' : 'Check for new recipes';
    $('#forgetFolder').hidden = !canRememberFolder || !h;
    if (!canRememberFolder) {
      info.innerHTML = window.self !== window.top
        ? 'To link a recipes folder, download the app and open it in Vivaldi, Chrome or Edge. Here you can import a folder\'s PDFs one time.'
        : 'This browser can\'t remember a folder. Use <em>Import a folder</em> to add every PDF in one.';
    } else if (!h) {
      info.innerHTML = 'Link the folder where you keep recipe PDFs. New PDFs you save there are added when you open the app.';
    } else if (folderNeedsPermission) {
      info.innerHTML = `Recipes folder: <strong>${esc(h.name)}</strong>. <span class="warn">Click <em>Reconnect folder</em> to let the app read it again.</span>`;
    } else {
      info.innerHTML = `Recipes folder: <strong>${esc(h.name)}</strong> <span class="small">(subfolders included)</span>`;
    }
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
        <div class="meta">${r.servings ? `Serves ${r.servings} · ` : ''}${ings.length} ingredients${unmatched ? ` · <span class="warn">${unmatched} need a store item</span>` : ''}${r.missing ? ` · <span class="warn" title="${esc(r.sourceFolder + '/' + r.sourcePath)}">file missing from folder</span>` : ''}${!ings.length ? ' · <span class="warn">no ingredients yet</span>' : r.ocr ? ' · <span class="small">read from a scan, check it</span>' : ''}</div>
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
    $('#dFile').textContent = r.pdfTitle && P.fold(r.pdfTitle) !== P.fold(r.title) ? `File: ${r.filename} · Heading in the PDF: ${r.pdfTitle}` : `File: ${r.filename}`;
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
    resetPdfView();
    const rec = state.recipes.find((x) => x.id === id);
    $('#dNote').innerHTML = rec && !rec.ingredients.length
      ? '<span class="warn">No ingredients were read from this PDF.</span> Type them in below, or use <em>Show original PDF</em> to see the page.'
      : rec && rec.ocr ? 'This recipe was read from a scanned image with text recognition. Compare it with the original, since some words or numbers may be misread.' : '';
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
  $('#folderInput').addEventListener('change', (e) => {
    const files = [...e.target.files];
    if (!files.length) return;
    const folder = (files[0].webkitRelativePath || '').split('/')[0] || 'folder';
    const items = files.filter((f) => !/(^|\/)\./.test(f.webkitRelativePath)).map((f) => ({ file: f, path: f.webkitRelativePath.split('/').slice(1).join('/'), folder }));
    flagMissing(folder, new Set(items.map((i) => i.path))).then(() => importFiles(items, { fromFolder: folder }));
    e.target.value = '';
  });
  $('#pickFolder').addEventListener('click', async () => {
    try {
      const h = await window.showDirectoryPicker({ id: 'recipes', mode: 'read' });
      state.folder = h;
      try { await S.setKV('folderHandle', h); } catch (err) { /* can't remember it; still scan now */ }
      folderNeedsPermission = false;
      await scanFolder(true);
    } catch (err) {
      if (err.name !== 'AbortError') $('#uploadStatus').innerHTML = `<span class="warn">Couldn't open that folder: ${esc(err.message)}</span>`;
    }
  });
  $('#scanFolder').addEventListener('click', () => scanFolder(true));
  $('#forgetFolder').addEventListener('click', async () => {
    state.folder = null; folderNeedsPermission = false;
    try { await S.setKV('folderHandle', null); } catch (err) { /* ignore */ }
    renderFolderBar();
    $('#uploadStatus').textContent = 'Folder unlinked. Your recipes stay in the app.';
  });
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
  // Printing is blocked when the app runs inside another page (e.g. a hosted preview).
  if (window.self !== window.top) $('#printList').hidden = true;
  $('#printList').addEventListener('click', () => { switchTab('list'); window.print(); });
  $('#copyList').addEventListener('click', async () => {
    const text = listAsText();
    try { await navigator.clipboard.writeText(text); $('#copyList').textContent = 'Copied ✓'; $('#copyBox').hidden = true; }
    catch (e) { $('#copyText').value = text; $('#copyBox').hidden = false; $('#copyText').select(); }
    setTimeout(() => { $('#copyList').textContent = 'Copy as text'; }, 1500);
  });

  // dialog
  $('#dTitle').addEventListener('change', async (e) => { const r = state.recipes.find((x) => x.id === openId); const v = e.target.value.trim(); if (v && v !== r.title) { r.title = v; r.titleEdited = true; } await saveOpen(); });
  $('#dServings').addEventListener('change', async (e) => { const r = state.recipes.find((x) => x.id === openId); r.servings = +e.target.value || null; await saveOpen(); });
  $('#dAddLine').addEventListener('click', async () => {
    const v = $('#dNewLine').value.trim(); if (!v) return;
    const r = state.recipes.find((x) => x.id === openId);
    r.ingredients.push(P.parseIngredient(v)); $('#dNewLine').value = '';
    await saveOpen(); renderDialog();
  });
  $('#dNewLine').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#dAddLine').click(); } });
  // Show the original PDF inside the dialog (works even where new windows are blocked).
  function resetPdfView() { $('#dPdf').innerHTML = ''; $('#dViewPdf').textContent = 'Show original PDF'; }
  $('#dViewPdf').addEventListener('click', async () => {
    const box = $('#dPdf');
    if (box.childElementCount) { resetPdfView(); return; }
    const f = await S.get('files', openId);
    if (!f) { box.innerHTML = '<p class="hint">The original PDF isn\'t stored for this recipe. Recipes restored from a backup don\'t include it.</p>'; return; }
    $('#dViewPdf').textContent = 'Hide original PDF';
    try {
      const pdfjs = await loadPdfjs();
      const doc = await pdfjs.getDocument({ data: new Uint8Array(await f.blob.arrayBuffer()) }).promise;
      for (let i = 1; i <= doc.numPages; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 1.5 });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height;
        box.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
    } catch (e) { box.innerHTML = '<p class="warn">This PDF couldn\'t be displayed. The PDF reader needs an internet connection.</p>'; }
  });
  // Read the stored PDF again (e.g. after a parser update, or a scan that failed before).
  let rereadArmed = null;
  $('#dReread').addEventListener('click', async () => {
    const btn = $('#dReread');
    const r = state.recipes.find((x) => x.id === openId);
    if (!rereadArmed) {
      btn.textContent = 'Click again: replaces this list';
      rereadArmed = setTimeout(() => { rereadArmed = null; btn.textContent = 'Read PDF again'; }, 4000);
      return;
    }
    clearTimeout(rereadArmed); rereadArmed = null;
    const f = await S.get('files', r.id);
    const note = $('#dNote');
    if (!f) { note.innerHTML = '<span class="warn">The original PDF isn\'t stored for this recipe, so it can\'t be read again.</span>'; btn.textContent = 'Read PDF again'; return; }
    btn.disabled = true; btn.textContent = 'Reading…';
    try {
      const read = await readPdf(await f.blob.arrayBuffer(), r.filename, (msg) => { note.textContent = msg; });
      if (read.lines.length) {
        const parsed = P.parseRecipe(read.lines, r.filename, state.match);
        Object.assign(r, { pdfTitle: parsed.pdfTitle, servings: parsed.servings, ingredients: parsed.ingredients, text: parsed.text, ocr: read.ocr });
        if (!r.titleEdited) r.title = parsed.title;
        note.textContent = `Read ${parsed.ingredients.filter((i) => !i.header).length} ingredient lines${read.ocr ? ' with text recognition. Check them against the original' : ''}.`;
        await saveOpen(); renderDialog();
      } else note.innerHTML = `<span class="warn">Couldn't read any text: ${esc(read.why || 'unknown problem')}.</span>`;
    } catch (e) { note.innerHTML = `<span class="warn">Couldn't read the PDF: ${esc(e.message)}</span>`; }
    btn.disabled = false; btn.textContent = 'Read PDF again';
  });

  let deleteArmed = null;
  $('#dDelete').addEventListener('click', async () => {
    const r = state.recipes.find((x) => x.id === openId);
    const btn = $('#dDelete');
    if (!deleteArmed) {
      btn.textContent = 'Click again to delete';
      deleteArmed = setTimeout(() => { deleteArmed = null; btn.textContent = 'Delete recipe'; }, 4000);
      return;
    }
    clearTimeout(deleteArmed); deleteArmed = null; btn.textContent = 'Delete recipe';
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
    const json = JSON.stringify(data);
    $('#backupText').value = json;
    const a = $('#downloadBackup');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = `meal-planner-backup-${new Date().toISOString().slice(0, 10)}.json`;
    $('#backupBox').hidden = false;
  });
  $('#copyBackup').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText($('#backupText').value); $('#copyBackup').textContent = 'Copied ✓'; }
    catch (e) { $('#backupText').select(); $('#copyBackup').textContent = 'Press Ctrl/Cmd+C to copy'; }
    setTimeout(() => { $('#copyBackup').textContent = 'Copy backup'; }, 2500);
  });
  $('#closeBackup').addEventListener('click', () => { $('#backupBox').hidden = true; });
  $('#importData').addEventListener('change', async (e) => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.recipes)) throw new Error('not a Meal Planner backup');
      for (const r of data.recipes) { await S.put('recipes', r); }
      state.recipes = await S.all('recipes');
      state.plan = data.plan || []; state.pantry = new Set(data.pantry || []); state.overrides = data.overrides || {}; state.custom = data.custom || [];
      rebuildCatalog(); await savePrefs(); renderAll();
      $('#dataStatus').textContent = `Restored ${data.recipes.length} recipes and your settings.`;
    } catch (err) { $('#dataStatus').innerHTML = `<span class="warn">That file couldn't be restored: ${esc(err.message)}. Choose a backup saved from this app.</span>`; }
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
    // One-time switch: name existing recipes after their files (unless you renamed one yourself).
    try {
      if (!(await S.getKV('titlesFromFilenames', false))) {
        for (const r of state.recipes) {
          if (r.titleEdited || !r.filename) continue;
          const t = P.cleanFilename(r.filename);
          if (t !== r.title) { r.pdfTitle = r.pdfTitle || r.title; r.title = t; await S.put('recipes', r); }
        }
        await S.setKV('titlesFromFilenames', true);
      }
    } catch (e) { /* storage blocked; titles stay as they are */ }
    $('#includeOptional').checked = state.includeOptional;
    if (canRememberFolder) { try { state.folder = await S.getKV('folderHandle', null); } catch (e) { state.folder = null; } }
    rebuildCatalog();
    let tab = 'recipes';
    try { tab = localStorage.getItem('mp-tab') || tab; } catch (e) { /* ignore */ }
    switchTab(tab);
    renderAll();
    renderFolderBar();
    if (state.folder) scanFolder(false); // checks right away if the browser still allows it, otherwise shows Reconnect
  })();
})();
