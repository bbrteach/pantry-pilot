import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownAZ,
  ArrowUpDown,
  Check,
  Edit3,
  PackageCheck,
  Plus,
  ShoppingCart,
  Tag,
  Trash2,
} from 'lucide-react';
import type { GroceryListItem, Staple, StaplePayload } from '../types';
import { StapleFormModal } from '../components/StapleFormModal';
import { normalizeIngKey } from '../utils/variants';
import {
  getEffectiveStapleCategory,
  groupSortedStaples,
  type StapleSortMode,
} from '../utils/stapleCategories';

const SORT_STORAGE_KEY = 'pantrypilot.staplesSortMode';

function getInitialSortMode(): StapleSortMode {
  try {
    const saved = window.localStorage.getItem(SORT_STORAGE_KEY);
    if (saved === 'auto' || saved === 'az' || saved === 'category') {
      return saved;
    }
  } catch {
    // Ignore storage errors
  }
  return 'auto';
}

interface StaplesViewProps {
  staples: Staple[];
  groceryItems: GroceryListItem[];
  onCreateStaple: (payload: StaplePayload) => Promise<void>;
  onUpdateStaple: (id: number, payload: Partial<StaplePayload>) => Promise<void>;
  onDeleteStaple: (id: number) => Promise<void>;
  onAddStapleToList: (staple: Staple) => Promise<void>;
}

