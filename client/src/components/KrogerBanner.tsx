import { ArrowRight, KeyRound, ShoppingCart } from 'lucide-react';
import type { KrogerStatus } from '../types';

interface KrogerBannerProps {
  krogerStatus: KrogerStatus | null;
  onOpenKroger?: () => void;
  activeItemsCount?: number;
}

export function KrogerBanner({
  krogerStatus,
  onOpenKroger,
  activeItemsCount = 0,
}: KrogerBannerProps) {
  const configured = Boolean(krogerStatus?.configured);

  if (!configured) {
    return (
      <div
        id="kroger-disabled-banner"
        className="rounded-2xl border border-[#F0CFAF] bg-[#FDF3EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
      >
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#B85D2B]/12 text-[#B85D2B] flex items-center justify-center shrink-0 mt-0.5">
            <KeyRound className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#6E3414]">
              Add Kroger API credentials to{' '}
              <code className="px-1.5 py-0.5 rounded bg-[#B85D2B]/10 text-[#6E3414] font-mono text-xs">
                .env
              </code>{' '}
              to enable
            </p>
            <p className="text-xs text-[#874823] mt-0.5 leading-relaxed">
              Set <code className="font-mono">KROGER_CLIENT_ID</code> and{' '}
              <code className="font-mono">KROGER_CLIENT_SECRET</code> in your project{' '}
              <code className="font-mono">.env</code> file to enable store selection, product
              matching, and automated Kroger cart filling.
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled
          className="shrink-0 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs font-semibold bg-[#E8DFD3] text-[#857A6E] cursor-not-allowed"
        >
          <ShoppingCart className="w-4 h-4" />
          Send to Kroger (Disabled)
        </button>
      </div>
    );
  }

  if (!onOpenKroger) {
    return null;
  }

  return (
    <div
      id="kroger-ready-banner"
      className="rounded-2xl border border-[#C4DDD0] bg-[#EBF4EF] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl bg-[#1B5E42] text-white flex items-center justify-center shrink-0 mt-0.5">
          <ShoppingCart className="w-4.5 h-4.5" />
        </div>
        <div>
          <p className="text-sm font-bold text-[#144A33]">
            Ready to fill your Kroger cart
          </p>
          <p className="text-xs text-[#2D5E47] mt-0.5">
            {krogerStatus?.store
              ? `Store: ${krogerStatus.store.name}`
              : 'Pick your local Kroger store and match your items to send in one batch.'}
          </p>
        </div>
      </div>

      <button
        id="open-kroger-match-btn"
        type="button"
        onClick={onOpenKroger}
        className="shrink-0 inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] transition-colors shadow-xs cursor-pointer"
      >
        <span>
          Match &amp; Send{activeItemsCount > 0 ? ` (${activeItemsCount})` : ''}
        </span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
