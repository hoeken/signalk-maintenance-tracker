/**
 * App shell (§7.2): header (title, nav, global search, theme toggle, auth
 * control), route switch, toaster, and the globally-mounted login modal.
 */
import { html } from './lib/html.js';
import { useState } from '../vendor/preact-hooks.js';
import { route, matchPath, navigate } from './lib/router.js';
import { Toaster } from './components/Toaster.js';
import { ThemeToggle } from './components/ThemeToggle.js';
import { AuthControl } from './components/AuthControl.js';
import { LoginModal } from './components/LoginModal.js';
import { TaskListPage } from './pages/TaskListPage.js';
import { TaskDetailPage } from './pages/TaskDetailPage.js';
import { MasterLogPage } from './pages/MasterLogPage.js';

function GlobalSearch() {
  const [text, setText] = useState('');
  /** @param {Event} e */
  const onSubmit = (e) => {
    e.preventDefault();
    navigate('/', text ? { search: text } : {});
    setText('');
  };
  return html`
    <form class="search-box" onSubmit=${onSubmit}>
      <i class="bi bi-search" />
      <input
        class="input"
        placeholder="Search…"
        aria-label="Search everywhere"
        value=${text}
        onInput=${(/** @type {any} */ e) => setText(e.currentTarget.value)}
      />
    </form>
  `;
}

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
          <${GlobalSearch} />
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
