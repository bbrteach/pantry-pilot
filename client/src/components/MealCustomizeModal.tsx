import { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Salad,
  Trash2,
  X,
} from 'lucide-react';
import type { Meal, MealCustomization, MealSideItem, QuickSidePreset } from '../types';
import { getSuggestedVariantsForIngredient, normalizeIngKey } from '../utils/variants';

interface MealCustomizeModalProps {
  meal: Meal | null;
  initialCustomization: MealCustomization | null;
  sidePresets: QuickSidePreset[];
  onSaveSidePresets: (presets: QuickSidePreset[]) => Promise<void>;
  onResetSidePresets: () => Promise<void>;
  onClose: () => void;
  onSave: (
    mealId: number,
    payload: { sides: MealSideItem[]; swaps: Record<string, string> }
  ) => Promise<void>;
}

export function MealCustomizeModal({
  meal,
  initialCustomization,
  sidePresets,
  onSaveSidePresets,
  onResetSidePresets,
  onClose,
  onSave,
}: MealCustomizeModalProps) {
  const [sides, setSides] = useState<MealSideItem[]>([]);
  const [swaps, setSwaps] = useState<Record<string, string>>({});
  const [customSideName, setCustomSideName] = useState('');
  const [customSideQty, setCustomSideQty] = useState('1');
  const [customSideUnit, setCustomSideUnit] = useState('bag');
  const [editingIngKey, setEditingIngKey] = useState<string | null>(null);
  const [customSwapText, setCustomSwapText] = useState('');
  const [saving, setSaving] = useState(false);

  // Quick-pick presets management state
  const [editingPresets, setEditingPresets] = useState(false);
  const [savingPresets, setSavingPresets] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetQty, setNewPresetQty] = useState('1');
  const [newPresetUnit, setNewPresetUnit] = useState('bag');
  const [newPresetCat, setNewPresetCat] = useState<'Vegetable' | 'Side'>('Vegetable');
  const [editingPresetIndex, setEditingPresetIndex] = useState<number | null>(null);
  const [editPresetName, setEditPresetName] = useState('');
  const [editPresetQty, setEditPresetQty] = useState('1');
  const [editPresetUnit, setEditPresetUnit] = useState('');
  const [editPresetCat, setEditPresetCat] = useState<'Vegetable' | 'Side'>('Vegetable');

  useEffect(() => {
    if (!meal) return;
    setSides(initialCustomization?.sides ? [...initialCustomization.sides] : []);
    setSwaps(initialCustomization?.swaps ? { ...initialCustomization.swaps } : {});
    setCustomSideName('');
    setCustomSideQty('1');
    setCustomSideUnit('bag');
    setEditingIngKey(null);
    setCustomSwapText('');
    setEditingPresets(false);
    setEditingPresetIndex(null);
  }, [meal, initialCustomization]);

  if (!meal) return null;

  const hasSide = (name: string) =>
    sides.some((s) => normalizeIngKey(s.name) === normalizeIngKey(name));

  const togglePresetSide = (preset: QuickSidePreset) => {
    const norm = normalizeIngKey(preset.name);
    if (sides.some((s) => normalizeIngKey(s.name) === norm)) {
      setSides((prev) => prev.filter((s) => normalizeIngKey(s.name) !== norm));
    } else {
      setSides((prev) => [
        ...prev,
        {
          id: `side-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: preset.name,
          quantity: preset.quantity,
          unit: preset.unit,
        },
      ]);
    }
  };

  const handleAddPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    const qty = Number(newPresetQty);
    const nextPreset: QuickSidePreset = {
      name: trimmed,
      quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
      unit: newPresetUnit.trim(),
      category: newPresetCat,
    };
    const existsIdx = sidePresets.findIndex(
      (p) => normalizeIngKey(p.name) === normalizeIngKey(trimmed)
    );
    const updated =
      existsIdx >= 0
        ? sidePresets.map((p, idx) => (idx === existsIdx ? nextPreset : p))
        : [...sidePresets, nextPreset];
    setSavingPresets(true);
    try {
      await onSaveSidePresets(updated);
      setNewPresetName('');
      setNewPresetQty('1');
    } finally {
      setSavingPresets(false);
    }
  };

  const handleRemovePreset = async (index: number) => {
    const updated = sidePresets.filter((_, idx) => idx !== index);
    setSavingPresets(true);
    try {
      await onSaveSidePresets(updated);
      if (editingPresetIndex === index) setEditingPresetIndex(null);
    } finally {
      setSavingPresets(false);
    }
  };

  const startEditPreset = (index: number) => {
    const p = sidePresets[index];
    setEditingPresetIndex(index);
    setEditPresetName(p.name);
    setEditPresetQty(String(p.quantity));
    setEditPresetUnit(p.unit);
    setEditPresetCat(p.category);
  };

  const handleSaveEditPreset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingPresetIndex === null) return;
    const trimmed = editPresetName.trim();
    if (!trimmed) return;
    const qty = Number(editPresetQty);
    const updated = sidePresets.map((p, idx) =>
      idx === editingPresetIndex
        ? {
            name: trimmed,
            quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
            unit: editPresetUnit.trim(),
            category: editPresetCat,
          }
        : p
    );
    setSavingPresets(true);
    try {
      await onSaveSidePresets(updated);
      setEditingPresetIndex(null);
    } finally {
      setSavingPresets(false);
    }
  };

  const handleResetPresetsClick = async () => {
    setSavingPresets(true);
    try {
      await onResetSidePresets();
      setEditingPresetIndex(null);
    } finally {
      setSavingPresets(false);
    }
  };

  const addCustomSide = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = customSideName.trim();
    if (!trimmed) return;
    const qty = Number(customSideQty);
    setSides((prev) => [
      ...prev,
      {
        id: `side-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        quantity: Number.isFinite(qty) && qty > 0 ? qty : 1,
        unit: customSideUnit.trim(),
      },
    ]);
    setCustomSideName('');
    setCustomSideQty('1');
  };

  const removeSide = (id: string) => {
    setSides((prev) => prev.filter((s) => s.id !== id));
  };

  const applySwap = (origIngName: string, nextName: string) => {
    const key = normalizeIngKey(origIngName);
    const trimmed = nextName.trim();
    setSwaps((prev) => {
      const next = { ...prev };
      if (!trimmed || normalizeIngKey(trimmed) === key) {
        delete next[key];
      } else {
        next[key] = trimmed;
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(meal.id, { sides, swaps });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const swapCount = Object.keys(swaps).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A241E]/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="customize-meal-title"
    >
      <div className="bg-white w-full sm:max-w-2xl max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl border border-[#E6E1D6] shadow-2xl flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E6E1D6] flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2
              id="customize-meal-title"
              className="font-display text-lg sm:text-xl font-bold text-[#1A241E] truncate"
            >
              Customize: {meal.name}
            </h2>
            <p className="text-xs text-[#5C6961]">
              Applies to this plan&apos;s grocery list without changing your master recipe
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close customize modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#5C6961] hover:bg-[#F3EFE6] cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {/* Section 1: Add Vegetables & Sides */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#EBF4EF] text-[#1B5E42] flex items-center justify-center">
                  <Salad className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-[#1A241E]">
                  Vegetables &amp; Sides ({sides.length})
                </h3>
              </div>
              {sides.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSides([])}
                  className="text-xs font-semibold text-[#5C6961] hover:text-red-600 cursor-pointer"
                >
                  Clear sides
                </button>
              )}
            </div>

            {/* Active added sides */}
            {sides.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {sides.map((side) => (
                  <span
                    key={side.id}
                    data-testid={`added-side-${normalizeIngKey(side.name)}`}
                    className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-semibold bg-[#1B5E42] text-white"
                  >
                    <span>
                      {side.quantity}
                      {side.unit ? ` ${side.unit}` : ''} {side.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeSide(side.id)}
                      aria-label={`Remove ${side.name}`}
                      className="w-5 h-5 rounded-full hover:bg-white/20 flex items-center justify-center cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Quick-pick vegetables & sides */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-bold uppercase tracking-wider text-[#85918A]">
                  Quick-Pick Vegetables &amp; Sides ({sidePresets.length})
                </p>
                <div className="flex items-center gap-2">
                  {editingPresets && (
                    <button
                      id="reset-side-presets-btn"
                      type="button"
                      disabled={savingPresets}
                      onClick={() => void handleResetPresetsClick()}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#5C6961] hover:text-[#1A241E] disabled:opacity-50 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Reset Defaults
                    </button>
                  )}
                  <button
                    id="toggle-edit-presets-btn"
                    type="button"
                    onClick={() => {
                      setEditingPresets((v) => !v);
                      setEditingPresetIndex(null);
                    }}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer ${
                      editingPresets
                        ? 'bg-[#1B5E42] text-white border-[#1B5E42]'
                        : 'bg-white text-[#1B5E42] border-[#C4DDD0] hover:bg-[#EBF4EF]'
                    }`}
                  >
                    <Pencil className="w-3 h-3" />
                    <span>{editingPresets ? 'Done Editing' : 'Edit Quick Picks'}</span>
                  </button>
                </div>
              </div>

              {editingPresets ? (
                <div
                  id="quick-presets-editor"
                  className="rounded-2xl border border-[#C4DDD0] bg-[#FAF8F4] p-3 space-y-2.5"
                >
                  <p className="text-[11px] text-[#5C6961]">
                    Customize your family&apos;s one-tap veggie &amp; side buttons. Changes save automatically for all future meals.
                  </p>

                  {sidePresets.length === 0 ? (
                    <p className="text-xs text-[#85918A] italic py-1">
                      No quick-pick sides yet. Add your favorites below or tap Reset Defaults.
                    </p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1.5 pr-0.5">
                      {sidePresets.map((preset, idx) => {
                        const isRowEditing = editingPresetIndex === idx;
                        return (
                          <div
                            key={`${preset.name}-${idx}`}
                            className="rounded-xl bg-white border border-[#E6E1D6] px-2.5 py-1.5"
                          >
                            {isRowEditing ? (
                              <form
                                onSubmit={(e) => void handleSaveEditPreset(e)}
                                className="space-y-1.5"
                              >
                                <div className="grid grid-cols-[1fr_54px_66px] gap-1.5">
                                  <input
                                    type="text"
                                    value={editPresetName}
                                    onChange={(e) => setEditPresetName(e.target.value)}
                                    placeholder="Side name"
                                    aria-label="Edit preset name"
                                    className="h-8 px-2 rounded-lg border border-[#1B5E42] text-xs text-[#1A241E] focus:outline-none min-w-0"
                                  />
                                  <input
                                    type="number"
                                    step="any"
                                    min="0.25"
                                    value={editPresetQty}
                                    onChange={(e) => setEditPresetQty(e.target.value)}
                                    aria-label="Edit preset quantity"
                                    className="h-8 px-1.5 rounded-lg border border-[#D8D2C5] text-xs text-center tabular-nums focus:border-[#1B5E42] focus:outline-none min-w-0"
                                  />
                                  <input
                                    type="text"
                                    value={editPresetUnit}
                                    onChange={(e) => setEditPresetUnit(e.target.value)}
                                    placeholder="Unit"
                                    aria-label="Edit preset unit"
                                    className="h-8 px-2 rounded-lg border border-[#D8D2C5] text-xs focus:border-[#1B5E42] focus:outline-none min-w-0"
                                  />
                                </div>
                                <div className="flex items-center justify-between gap-2">
                                  <div className="inline-flex rounded-lg border border-[#E6E1D6] bg-[#FAF8F4] p-0.5">
                                    {(['Vegetable', 'Side'] as const).map((cat) => (
                                      <button
                                        key={cat}
                                        type="button"
                                        onClick={() => setEditPresetCat(cat)}
                                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer ${
                                          editPresetCat === cat
                                            ? 'bg-[#1B5E42] text-white'
                                            : 'text-[#5C6961]'
                                        }`}
                                      >
                                        {cat}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="submit"
                                      disabled={savingPresets || !editPresetName.trim()}
                                      className="h-7 px-2.5 rounded-lg bg-[#1B5E42] text-white text-[11px] font-semibold inline-flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                                    >
                                      <Check className="w-3 h-3" />
                                      Save
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setEditingPresetIndex(null)}
                                      className="h-7 px-2 rounded-lg border border-[#E6E1D6] text-[11px] font-semibold text-[#5C6961] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              </form>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-semibold text-[#1A241E] truncate">
                                    {preset.name}
                                  </span>
                                  <span className="text-[11px] text-[#5C6961] tabular-nums">
                                    ({preset.quantity}
                                    {preset.unit ? ` ${preset.unit}` : ''})
                                  </span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                      preset.category === 'Vegetable'
                                        ? 'bg-[#EBF4EF] text-[#1B5E42]'
                                        : 'bg-[#FDF3EB] text-[#B85D2B]'
                                    }`}
                                  >
                                    {preset.category === 'Vegetable' ? 'Veggie' : 'Side'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-0.5 shrink-0">
                                  <button
                                    type="button"
                                    disabled={savingPresets}
                                    aria-label={`Edit ${preset.name}`}
                                    onClick={() => startEditPreset(idx)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-[#FAF8F4] hover:text-[#1B5E42] cursor-pointer"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={savingPresets}
                                    aria-label={`Delete ${preset.name}`}
                                    onClick={() => void handleRemovePreset(idx)}
                                    className="w-7 h-7 rounded-lg flex items-center justify-center text-[#85918A] hover:bg-red-50 hover:text-red-600 cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add new quick-pick preset form */}
                  <form
                    onSubmit={(e) => void handleAddPreset(e)}
                    className="pt-1.5 border-t border-[#E6E1D6] space-y-2"
                  >
                    <div className="grid grid-cols-[1fr_54px_66px] gap-1.5">
                      <input
                        id="new-preset-name-input"
                        type="text"
                        placeholder="New one-tap veggie/side (e.g. Air-Fryer Edamame)"
                        value={newPresetName}
                        onChange={(e) => setNewPresetName(e.target.value)}
                        className="h-9 px-2.5 rounded-xl border border-[#D8D2C5] bg-white text-xs text-[#1A241E] focus:border-[#1B5E42] focus:outline-none min-w-0"
                      />
                      <input
                        type="number"
                        step="any"
                        min="0.25"
                        value={newPresetQty}
                        onChange={(e) => setNewPresetQty(e.target.value)}
                        aria-label="New preset default quantity"
                        className="h-9 px-1.5 rounded-xl border border-[#D8D2C5] bg-white text-xs text-center tabular-nums focus:border-[#1B5E42] focus:outline-none min-w-0"
                      />
                      <input
                        type="text"
                        placeholder="Unit"
                        value={newPresetUnit}
                        onChange={(e) => setNewPresetUnit(e.target.value)}
                        aria-label="New preset default unit"
                        className="h-9 px-2 rounded-xl border border-[#D8D2C5] bg-white text-xs focus:border-[#1B5E42] focus:outline-none min-w-0"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="inline-flex rounded-xl border border-[#E6E1D6] bg-white p-0.5">
                        {(['Vegetable', 'Side'] as const).map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setNewPresetCat(cat)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                              newPresetCat === cat
                                ? 'bg-[#1B5E42] text-white'
                                : 'text-[#5C6961] hover:text-[#1A241E]'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      <button
                        id="add-side-preset-btn"
                        type="submit"
                        disabled={savingPresets || !newPresetName.trim()}
                        className="h-8 px-3 rounded-xl bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-45 text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add Quick Pick
                      </button>
                    </div>
                  </form>
                </div>
              ) : sidePresets.length === 0 ? (
                <p className="text-xs text-[#85918A]">
                  No quick-pick buttons configured. Click <strong>Edit Quick Picks</strong> to add your favorites.
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {sidePresets.map((preset) => {
                    const active = hasSide(preset.name);
                    return (
                      <button
                        key={preset.name}
                        type="button"
                        data-testid={`quick-side-${preset.name}`}
                        onClick={() => togglePresetSide(preset)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                          active
                            ? 'bg-[#EBF4EF] text-[#1B5E42] border-[#1B5E42]'
                            : 'bg-[#FAF8F4] text-[#39453E] border-[#E6E1D6] hover:border-[#1B5E42]/50'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {preset.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Custom side form */}
            <form
              onSubmit={addCustomSide}
              className="grid grid-cols-[1fr_60px_76px_auto] gap-2 items-center pt-1"
            >
              <input
                id="custom-side-name-input"
                type="text"
                placeholder="Or add custom veggie/side..."
                value={customSideName}
                onChange={(e) => setCustomSideName(e.target.value)}
                className="h-9 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-xs text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
              />
              <input
                type="number"
                step="any"
                min="0.25"
                value={customSideQty}
                onChange={(e) => setCustomSideQty(e.target.value)}
                aria-label="Side quantity"
                className="h-9 px-2 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-xs text-center tabular-nums focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
              />
              <input
                type="text"
                placeholder="Unit"
                value={customSideUnit}
                onChange={(e) => setCustomSideUnit(e.target.value)}
                aria-label="Side unit"
                className="h-9 px-2 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-xs focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
              />
              <button
                id="add-custom-side-btn"
                type="submit"
                disabled={!customSideName.trim()}
                className="h-9 px-3 rounded-xl bg-[#EBF4EF] text-[#1B5E42] hover:bg-[#DCECE3] disabled:opacity-45 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add
              </button>
            </form>
          </div>

          <hr className="border-[#F0ECE3]" />

          {/* Section 2: Swap Common Ingredient Variants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-[#FDF3EB] text-[#B85D2B] flex items-center justify-center">
                  <ArrowLeftRight className="w-4 h-4" />
                </span>
                <h3 className="text-sm font-bold text-[#1A241E]">
                  Swap Ingredient Variants ({swapCount} active)
                </h3>
              </div>
              {swapCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSwaps({})}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#5C6961] hover:text-[#1A241E] cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  Reset swaps
                </button>
              )}
            </div>

            <div className="space-y-2.5">
              {meal.ingredients.map((ing, idx) => {
                const key = normalizeIngKey(ing.name);
                const swappedTo = swaps[key];
                const { categoryLabel, options } = getSuggestedVariantsForIngredient(ing.name);
                const isCustomEditing = editingIngKey === key;

                return (
                  <div
                    key={`${key}-${idx}`}
                    data-testid={`swap-row-${key}`}
                    className={`rounded-2xl border p-3 space-y-2 ${
                      swappedTo
                        ? 'border-[#F0CFAF] bg-[#FDF3EB]/60'
                        : 'border-[#E6E1D6] bg-[#FAF8F4]/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`text-xs sm:text-sm font-bold ${
                              swappedTo ? 'line-through text-[#85918A]' : 'text-[#1A241E]'
                            }`}
                          >
                            {ing.quantity}
                            {ing.unit ? ` ${ing.unit}` : ''} {ing.name}
                          </span>
                          {swappedTo && (
                            <span className="text-xs sm:text-sm font-bold text-[#8A421A]">
                              → {swappedTo}
                            </span>
                          )}
                          {categoryLabel && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white border border-[#E6E1D6] text-[#5C6961]">
                              {categoryLabel}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {swappedTo && (
                          <button
                            type="button"
                            onClick={() => applySwap(ing.name, '')}
                            className="h-7 px-2 rounded-lg text-[11px] font-semibold text-[#8A421A] hover:bg-white cursor-pointer"
                          >
                            Reset
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (isCustomEditing) {
                              setEditingIngKey(null);
                            } else {
                              setEditingIngKey(key);
                              setCustomSwapText(swappedTo || '');
                            }
                          }}
                          className="h-7 px-2.5 rounded-lg text-[11px] font-semibold bg-white border border-[#E6E1D6] text-[#5C6961] hover:text-[#1B5E42] hover:border-[#1B5E42] cursor-pointer"
                        >
                          {isCustomEditing ? 'Done' : 'Custom'}
                        </button>
                      </div>
                    </div>

                    {options.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {options.map((option) => {
                          const isCurrent =
                            (swappedTo && normalizeIngKey(swappedTo) === normalizeIngKey(option)) ||
                            (!swappedTo && normalizeIngKey(ing.name) === normalizeIngKey(option));
                          return (
                            <button
                              key={option}
                              type="button"
                              data-testid={`swap-option-${key}-${option}`}
                              onClick={() => applySwap(ing.name, option)}
                              className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                                isCurrent
                                  ? 'bg-[#1B5E42] text-white border-[#1B5E42]'
                                  : 'bg-white text-[#39453E] border-[#E6E1D6] hover:border-[#1B5E42]'
                              }`}
                            >
                              {option}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {isCustomEditing && (
                      <div className="flex gap-2 pt-1">
                        <input
                          type="text"
                          placeholder={`Swap "${ing.name}" with...`}
                          value={customSwapText}
                          onChange={(e) => setCustomSwapText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              applySwap(ing.name, customSwapText);
                              setEditingIngKey(null);
                            }
                          }}
                          className="flex-1 h-9 px-3 rounded-xl border border-[#D8D2C5] bg-white text-xs text-[#1A241E] focus:border-[#1B5E42] focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            applySwap(ing.name, customSwapText);
                            setEditingIngKey(null);
                          }}
                          className="h-9 px-3 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold cursor-pointer"
                        >
                          Apply
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-[#E6E1D6] bg-[#FAF8F4] flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setSides([]);
              setSwaps({});
            }}
            disabled={sides.length === 0 && swapCount === 0}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#5C6961] hover:text-red-600 disabled:opacity-35 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold text-[#5C6961] hover:bg-[#ECE7DC] cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="save-meal-customize-btn"
              type="button"
              disabled={saving}
              onClick={() => void handleSave()}
              className="h-10 px-5 rounded-xl text-xs sm:text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-60 shadow-xs cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save Customizations'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
