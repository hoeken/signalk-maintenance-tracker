import { html } from '../lib/html.js';
import { theme, toggleTheme } from '../lib/theme.js';

export function ThemeToggle() {
  const current = theme.value;
  return html`
    <button
      type="button"
      class="btn-icon"
      aria-label=${current === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
      title=${current === 'dark' ? 'Light theme' : 'Dark theme'}
      onClick=${toggleTheme}
    >
      <i class=${'bi ' + (current === 'dark' ? 'bi-sun' : 'bi-moon-stars')} />
    </button>
  `;
}
