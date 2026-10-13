/**
 * Attachment helpers shared by the detail page, the log views and the forms.
 */

/** @typedef {import('../types.js').FileDTO} FileDTO */

/**
 * Images go in a thumbnail gallery of their own; the rest are listed by
 * name. Of those, what the browser can show (PDFs, text, media) opens in a
 * tab; everything else is a plain download.
 * @param {FileDTO[]} files
 * @returns {{ images: FileDTO[], documents: FileDTO[] }}
 */
export function splitAttachments(files) {
  return {
    images: files.filter((f) => isInlineImage(f.mime)),
    documents: files.filter((f) => !isInlineImage(f.mime)),
  };
}

/**
 * Whether the server serves a file of this declared type inline (see
 * files/store.ts on the backend — the two must agree): what a browser shows
 * on its own and that carries no script — raster images, PDF, plain text,
 * audio and video. Such links open in a tab; everything else downloads,
 * including SVG and anything XML/HTML-shaped, which can run script.
 * @param {string|null|undefined} mime
 */
export function isInlineType(mime) {
  const t = normalizeMime(mime);
  if (t === null || /xml|html/.test(t)) return false;
  if (t === 'application/pdf' || t === 'text/plain') return true;
  return /^(image|audio|video)\//.test(t);
}

/**
 * Whether a file of this declared type is a raster image: inline, and a
 * picture for the gallery.
 * @param {string|null|undefined} mime
 */
export function isInlineImage(mime) {
  const t = normalizeMime(mime);
  return t !== null && t.startsWith('image/') && isInlineType(t);
}

/**
 * The bare `type/subtype`, lowercased, or null when absent.
 * @param {string|null|undefined} mime
 */
function normalizeMime(mime) {
  if (!mime) return null;
  const t = mime.split(';')[0].trim().toLowerCase();
  return t.includes('/') ? t : null;
}
