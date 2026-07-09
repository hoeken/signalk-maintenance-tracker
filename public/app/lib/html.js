import htm from '../../vendor/htm.js';
import { h, Fragment } from '../../vendor/preact.js';

/** Tagged template for JSX-free Preact (§3): html`<div>...</div>` */
export const html = htm.bind(h);
export { Fragment };
