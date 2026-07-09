import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/preact';
import { html } from '../../public/app/lib/html.js';
import { MarkdownView } from '../../public/app/components/MarkdownView.js';

describe('MarkdownView (§7.8)', () => {
  it('renders markdown to HTML', () => {
    const { container } = render(html`<${MarkdownView} markdown=${'Use **15W-40** oil'} />`);
    expect(container.querySelector('strong').textContent).toBe('15W-40');
  });

  it('sanitizes script out of malicious notes', () => {
    const { container } = render(
      html`<${MarkdownView} markdown=${'hello <script>window.pwned = true</script><img src=x onerror="window.pwned=true">'} />`
    );
    expect(container.querySelector('script')).toBeNull();
    const img = container.querySelector('img');
    expect(img === null || img.getAttribute('onerror') === null).toBe(true);
    expect(window.pwned).toBeUndefined();
  });

  it('renders nothing for empty markdown', () => {
    const { container } = render(html`<${MarkdownView} markdown=${null} />`);
    expect(container.innerHTML).toBe('');
  });
});
