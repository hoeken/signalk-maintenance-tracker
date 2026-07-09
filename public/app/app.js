/**
 * App shell (§7.2): header (title, nav, theme toggle, auth control),
 * route switch, toaster, and the globally-mounted login modal.
 */
import { html } from './lib/html.js';
import { route, matchPath } from './lib/router.js';
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

  let page;
  if (detailParams) {
    page = html`<${TaskDetailPage} slug=${detailParams.slug} key=${detailParams.slug} />`;
  } else if (current.path === '/log') {
    page = html`<${MasterLogPage} />`;
  } else {
    page = html`<${TaskListPage} />`;
  }

  return html`
    <div class="shell">
      <header class="shell-header">
        <a class="shell-title" href="#/"><i class="bi bi-wrench-adjustable" />Maintenance Tracker</a>
        <nav class="shell-nav">
          <a class=${'nav-link' + (!detailParams && current.path !== '/log' ? ' active' : '')} href="#/">Tasks</a>
          <a class=${'nav-link' + (current.path === '/log' ? ' active' : '')} href="#/log">Log</a>
        </nav>
        <div class="shell-tools">
          <${ThemeToggle} />
          <${AuthControl} />
        </div>
      </header>
      <main class="shell-main">${page}</main>
      <${Toaster} />
      <${LoginModal} />
    </div>
  `;
}
