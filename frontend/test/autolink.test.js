import { describe, it, expect } from 'vitest';
import { autolinkHtml } from '../../public/app/lib/autolink.js';

/** <a> for a bare URL: href is the whole URL, text is just the host. */
function link(href, text) {
  return `<a href="${href}" title="${href}">${text}</a>`;
}

describe('autolinkHtml (§7.8)', () => {
  it('links a bare URL and shows only its hostname', () => {
    expect(autolinkHtml('<p>See https://example.com/manual.pdf now</p>')).toBe(
      `<p>See ${link('https://example.com/manual.pdf', 'example.com')} now</p>`,
    );
  });

  it('links a www. host over https', () => {
    expect(autolinkHtml('<p>www.example.com</p>')).toBe(
      `<p>${link('https://www.example.com', 'www.example.com')}</p>`,
    );
  });

  it('keeps the port and subdomain in the link text', () => {
    expect(autolinkHtml('<p>http://boat.local:3000/admin</p>')).toBe(
      `<p>${link('http://boat.local:3000/admin', 'boat.local')}</p>`,
    );
  });

  it('links several URLs in one text node', () => {
    expect(autolinkHtml('<p>a http://x.com b http://y.com c</p>')).toBe(
      `<p>a ${link('http://x.com', 'x.com')} b ${link('http://y.com', 'y.com')} c</p>`,
    );
  });

  it('leaves trailing sentence punctuation out of the link', () => {
    expect(autolinkHtml('<p>Manual at https://example.com/a.</p>')).toBe(
      `<p>Manual at ${link('https://example.com/a', 'example.com')}.</p>`,
    );
    expect(autolinkHtml('<p>(see https://example.com)</p>')).toBe(
      `<p>(see ${link('https://example.com', 'example.com')})</p>`,
    );
  });

  it('keeps parens the URL itself opened', () => {
    expect(autolinkHtml('<p>https://example.com/a_(b)</p>')).toBe(
      `<p>${link('https://example.com/a_(b)', 'example.com')}</p>`,
    );
  });

  it('does not touch URLs already inside a link', () => {
    const linked =
      '<p><a href="https://example.com">https://example.com</a></p>';
    expect(autolinkHtml(linked)).toBe(linked);
  });

  it('does not touch URLs inside code', () => {
    const coded = '<p><code>https://example.com</code></p>';
    expect(autolinkHtml(coded)).toBe(coded);
    const pre = '<pre class="code"><code>curl https://example.com</code></pre>';
    expect(autolinkHtml(pre)).toBe(pre);
  });

  it('links inside nested markup', () => {
    expect(autolinkHtml('<ul><li><em>https://x.com</em></li></ul>')).toBe(
      `<ul><li><em>${link('https://x.com', 'x.com')}</em></li></ul>`,
    );
  });

  it('keeps an escaped query string intact in the href', () => {
    expect(autolinkHtml('<p>https://x.com/?a=1&amp;b=2</p>')).toBe(
      `<p>${link('https://x.com/?a=1&amp;b=2', 'x.com')}</p>`,
    );
  });

  it('leaves text with no URLs untouched', () => {
    expect(autolinkHtml('<p>Change the oil every 200 h.</p>')).toBe(
      '<p>Change the oil every 200 h.</p>',
    );
  });

  it('does not link a bare hostname or an email', () => {
    expect(autolinkHtml('<p>example.com and a@b.com</p>')).toBe(
      '<p>example.com and a@b.com</p>',
    );
  });
});
