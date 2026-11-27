import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarPlus,
  Check,
  Minus,
  Plus,
  RefreshCw,
  ShoppingBasket,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import type {
  CheaperAlternativeOption,
  GroceryItemSavingsAlert,
  GroceryListItem,
  KrogerStatus,
  SavingsCheckResponse,
} from '../types';
import { KrogerBanner } from '../components/KrogerBanner';

interface GroceryListViewProps {
  items: GroceryListItem[];
  krogerStatus: KrogerStatus | null;
  savingsData: SavingsCheckResponse | null;
  checkingSavings: boolean;
  onCheckSavings: () => Promise<void>;
  onSwitchToAlternative: (
    item: GroceryListItem,
    alt: CheaperAlternativeOption
  ) => Promise<void>;
  onToggleChecked: (item: GroceryListItem) => Promise<void>;
  onStepQuantity: (item: GroceryListItem, delta: number, unitIndex?: number) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onClearChecked: () => Promise<void>;
  onClearAll: () => Promise<void>;
  onAddAdHocItem: (payload: { name: string; quantity: number; unit: string }) => Promise<void>;
  onGoToPlanner: () => void;
  onOpenKroger: () => void;
}

export function GroceryListView({
  items,
  krogerStatus,
  savingsData,
  checkingSavings,
  onCheckSavings,
  onSwitchToAlternative,
  onToggleChecked,
  onStepQuantity,
  onDeleteItem,
  onClearChecked,
  onClearAll,
  onAddAdHocItem,
  onGoToPlanner,
  onOpenKroger,
}: GroceryListViewProps) {
  const [adHocName, setAdHocName] = useState('');
  const [adHocQty, setAdHocQty] = useState('1');
  const [adHocUnit, setAdHocUnit] = useState('');
  const [adding, setAdding] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<number>>(new Set());
  const [switchingItemId, setSwitchingItemId] = useState<number | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);
  const [clearingAll, setClearingAll] = useState(false);

  const activeItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);
  const mappedActiveCount = activeItems.filter((i) => Boolean(i.productMapping)).length;
  const canCheckSavings = Boolean(
    krogerStatus?.configured && krogerStatus?.store && mappedActiveCount > 0
  );

  const visibleAlerts = useMemo(
    () => (savingsData?.alerts ?? []).filter((a) => !dismissedIds.has(a.groceryItemId)),
    [savingsData, dismissedIds]
  );

  const alertByItemId = useMemo(() => {
    const map = new Map<number, GroceryItemSavingsAlert>();
    for (const alert of visibleAlerts) {
      map.set(alert.groceryItemId, alert);
    }
    return map;
  }, [visibleAlerts]);

  const visibleTotalSavings = useMemo(
    () =>
      Math.round(
        visibleAlerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0) * 100
      ) / 100,
    [visibleAlerts]
  );

  const handleAddAdHoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = adHocName.trim();
    if (!trimmed) return;
    const parsedQty = Number(adHocQty);
    const quantity = Number.isFinite(parsedQty) && parsedQty > 0 ? parsedQty : 1;

    setAdding(true);
    try {
      await onAddAdHocItem({
        name: trimmed,
        quantity,
        unit: adHocUnit.trim(),
      });
      setAdHocName('');
      setAdHocQty('1');
      setAdHocUnit('');
    } finally {
      setAdding(false);
    }
  };

  const handleSwitch = async (item: GroceryListItem, alt: CheaperAlternativeOption) => {
    setSwitchingItemId(item.id);
    try {
      await onSwitchToAlternative(item, alt);
      setDismissedIds((prev) => new Set(prev).add(item.id));
    } finally {
      setSwitchingItemId(null);
    }
  };

  const handleConfirmClearAll = async () => {
    setClearingAll(true);
    try {
      await onClearAll();
      setConfirmingClearAll(false);
      setDismissedIds(new Set());
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            Grocery List
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {items.length === 0
              ? 'Generate a list from your meal plan or add quick items below'
              : `${activeItems.length} to buy · ${checkedItems.length} already in pantry`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          {canCheckSavings && (
            <button
              id="check-savings-btn"
              type="button"
              disabled={checkingSavings}
              onClick={() => {
                setDismissedIds(new Set());
                void onCheckSavings();
              }}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-semibold bg-[#FDF3EB] border border-[#F0CFAF] text-[#8A421A] hover:bg-[#F9E6D4] disabled:opacity-60 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${checkingSavings ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {checkingSavings ? 'Checking prices...' : 'Check Cheaper Brands'}
              </span>
              <span className="sm:hidden">{checkingSavings ? '...' : 'Savings'}</span>
            </button>
          )}
          {items.length > 0 && (
            <button
              id="clear-all-grocery-items-btn"
              type="button"
              disabled={clearingAll}
              onClick={() => setConfirmingClearAll((prev) => !prev)}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-semibold bg-white border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear List</span>
            </button>
          )}
          <button
            type="button"
            onClick={onGoToPlanner}
            className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold bg-white border border-[#E6E1D6] text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors cursor-pointer"
          >
            <CalendarPlus className="w-4 h-4" />
            <span>Edit Plan</span>
          </button>
        </div>
      </div>

      {/* Inline confirmation banner for clearing entire shopping list */}
      {confirmingClearAll && items.length > 0 && (
        <div
          id="confirm-clear-grocery-list-banner"
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="text-xs sm:text-sm text-red-900">
            <span className="font-bold">Clear entire shopping list?</span>{' '}
            <span className="text-red-700">
              This removes all {items.length} {items.length === 1 ? 'item' : 'items'}
              {checkedItems.length > 0 ? ' (both active and checked off)' : ''}.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={clearingAll}
              onClick={() => setConfirmingClearAll(false)}
              className="h-9 px-3 rounded-xl text-xs font-semibold bg-white border border-[#E6E1D6] text-[#5C6961] hover:bg-[#F8F6F1] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="confirm-clear-all-grocery-items-btn"
              type="button"
              disabled={clearingAll}
              onClick={() => void handleConfirmClearAll()}
              className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-red-600 text-white hover:bg-red-700 disabled:opacity-60 transition-colors cursor-pointer"
            >
              {clearingAll ? 'Clearing...' : 'Yes, Clear Everything'}
            </button>
          </div>
        </div>
      )}

      {/* Kroger status / Match & Send CTA banner */}
      <KrogerBanner
        krogerStatus={krogerStatus}
        onOpenKroger={onOpenKroger}
        activeItemsCount={activeItems.length}
      />

      {/* Cheaper Brand / On-Sale Savings Notification Banner */}
      {visibleAlerts.length > 0 && (
        <div
          id="grocery-savings-banner"
          className="rounded-2xl border border-[#F0CFAF] bg-[#FDF3EB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-[#B85D2B] text-white flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="w-4.5 h-4.5" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#6E3414] tabular-nums">
                Save ~${visibleTotalSavings.toFixed(2)} — cheaper or on-sale brands found for{' '}
                {visibleAlerts.length} mapped {visibleAlerts.length === 1 ? 'item' : 'items'}
              </p>
              <p className="text-xs text-[#874823] mt-0.5">
                Review the highlighted savings below each item and tap &ldquo;Switch&rdquo; to swap to the cheaper Kroger option.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add one-off ad-hoc item bar */}
      <form
        onSubmit={handleAddAdHoc}
        className="bg-white rounded-2xl border border-[#E6E1D6] p-3 sm:p-3.5 shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
      >
        <p className="text-xs font-bold uppercase tracking-wider text-[#85918A] mb-2">
          Add one-off item
        </p>
        <div className="grid grid-cols-[1fr_64px_82px_auto] gap-2 items-center">
          <input
            id="adhoc-name-input"
            type="text"
            placeholder="Item name (e.g., Dish Soap)"
            value={adHocName}
            onChange={(e) => setAdHocName(e.target.value)}
            className="h-10 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] placeholder:text-[#8A948D] focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
          />
          <input
            id="adhoc-qty-input"
            type="number"
            step="any"
            min="0.25"
            aria-label="Quantity"
            value={adHocQty}
            onChange={(e) => setAdHocQty(e.target.value)}
            className="h-10 px-2 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] tabular-nums text-center focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
          />
          <input
            id="adhoc-unit-input"
            type="text"
            placeholder="Unit"
            aria-label="Unit"
            value={adHocUnit}
            onChange={(e) => setAdHocUnit(e.target.value)}
            className="h-10 px-2.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
          />
          <button
            id="adhoc-add-btn"
            type="submit"
            disabled={adding || !adHocName.trim()}
            className="h-10 px-3.5 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] disabled:opacity-45 transition-colors inline-flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Add</span>
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#E6E1D6] p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4EF] text-[#1B5E42] mx-auto flex items-center justify-center mb-3">
            <ShoppingBasket className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#1A241E]">Your grocery list is empty</h2>
          <p className="text-sm text-[#5C6961] mt-1 max-w-xs mx-auto">
            Pick your meals in the Planner tab and tap Generate Grocery List to consolidate everything automatically.
          </p>
          <button
            type="button"
            onClick={onGoToPlanner}
            className="mt-4 h-11 px-5 rounded-xl text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] transition-colors cursor-pointer"
          >
            Go to Meal Planner
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Active items */}
          {activeItems.length > 0 && (
            <div className="bg-white rounded-3xl border border-[#E6E1D6] divide-y divide-[#F0ECE3] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
              {activeItems.map((item) => {
                const savingsAlert = alertByItemId.get(item.id);
                const alt = savingsAlert?.bestAlternative;

                return (
                  <div
                    key={item.id}
                    data-testid={`grocery-item-${item.id}`}
                    data-item-name={item.normalizedName}
                    className="p-3.5 sm:p-4 space-y-2.5 hover:bg-[#FCFBF8] transition-colors"
                  >
                    <div className="flex items-start sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <button
                          type="button"
                          aria-label={`Mark ${item.name} as in pantry`}
                          data-testid={`check-grocery-item-${item.id}`}
                          onClick={() => onToggleChecked(item)}
                          className="mt-0.5 w-6 h-6 rounded-lg border-2 border-[#C8C2B5] hover:border-[#1B5E42] flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm sm:text-base font-bold text-[#1A241E]">
                              {item.name}
                            </span>
                            <span
                              data-testid={`grocery-qty-${item.id}`}
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-bold tabular-nums ${
                                item.unitBreakdown.length > 1
                                  ? 'bg-[#FDF3EB] text-[#8A421A] border border-[#F0CFAF]'
                                  : 'bg-[#EBF4EF] text-[#1B5E42]'
                              }`}
                            >
                              {item.quantityDisplay}
                            </span>
                          </div>
                          {item.sources.length > 0 && (
                            <p
                              data-testid={`grocery-sources-${item.id}`}
                              className="text-xs text-[#6B7770] mt-0.5 leading-snug"
                            >
                              From: {item.sources.join(', ')}
                            </p>
                          )}
                          {item.productMapping && (
                            <p className="text-[11px] text-[#1B5E42] font-medium mt-0.5 truncate">
                              Mapped: {item.productMapping.description}
                              {item.productMapping.promoPrice ?? item.productMapping.lastPrice
                                ? ` ($${(item.productMapping.promoPrice ?? item.productMapping.lastPrice)!.toFixed(2)})`
                                : ''}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Stepper & one-tap delete */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="inline-flex items-center rounded-xl border border-[#E6E1D6] bg-[#FAF8F4] p-0.5">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${item.name}`}
                            data-testid={`dec-grocery-item-${item.id}`}
                            onClick={() => onStepQuantity(item, -1, 0)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white hover:text-[#1A241E] transition-colors cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${item.name}`}
                            data-testid={`inc-grocery-item-${item.id}`}
                            onClick={() => onStepQuantity(item, 1, 0)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white hover:text-[#1A241E] transition-colors cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          aria-label={`Remove ${item.name} from list`}
                          data-testid={`delete-grocery-item-${item.id}`}
                          onClick={() => onDeleteItem(item.id)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-[#85918A] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Inline Cheaper Brand / Sale Alternative Notification */}
                    {savingsAlert && alt && (
                      <div
                        data-testid={`savings-alert-${item.id}`}
                        className="ml-9 rounded-xl border border-[#F0CFAF] bg-[#FDF3EB]/90 px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                      >
                        <div className="min-w-0 text-xs">
                          <span className="inline-flex items-center gap-1 font-bold text-[#8A421A]">
                            <Sparkles className="w-3 h-3" />
                            {alt.isOnSale ? 'On-sale alternative:' : 'Cheaper brand:'}
                          </span>{' '}
                          <span className="font-semibold text-[#1A241E]">
                            {alt.recommendedCartQuantity &&
                            alt.recommendedCartQuantity !== savingsAlert.cartQuantity
                              ? `${alt.recommendedCartQuantity} × `
                              : ''}
                            {alt.description}
                          </span>
                          {alt.size ? <span className="text-[#5C6961]"> ({alt.size})</span> : null}{' '}
                          {alt.recommendedCartQuantity &&
                          alt.recommendedCartQuantity !== savingsAlert.cartQuantity ? (
                            <>
                              <span className="font-bold text-[#B85D2B] tabular-nums">
                                ${alt.effectivePrice.toFixed(2)} ea ($
                                {(
                                  alt.totalAlternativeCost ??
                                  alt.effectivePrice * alt.recommendedCartQuantity
                                ).toFixed(2)}{' '}
                                total)
                              </span>{' '}
                              <span className="text-[#874823] tabular-nums">
                                vs. $
                                {(
                                  alt.currentTotalCost ??
                                  savingsAlert.currentProduct.effectivePrice *
                                    savingsAlert.cartQuantity
                                ).toFixed(2)}{' '}
                                (Save ${alt.totalSavings.toFixed(2)})
                              </span>
                            </>
                          ) : (
                            <>
                              <span className="font-bold text-[#B85D2B] tabular-nums">
                                ${alt.effectivePrice.toFixed(2)}
                              </span>{' '}
                              <span className="text-[#874823] tabular-nums">
                                vs. ${savingsAlert.currentProduct.effectivePrice.toFixed(2)} (Save $
                                {alt.totalSavings.toFixed(2)})
                              </span>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            disabled={switchingItemId === item.id}
                            onClick={() => void handleSwitch(item, alt)}
                            className="h-7 px-2.5 rounded-lg bg-[#1B5E42] text-white text-[11px] font-semibold hover:bg-[#144A33] inline-flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            {switchingItemId === item.id ? 'Switching...' : 'Switch'}
                          </button>
                          <button
                            type="button"
                            aria-label="Dismiss savings alert"
                            onClick={() =>
                              setDismissedIds((prev) => new Set(prev).add(item.id))
                            }
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#874823] hover:bg-white/70 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Checked / In Pantry section */}
          {checkedItems.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-xs font-bold uppercase tracking-wider text-[#85918A]">
                  Checked Off / Already in Pantry ({checkedItems.length})
                </h2>
                <button
                  id="clear-checked-items-btn"
                  type="button"
                  onClick={onClearChecked}
                  className="text-xs font-semibold text-[#B85D2B] hover:underline cursor-pointer"
                >
                  Remove checked
                </button>
              </div>
              <div className="bg-white/75 rounded-3xl border border-[#E6E1D6] divide-y divide-[#F0ECE3] overflow-hidden">
                {checkedItems.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`grocery-item-${item.id}`}
                    data-item-name={item.normalizedName}
                    className="p-3.5 flex items-center justify-between gap-3 opacity-75"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <button
                        type="button"
                        aria-label={`Uncheck ${item.name}`}
                        data-testid={`check-grocery-item-${item.id}`}
                        onClick={() => onToggleChecked(item)}
                        className="w-6 h-6 rounded-lg bg-[#1B5E42] text-white flex items-center justify-center shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </button>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-[#5C6961] line-through">
                          {item.name}
                        </span>
                        <span className="ml-2 text-xs text-[#85918A] tabular-nums">
                          ({item.quantityDisplay})
                        </span>
                        {item.sources.length > 0 && (
                          <p className="text-[11px] text-[#85918A] truncate">
                            From: {item.sources.join(', ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${item.name} from list`}
                      data-testid={`delete-grocery-item-${item.id}`}
                      onClick={() => onDeleteItem(item.id)}
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-[#85918A] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
