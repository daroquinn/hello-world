/*
 * Turn a pdf.js document into positioned text lines.
 * Works in the browser and in Node (tests).
 *
 * Each line: { text, x, right, y, size, page, segments: [{ text, x, right }] }
 * "segments" are runs of text on the same line separated by a wide gap,
 * which is how two-column layouts (ingredients | method) are detected later.
 */
(function (root) {
  // "Y I E L D" / "P R E PA R AT I O N" -> "YIELD" / "PREPARATION"
  function unspace(t) {
    return t.replace(/\b(?:[A-Z]{1,2} ){3,}[A-Z]{1,2}\b/g, (m) => {
      const toks = m.split(' ');
      return toks.filter((x) => x.length === 1).length >= 3 ? toks.join('') : m;
    });
  }

  // items: [{ str, x, y, w, size }] for one page (PDF units, y grows upwards)
  function groupItems(items, p) {
    const lines = [];
    // Group items into lines by baseline (PDF y grows upwards).
    items.sort((i1, i2) => i2.y - i1.y || i1.x - i2.x);
    const pageLines = [];
    for (const it of items) {
      const tol = Math.max(2, it.size * 0.45);
      let line = pageLines.find((l) => Math.abs(l.y - it.y) <= tol);
      if (!line) { line = { y: it.y, items: [] }; pageLines.push(line); }
      line.items.push(it);
    }
    pageLines.sort((l1, l2) => l2.y - l1.y);
    for (const l of pageLines) {
      l.items.sort((i1, i2) => i1.x - i2.x);
      const segments = [];
      let seg = null;
      let prevRight = null;
      let text = '';
      let maxSize = 0;
      for (const it of l.items) {
        maxSize = Math.max(maxSize, it.size);
        const gap = prevRight == null ? 0 : it.x - prevRight;
        if (!seg || gap > it.size * 2.2) {
          seg = { text: '', x: it.x, right: it.x + it.w, size: 0 };
          segments.push(seg);
        } else if (gap > it.size * 0.12 && !/\s$/.test(seg.text) && !/^\s/.test(it.str)) {
          seg.text += ' ';
        }
        seg.text += it.str;
        seg.right = it.x + it.w;
        seg.size = Math.max(seg.size, it.size);
        prevRight = it.x + it.w;
      }
      for (const s of segments) s.text = unspace(s.text.replace(/\s+/g, ' ').trim());
      text = segments.map((s) => s.text).join('  ');
      if (!text) continue;
      lines.push({
        text,
        x: segments[0].x,
        right: segments[segments.length - 1].right,
        y: l.y,
        size: maxSize,
        page: p,
        segments,
        items: l.items.map((it) => ({ str: it.str, x: it.x, right: it.x + it.w, size: it.size })),
      });
    }
    return lines;
  }

  async function extractLines(pdfDoc) {
    const lines = [];
    for (let p = 1; p <= pdfDoc.numPages; p++) {
      const page = await pdfDoc.getPage(p);
      const content = await page.getTextContent();
      const items = content.items
        .filter((it) => it.str && it.str.trim() !== '')
        .map((it) => {
          const [a, b, c, d, e, f] = it.transform;
          const size = Math.hypot(c, d) || it.height || 10;
          return { str: it.str, x: e, y: f, w: it.width, size };
        });
      lines.push(...groupItems(items, p));
    }
    return lines;
  }

  const api = { extractLines, groupItems, unspace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MP_PDF = api;
})(typeof window !== 'undefined' ? window : globalThis);
