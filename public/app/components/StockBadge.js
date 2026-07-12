/**
 * Stock-status badge for a task's linked consumables
 * (docs/inventory-interaction.md): "In stock" / "Low stock" / "Out of
 * stock", worst-case across all linked items. Renders nothing for a task
 * with no linked consumables, or while the stock data hasn't loaded yet.
 *
 * If stowage-mgmt is reachable but the request fails for a real reason (as
 * opposed to simply being uninstalled), pops a toast rather than staying
 * silent — this task already has evidence of a prior working link, so a
 * silent failure here would hide a real problem (resolved discovery/
 * failure-handling decision).
 */
import { html } from '../lib/html.js';
import { useEffect, useRef } from '../../vendor/preact-hooks.js';
import {
  useStowageItems,
  summarizeStock,
  StowageUnavailableError,
} from '../api/stowage.js';
import { toast } from '../lib/toasts.js';

const LABELS = { out: 'Out of stock', low: 'Low stock', ok: 'In stock' };

/** @param {{ consumables: import('../types.js').TaskConsumableDTO[] }} props */
export function StockBadge(props) {
  const consumables = props.consumables || [];
  const itemsRes = useStowageItems();
  const lastToasted = useRef(/** @type {Error|null} */ (null));

  useEffect(() => {
    if (!consumables.length) return;
    const err = itemsRes.error;
    if (
      err &&
      !(err instanceof StowageUnavailableError) &&
      lastToasted.current !== err
    ) {
      lastToasted.current = err;
      toast('Could not check stowage-mgmt stock levels for a task.', 'error');
    }
  }, [itemsRes.error, consumables.length]);

  if (!consumables.length) return null;
  const status = summarizeStock(consumables, itemsRes.data || []);
  if (!status) return null;

  return html`<span
    class=${'badge ' + status}
    title="Stock status for this task's linked parts"
    >${LABELS[status]}</span
  >`;
}
