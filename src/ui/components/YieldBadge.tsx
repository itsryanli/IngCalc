import type { ResolvedYield } from '../../core/yieldResolver';
import { yieldSentence } from '../labels';

/** `published` is shown only to contrast with a measured factor that replaced it. */
export function YieldBadge({ resolved, published }: { resolved: ResolvedYield; published?: number }) {
  return (
    <p className={`yield-badge yield-badge--${resolved.source}`} data-testid="yield-badge">
      {yieldSentence(resolved, published)}
    </p>
  );
}
