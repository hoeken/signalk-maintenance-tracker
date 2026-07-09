/**
 * App root (§7.2): install the router, sync the theme, establish the auth
 * session, and mount <App/> into #app.
 *
 * Importing the vendored @preact/signals integrates signal reads with Preact
 * rendering; it happens transitively through every module that uses signals.
 */
import { render } from '../vendor/preact.js';
import { html } from './lib/html.js';
import { App } from './app.js';
import { initRouter } from './lib/router.js';
import { applyTheme } from './lib/theme.js';
import { refreshLoginStatus } from './auth/auth.js';

initRouter();
applyTheme();
refreshLoginStatus();

const root = document.getElementById('app');
if (root) render(html`<${App} />`, root);
