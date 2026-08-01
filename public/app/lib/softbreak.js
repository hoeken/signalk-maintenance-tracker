/**
 * Authored line breaks for markdown output (§7.8). People type notes into a
 * textarea and mean every newline they press, but markdown does not: snarkdown
 * drops a lone newline to whitespace, and collapses any run of blank lines into
 * a single <br>. So "Maxwell HRC10\n\n\n<url>" came out as one run-on line, and
 * spacing the author added could not be got back.
 *
 * Two steps, on either side of snarkdown:
 *
 *  - keepBlankLines() runs first, splitting each run of newlines with a marker
 *    character so snarkdown sees single newlines it leaves alone instead of the
 *    blank-line run it would collapse.
 *  - softBreakHtml() runs last, turning the newlines left in the text into <br>
 *    and dropping the markers.
 *
 * The usual one-step trick — rewriting "\n" to "  \n" before snarkdown — does
 * not work here: it merges list items and leaves trailing spaces inside code
 * fences. Only <MarkdownView/> consumes this.
 */

/**
 * Stands in for a blank line between two newlines. A control character, so it
 * is inert to snarkdown's grammar and cannot occur in a note by accident.
 */
const MARKER = '\u0001';

/**
 * Unmarked newlines at either edge of a text node. Marked ones are blank lines
 * the author typed and survive; these are snarkdown's own output formatting.
 */
const LEAD_RE = /^\n+/;
const TAIL_RE = /\n+$/;

/** Fenced code, kept whole: blank lines in there are code, not layout. */
const FENCE_RE = /(```[\s\S]*?```)/g;

/**
 * Split runs of blank lines so snarkdown cannot collapse them. Runs before
 * snarkdown; softBreakHtml() clears up after it.
 *
 * @param {string} markdown as the author typed it
 * @returns {string} markdown with blank-line runs marked
 */
export function keepBlankLines(markdown) {
  // Odd indices are the fences themselves — left exactly as written.
  const chunks = String(markdown).replace(/\r\n?/g, '\n').split(FENCE_RE);
  for (let i = 0; i < chunks.length; i += 2) {
    chunks[i] = chunks[i]
      .split(MARKER)
      .join('')
      .replace(/\n{2,}/g, markRun);
  }
  return chunks.join('');
}

/** @param {string} run two or more newlines */
function markRun(run) {
  let out = '\n';
  for (let i = 1; i < run.length; i++) out += MARKER + '\n';
  return out;
}

/**
 * Newlines are content here, not layout.
 * @type {Record<string, boolean>}
 */
const SKIP_TAGS = {
  CODE: true,
  PRE: true,
};

/**
 * Elements that already break the line. A newline next to one of these came
 * from snarkdown's own output formatting, not from the author.
 * @type {Record<string, boolean>}
 */
const BLOCK_TAGS = {
  BLOCKQUOTE: true,
  DIV: true,
  H1: true,
  H2: true,
  H3: true,
  H4: true,
  H5: true,
  H6: true,
  HR: true,
  LI: true,
  OL: true,
  P: true,
  PRE: true,
  TABLE: true,
  UL: true,
};

/**
 * @param {string} clean sanitized HTML from sanitizeHtml()
 * @returns {string} the same HTML with authored newlines as <br>
 */
export function softBreakHtml(clean) {
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  breakNode(doc.body);
  return doc.body.innerHTML;
}

/** @param {Node} parent */
function breakNode(parent) {
  // Snapshot: breaking replaces text nodes with fragments as we walk.
  const children = Array.prototype.slice.call(parent.childNodes);
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 3) {
      breakText(/** @type {Text} */ (node));
    } else if (
      node.nodeType === 1 &&
      !SKIP_TAGS[/** @type {Element} */ (node).tagName]
    ) {
      breakNode(node);
    }
  }
}

/**
 * Replace one text node with its lines separated by <br>.
 * @param {Text} node
 */
function breakText(node) {
  const doc = node.ownerDocument;
  let text = node.nodeValue || '';
  if (!doc || (text.indexOf('\n') === -1 && text.indexOf(MARKER) === -1)) {
    return;
  }
  // A newline against a block is snarkdown's formatting, not a typed line.
  if (isBlockEdge(node.previousSibling)) text = text.replace(LEAD_RE, '');
  if (isBlockEdge(node.nextSibling)) text = text.replace(TAIL_RE, '');
  if (text.indexOf('\n') === -1) {
    node.nodeValue = text.split(MARKER).join('');
    return;
  }
  const lines = text.split('\n');
  const frag = doc.createDocumentFragment();
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) frag.appendChild(doc.createElement('br'));
    // A marked line is a blank one: the <br> pair around it is the whole line.
    const line = lines[i].split(MARKER).join('');
    if (line) frag.appendChild(doc.createTextNode(line));
  }
  node.parentNode && node.parentNode.replaceChild(frag, node);
}

/**
 * True at the start/end of the enclosing block, or against a sibling that
 * breaks the line on its own — a <br> there would be a stray blank line.
 *
 * @param {Node|null} sibling
 * @returns {boolean}
 */
function isBlockEdge(sibling) {
  if (!sibling) return true;
  return (
    sibling.nodeType === 1 &&
    BLOCK_TAGS[/** @type {Element} */ (sibling).tagName] === true
  );
}
