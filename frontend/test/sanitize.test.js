import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../../public/app/lib/sanitize.js';

describe('sanitizeHtml (§7.8)', () => {
  it('keeps benign markup', () => {
    expect(sanitizeHtml('<p>Use <strong>15W-40</strong></p>')).toBe(
      '<p>Use <strong>15W-40</strong></p>',
    );
  });

  it('removes script and style elements', () => {
    expect(
      sanitizeHtml('<p>hi</p><script>alert(1)</script><style>*{}</style>'),
    ).toBe('<p>hi</p>');
  });

  it('removes nested blocked elements', () => {
    expect(
      sanitizeHtml('<div><em>ok</em><script>alert(1)</script></div>'),
    ).toBe('<div><em>ok</em></div>');
  });

  it('strips event-handler attributes', () => {
    expect(sanitizeHtml('<img src="x.png" onerror="alert(1)">')).toBe(
      '<img src="x.png">',
    );
  });

  it('strips javascript: URLs but keeps normal links', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a>x</a>',
    );
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com">x</a>',
    );
  });
});
