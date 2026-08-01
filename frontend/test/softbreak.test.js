import { describe, it, expect } from 'vitest';
import {
  keepBlankLines,
  softBreakHtml,
} from '../../public/app/lib/softbreak.js';

const MARKER = '\u0001';

describe('keepBlankLines (§7.8)', () => {
  it('splits a blank-line run so snarkdown cannot collapse it', () => {
    expect(keepBlankLines('a\n\nb')).toBe(`a\n${MARKER}\nb`);
    expect(keepBlankLines('a\n\n\nb')).toBe(`a\n${MARKER}\n${MARKER}\nb`);
  });

  it('leaves single newlines alone', () => {
    expect(keepBlankLines('a\nb')).toBe('a\nb');
  });

  it('normalises CRLF', () => {
    expect(keepBlankLines('a\r\n\r\nb')).toBe(`a\n${MARKER}\nb`);
  });

  it('leaves blank lines inside a code fence alone', () => {
    const md = 'text\n\nafter\n\n```\none\n\ntwo\n```\n\nend';
    const out = keepBlankLines(md);
    expect(out).toContain('```\none\n\ntwo\n```');
    expect(out).toContain(`text\n${MARKER}\nafter`);
  });

  it('drops markers a note happened to contain', () => {
    expect(keepBlankLines(`a${MARKER}b`)).toBe('ab');
  });
});

describe('softBreakHtml (§7.8)', () => {
  it('renders a marked blank line as an empty line', () => {
    expect(softBreakHtml(`a\n${MARKER}\nb`)).toBe('a<br><br>b');
    expect(softBreakHtml(`a\n${MARKER}\n${MARKER}\nb`)).toBe('a<br><br><br>b');
  });

  it('never leaves a marker in the output', () => {
    expect(softBreakHtml(`<p>a\n${MARKER}\nb</p>`)).not.toContain(MARKER);
    expect(softBreakHtml(`<p>${MARKER}</p>`)).toBe('<p></p>');
  });

  it('turns an authored newline into a break', () => {
    expect(softBreakHtml('Maxwell HRC10\nManual:')).toBe(
      'Maxwell HRC10<br>Manual:',
    );
  });

  it('breaks every line of a multi-line note', () => {
    expect(softBreakHtml('a\nb\nc')).toBe('a<br>b<br>c');
  });

  it('keeps newlines inside code untouched', () => {
    const pre = '<pre class="code"><code>one\ntwo</code></pre>';
    expect(softBreakHtml(pre)).toBe(pre);
    expect(softBreakHtml('<code>one\ntwo</code>')).toBe(
      '<code>one\ntwo</code>',
    );
  });

  it('does not add a break after a block element', () => {
    expect(softBreakHtml('<ul><li>one</li></ul>\ntail')).toBe(
      '<ul><li>one</li></ul>tail',
    );
    expect(softBreakHtml('<h1>Head</h1>\ntext')).toBe('<h1>Head</h1>text');
  });

  it('keeps blank lines the author typed after a block element', () => {
    expect(
      softBreakHtml(`<ul><li>one</li></ul>\n${MARKER}\n${MARKER}\ntail`),
    ).toBe('<ul><li>one</li></ul><br><br>tail');
  });

  it('breaks inside a blockquote', () => {
    expect(softBreakHtml('<blockquote>quote\nmore</blockquote>')).toBe(
      '<blockquote>quote<br>more</blockquote>',
    );
  });

  it('breaks inside inline markup', () => {
    expect(softBreakHtml('<strong>bold\nnext</strong>')).toBe(
      '<strong>bold<br>next</strong>',
    );
  });

  it('keeps a break between text and an inline sibling', () => {
    expect(softBreakHtml('label:\n<em>value</em>')).toBe(
      'label:<br><em>value</em>',
    );
  });

  it('leaves text with no newlines untouched', () => {
    expect(softBreakHtml('<p>Change the oil.</p>')).toBe(
      '<p>Change the oil.</p>',
    );
  });
});
