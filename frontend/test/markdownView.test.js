import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { MarkdownView } from '../../public/app/components/MarkdownView.js';

describe('MarkdownView (§7.8)', () => {
  it('renders markdown to HTML', () => {
    const { container } = render(
      html`<${MarkdownView} markdown=${'Use **15W-40** oil'} />`,
    );
    expect(container.querySelector('strong').textContent).toBe('15W-40');
  });

  it('sanitizes script out of malicious notes', () => {
    const { container } = render(
      html`<${MarkdownView}
        markdown=${'hello <script>window.pwned = true</script><img src=x onerror="window.pwned=true">'}
      />`,
    );
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    expect(img === null || img.getAttribute('onerror') === null).toBe(true);
    expect(window.pwned).toBeUndefined();
  });

  it('links bare URLs that have no markdown formatting', () => {
    const { container } = render(
      html`<${MarkdownView} markdown=${'Manual: https://example.com/m.pdf'} />`,
    );
    const a = container.querySelector('a');
    expect(a.getAttribute('href')).toBe('https://example.com/m.pdf');
    expect(a.textContent).toBe('example.com');
  });

  it('keeps the line breaks the author typed', () => {
    const note =
      'Maxwell HRC10\nManual:\nhttps://www.dropbox.com/scl/fi/z63.pdf?dl=0';
    const { container } = render(html`<${MarkdownView} markdown=${note} />`);
    expect(container.querySelectorAll('br').length).toBe(2);
    const a = container.querySelector('a');
    expect(a.getAttribute('href')).toBe(
      'https://www.dropbox.com/scl/fi/z63.pdf?dl=0',
    );
    expect(a.textContent).toBe('www.dropbox.com');
  });

  it('keeps blank lines the author typed', () => {
    const { container } = render(
      html`<${MarkdownView} markdown=${'Maxwell HRC10\n\n\nhttps://x.com'} />`,
    );
    // Three newlines, three breaks: two empty lines between the two lines.
    expect(container.querySelectorAll('br').length).toBe(3);
    expect(container.textContent).toBe('Maxwell HRC10x.com');
  });

  it('does not double-link a markdown link', () => {
    const { container } = render(
      html`<${MarkdownView} markdown=${'[manual](https://example.com)'} />`,
    );
    expect(container.querySelectorAll('a').length).toBe(1);
    expect(container.querySelector('a').textContent).toBe('manual');
  });

  it('renders nothing for empty markdown', () => {
    const { container } = render(html`<${MarkdownView} markdown=${null} />`);
    expect(container.innerHTML).toBe('');
  });
});
