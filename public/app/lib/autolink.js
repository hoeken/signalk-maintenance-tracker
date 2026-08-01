/**
 * Bare-URL autolinking for markdown output (§7.8). snarkdown only links
 * explicit [text](url), so a note that just pastes a URL renders as dead text.
 * This turns http(s):// and www. runs in the text into anchors.
 *
 * Runs *after* sanitizeHtml() on already-clean HTML: every href here is built
 * from a match that must start with http://, https:// or www., so this pass
 * cannot reintroduce a javascript: URL. Text inside existing links and inside
 * code is left alone. Only <MarkdownView/> consumes this.
 */

/** Bare URL run: everything up to whitespace or a tag; trimmed below. */
const URL_RE = /(?:https?:\/\/|www\.)[^\s<]+/gi;

/**
 * Elements whose text must not be linkified.
 * @type {Record<string, boolean>}
 */
const SKIP_TAGS = {
  A: true,
  CODE: true,
  PRE: true,
};

/** Sentence punctuation that follows a URL far more often than it ends one. */
const TRAILING = '.,;:!?\'"';

/**
 * @param {string} clean sanitized HTML from sanitizeHtml()
 * @returns {string} the same HTML with bare URLs wrapped in anchors
 */
export function autolinkHtml(clean) {
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  autolinkNode(doc.body);
  return doc.body.innerHTML;
}

/** @param {Node} parent */
function autolinkNode(parent) {
  // Snapshot: linkifying replaces text nodes with fragments as we walk.
  const children = Array.prototype.slice.call(parent.childNodes);
  for (let i = 0; i < children.length; i++) {
    const node = children[i];
    if (node.nodeType === 3) {
      linkifyText(/** @type {Text} */ (node));
    } else if (
      node.nodeType === 1 &&
      !SKIP_TAGS[/** @type {Element} */ (node).tagName]
    ) {
      autolinkNode(node);
    }
  }
}

/**
 * Replace one text node with its text plus <a> elements for any URLs in it.
 * @param {Text} node
 */
function linkifyText(node) {
  const text = node.nodeValue || '';
  const doc = node.ownerDocument;
  if (!doc) return;
  let frag = null;
  let last = 0;
  let match;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    const url = trimTrailing(match[0]);
    // Resume after what we kept, so trimmed punctuation stays plain text.
    URL_RE.lastIndex = match.index + url.length;
    if (!url) continue;
    if (!frag) frag = doc.createDocumentFragment();
    if (match.index > last) {
      frag.appendChild(doc.createTextNode(text.slice(last, match.index)));
    }
    const href = url.indexOf('www.') === 0 ? 'https://' + url : url;
    const a = doc.createElement('a');
    a.setAttribute('href', href);
    // The host is the readable part; the full URL stays on hover.
    a.setAttribute('title', href);
    a.textContent = hostnameOf(href) || url;
    frag.appendChild(a);
    last = match.index + url.length;
  }
  if (!frag) return;
  if (last < text.length) {
    frag.appendChild(doc.createTextNode(text.slice(last)));
  }
  node.parentNode && node.parentNode.replaceChild(frag, node);
}

/**
 * The host is what identifies a link to a reader; a pasted path is usually
 * noise ("example.com" beats a 90-character tracking URL). Returns '' if the
 * URL will not parse, and the caller falls back to showing it whole.
 *
 * @param {string} href
 * @returns {string}
 */
function hostnameOf(href) {
  try {
    return new URL(href).hostname;
  } catch (_e) {
    return '';
  }
}

/**
 * Drop punctuation a sentence left on the end of a URL: "see https://x.com."
 * A closing paren only counts as the URL's when the URL opened one, so both
 * "(see https://x.com)" and "https://x.com/a_(b)" come out right.
 *
 * @param {string} url
 * @returns {string}
 */
function trimTrailing(url) {
  let end = url.length;
  while (end > 0) {
    const ch = url.charAt(end - 1);
    if (TRAILING.indexOf(ch) !== -1) {
      end--;
    } else if (ch === ')' && closesMoreThanOpens(url.slice(0, end))) {
      end--;
    } else {
      break;
    }
  }
  return url.slice(0, end);
}

/** @param {string} s */
function closesMoreThanOpens(s) {
  const opens = s.match(/\(/g);
  const closes = s.match(/\)/g);
  return (closes ? closes.length : 0) > (opens ? opens.length : 0);
}
