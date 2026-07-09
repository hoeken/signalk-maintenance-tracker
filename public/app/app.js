/**
 * App shell (§7.2): header (title, nav, theme toggle), route switch, footer
 * (plugin links, auth control), toaster, and the globally-mounted login modal.
 */
import { html } from './lib/html.js';
import { route, matchPath } from './lib/router.js';
import { useHealth } from './api/hooks.js';
import { Toaster } from './components/Toaster.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { AuthControl } from './components/AuthControl.js';
import { LoginModal } from './components/LoginModal.js';
import { TaskListPage } from './pages/TaskListPage.js';
import { TaskDetailPage } from './pages/TaskDetailPage.js';
import { MasterLogPage } from './pages/MasterLogPage.js';

export function App() {
  const current = route.value;
  const detailParams = matchPath('/tasks/:slug', current.path);
  const health = useHealth();
  const version = health.data && health.data.version;

  let page;
  if (detailParams) {
    page = html`<${TaskDetailPage}
      slug=${detailParams.slug}
      key=${detailParams.slug}
    />`;
  } else if (current.path === '/log') {
    page = html`<${MasterLogPage} />`;
  } else {
    page = html`<${TaskListPage} />`;
  }

  return html`
    <div class="shell">
      <header class="shell-header">
        <a class="shell-title" href="#/">Maintenance Tracker</a>
        <nav class="shell-nav">
          <a
            class=${'nav-link' + (!detailParams && current.path !== '/log' ? ' active' : '')}
            href="#/"
            >Tasks</a
          >
          <a
            class=${'nav-link' + (current.path === '/log' ? ' active' : '')}
            href="#/log"
            >Log</a
          >
        </nav>
        <${ThemeToggle} />
      </header>
      <main class="shell-main">${page}</main>
      <footer class="shell-footer">
        <div class="shell-footer-links">
          <a
            href="https://www.npmjs.com/package/signalk-maintenance-tracker"
            target="_blank"
            rel="noopener"
            >signalk-maintenance-tracker</a
          >
          ${version && html`<span class="dot-spacer">·</span><span>v${version}</span>`}
        </div>
        <div class="shell-footer-auth">
          <${AuthControl} />
        </div>
      </footer>
      <${Toaster} />
      <${LoginModal} />
    </div>
  `;
}