export function StaplesView({
  staples,
  groceryItems,
  onCreateStaple,
  onUpdateStaple,
  onDeleteStaple,
  onAddStapleToList,
}: StaplesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaple, setEditingStaple] = useState<Staple | null>(null);
  const [addingStapleId, setAddingStapleId] = useState<number | null>(null);
  const [sortMode, setSortMode] = useState<StapleSortMode>(getInitialSortMode);

  useEffect(() => {
    try {
      window.localStorage.setItem(SORT_STORAGE_KEY, sortMode);
    } catch {
      // Ignore storage errors
    }
  }, [sortMode]);

  const autoCount = staples.filter((s) => s.autoInclude).length;

  const activeGroceryByNorm = useMemo(() => {
    const map = new Map<string, GroceryListItem>();
    for (const item of groceryItems) {
      if (!item.isChecked) {
        map.set(normalizeIngKey(item.name), item);
      }
    }
    return map;
  }, [groceryItems]);

  const stapleGroups = useMemo(
    () => groupSortedStaples(staples, sortMode),
    [staples, sortMode]
  );

  const openCreate = () => {
    setEditingStaple(null);
    setModalOpen(true);
  };

  const openEdit = (staple: Staple) => {
    setEditingStaple(staple);
    setModalOpen(true);
  };

  const handleSave = async (payload: StaplePayload) => {
    if (editingStaple) {
      await onUpdateStaple(editingStaple.id, payload);
    } else {
      await onCreateStaple(payload);
    }
  };

  const handleAddToListClick = async (staple: Staple) => {
    setAddingStapleId(staple.id);
    try {
      await onAddStapleToList(staple);
    } finally {
      setAddingStapleId(null);
    }
  };

  const sortOptions: Array<{
    mode: StapleSortMode;
    label: string;
    shortLabel: string;
    icon: typeof ArrowUpDown;
  }> = [
    {
      mode: 'auto',
      label: 'Auto-Included First',
      shortLabel: 'Auto First',
      icon: ArrowUpDown,
    },
    {
      mode: 'az',
      label: 'A–Z',
      shortLabel: 'A–Z',
      icon: ArrowDownAZ,
    },
    {
      mode: 'category',
      label: 'Category',
      shortLabel: 'Category',
      icon: Tag,
    },
  ];

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            Recurring Staples
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {autoCount} of {staples.length} household essentials auto-included on new lists · tap{' '}
            <span className="font-semibold text-[#1B5E42]">Add to List</span> on any staple anytime
          </p>
        </div>
        <button
          id="add-staple-btn"
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] active:scale-[0.98] transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Staple</span>
        </button>
      </div>

      {staples.length > 0 && (
        <div
          role="group"
          aria-label="Sort recurring staples"
          className="flex items-center gap-2 flex-wrap"
        >
          <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#85918A] mr-0.5">
            <ArrowUpDown className="w-3.5 h-3.5" />
            Sort
          </span>
          {sortOptions.map((opt) => {
            const Icon = opt.icon;
            const active = sortMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                aria-pressed={active}
                data-testid={`sort-staples-${opt.mode}`}
                onClick={() => setSortMode(opt.mode)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#1B5E42] text-white border-[#1B5E42] shadow-xs'
                    : 'bg-white text-[#5C6961] border-[#E6E1D6] hover:border-[#1B5E42]/40 hover:text-[#1A241E]'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">{opt.label}</span>
                <span className="sm:hidden">{opt.shortLabel}</span>
              </button>
            );
          })}
        </div>
      )}

      {staples.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#E6E1D6] p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4EF] text-[#1B5E42] mx-auto flex items-center justify-center mb-3">
            <PackageCheck className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#1A241E]">No recurring staples yet</h2>
          <p className="text-sm text-[#5C6961] mt-1 max-w-xs mx-auto">
            Add weekly essentials like Milk, Eggs, Bottled Water, or Paper Towels so you never forget them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {stapleGroups.map((group) => (
            <div key={group.key} data-testid={`staple-group-${group.key}`} className="space-y-2">
              {group.label && (
                <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-[#85918A]">
                  {group.label} ({group.items.length})
                </h2>
              )}
              <div className="bg-white rounded-3xl border border-[#E6E1D6] divide-y divide-[#F0ECE3] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
                {group.items.map((staple) => {
                  const activeItem = activeGroceryByNorm.get(normalizeIngKey(staple.name));
                  const isAdding = addingStapleId === staple.id;
                  const effectiveCategory = getEffectiveStapleCategory(staple);

                  return (
                    <div
                      key={staple.id}
                      data-testid={`staple-row-${staple.id}`}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FCFBF8] transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm sm:text-base font-bold text-[#1A241E] truncate">
                            {staple.name}
                          </h3>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[#FAF8F4] border border-[#E6E1D6] text-[#39453E] tabular-nums">
                            {staple.quantity}
                            {staple.unit ? ` ${staple.unit}` : ''}
                          </span>
                          {sortMode !== 'category' && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#F5F2EB] text-[#5C6961]">
                              {effectiveCategory}
                            </span>
                          )}
                          {activeItem && (
                            <span
                              data-testid={`staple-in-list-badge-${staple.id}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF4EF] text-[#1B5E42] border border-[#C4DDD0] tabular-nums"
                            >
                              <Check className="w-3 h-3 stroke-[2.5]" />
                              In list ({activeItem.quantityDisplay})
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#5C6961] mt-0.5">
                          {staple.autoInclude
                            ? 'Auto-included on new grocery lists'
                            : 'Saved only — not auto-included'}
                        </p>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={isAdding}
                          data-testid={`add-staple-to-list-${staple.id}`}
                          aria-label={
                            activeItem
                              ? `Add another ${staple.name} to grocery list`
                              : `Add ${staple.name} to grocery list`
                          }
                          title={
                            activeItem
                              ? `Already on active list/cart (${activeItem.quantityDisplay}) — tap to add another`
                              : 'Add to active grocery list & Kroger cart'
                          }
                          onClick={() => void handleAddToListClick(staple)}
                          className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold transition-all active:scale-[0.98] disabled:opacity-60 cursor-pointer ${
                            activeItem
                              ? 'bg-[#EBF4EF] text-[#1B5E42] border border-[#1B5E42]/40 hover:bg-[#DCECE3]'
                              : !staple.autoInclude
                              ? 'bg-[#1B5E42] text-white hover:bg-[#144A33] shadow-2xs'
                              : 'bg-[#EBF4EF] text-[#1B5E42] border border-[#C4DDD0] hover:bg-[#1B5E42] hover:text-white hover:border-[#1B5E42]'
                          }`}
                        >
                          <ShoppingCart className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            {isAdding
                              ? 'Adding...'
                              : activeItem
                              ? 'Add +1'
                              : 'Add to List'}
                          </span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={staple.autoInclude}
                            aria-label={`Auto-include ${staple.name} on new lists`}
                            data-testid={`toggle-staple-${staple.id}`}
                            onClick={() =>
                              onUpdateStaple(staple.id, { autoInclude: !staple.autoInclude })
                            }
                            className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors cursor-pointer ${
                              staple.autoInclude ? 'bg-[#1B5E42]' : 'bg-[#D6D1C6]'
                            }`}
                          >
                            <span
                              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition-transform ${
                                staple.autoInclude ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>

                          <button
                            type="button"
                            aria-label={`Edit ${staple.name}`}
                            onClick={() => openEdit(staple)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#5C6961] hover:text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors cursor-pointer"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${staple.name}`}
                            onClick={() => onDeleteStaple(staple.id)}
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-[#5C6961] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <StapleFormModal
        isOpen={modalOpen}
        initialStaple={editingStaple}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSave}
      />
    </section>
  );
}
