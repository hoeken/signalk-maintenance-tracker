/**
 * HTML sanitizer for markdown output (§7.8). snarkdown emits HTML; before it
 * is inserted via dangerouslySetInnerHTML, strip anything that could run
 * script: blocked elements, on* handler attributes, and javascript: URLs.
 * Only <MarkdownView/> consumes this.
 */

/** @type {Record<string, boolean>} */
const BLOCKED_TAGS = {
  SCRIPT: true,
  STYLE: true,
  IFRAME: true,
  OBJECT: true,
  EMBED: true,
  LINK: true,
  META: true,
  BASE: true,
  FORM: true,
};

/** @type {Record<string, boolean>} */
const URL_ATTRS = {
  href: true,
  src: true,
  'xlink:href': true,
  action: true,
  formaction: true,
};

/**
 * @param {string} dirty raw HTML from snarkdown
 * @returns {string} sanitized HTML
 */
export function sanitizeHtml(dirty) {
  const doc = new DOMParser().parseFromString(dirty, 'text/html');
  cleanElement(doc.body);
  return doc.body.innerHTML;
}

/** @param {Element} root */
function cleanElement(root) {
  // Snapshot children first: removing while iterating a live collection skips nodes.
  const children = Array.prototype.slice.call(root.children);
  for (let i = 0; i < children.length; i++) {
    const el = children[i];
    if (BLOCKED_TAGS[el.tagName]) {
      el.parentNode && el.parentNode.removeChild(el);
      continue;
    }
    const attrs = Array.prototype.slice.call(el.attributes);
    for (let j = 0; j < attrs.length; j++) {
      const name = attrs[j].name.toLowerCase();
      if (name.indexOf('on') === 0) {
        el.removeAttribute(attrs[j].name);
      } else if (
        URL_ATTRS[name] &&
        /^\s*(javascript|vbscript|data):/i.test(attrs[j].value)
      ) {
        el.removeAttribute(attrs[j].name);
      }
    }
    cleanElement(el);
  }
}
