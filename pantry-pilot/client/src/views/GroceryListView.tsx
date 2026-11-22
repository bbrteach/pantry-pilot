import { useState } from 'react';
import {
  Check,
  Minus,
  Plus,
  ShoppingBasket,
  Trash2,
  CalendarPlus,
} from 'lucide-react';
import type { GroceryListItem, KrogerStatus } from '../types';
import { KrogerBanner } from '../components/KrogerBanner';

interface GroceryListViewProps {
  items: GroceryListItem[];
  krogerStatus: KrogerStatus | null;
  onToggleChecked: (item: GroceryListItem) => Promise<void>;
  onStepQuantity: (item: GroceryListItem, delta: number, unitIndex?: number) => Promise<void>;
  onDeleteItem: (id: number) => Promise<void>;
  onClearChecked: () => Promise<void>;
  onAddAdHocItem: (payload: { name: string; quantity: number; unit: string }) => Promise<void>;
  onGoToPlanner: () => void;
  onOpenKroger: () => void;
}

export function GroceryListView({
  items,
  krogerStatus,
  onToggleChecked,
  onStepQuantity,
  onDeleteItem,
  onClearChecked,
  onAddAdHocItem,
  onGoToPlanner,
  onOpenKroger,
}: GroceryListViewProps) {
  const [adHocName, setAdHocName] = useState('');
  const [adHocQty, setAdHocQty] = useState('1');
  const [adHocUnit, setAdHocUnit] = useState('');
  const [adding, setAdding] = useState(false);

  const activeItems = items.filter((item) => !item.isChecked);
  const checkedItems = items.filter((item) => item.isChecked);

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

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
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

        <button
          type="button"
          onClick={onGoToPlanner}
          className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold bg-white border border-[#E6E1D6] text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors shrink-0 cursor-pointer"
        >
          <CalendarPlus className="w-4 h-4" />
          <span>Edit Plan</span>
        </button>
      </div>

      {/* Kroger status / Match & Send CTA banner */}
      <KrogerBanner
        krogerStatus={krogerStatus}
        onOpenKroger={onOpenKroger}
        activeItemsCount={activeItems.length}
      />

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
              {activeItems.map((item) => (
                <div
                  key={item.id}
                  data-testid={`grocery-item-${item.id}`}
                  data-item-name={item.normalizedName}
                  className="p-3.5 sm:p-4 flex items-start sm:items-center justify-between gap-3 hover:bg-[#FCFBF8] transition-colors"
                >
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
              ))}
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
