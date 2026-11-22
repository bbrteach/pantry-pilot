import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Link2, Plus, Trash2, X } from 'lucide-react';
import type { Meal, MealPayload } from '../types';
import { api } from '../api/client';
import { compressImageFile } from '../utils/image';

const SUGGESTED_TAGS = [
  'Quick',
  'Crockpot',
  'Family Favorite',
  'Healthy',
  'Vegetarian',
  'Sheet Pan',
  'Budget',
  'Grill',
];

const COMMON_UNITS = ['', 'lb', 'oz', 'cup', 'tbsp', 'tsp', 'whole', 'clove', 'can', 'jar', 'bag', 'box', 'pack', 'bottle', 'bunch', 'loaf'];

interface IngredientRow {
  key: string;
  name: string;
  quantity: string;
  unit: string;
}

interface MealFormModalProps {
  isOpen: boolean;
  initialMeal: Meal | null;
  onClose: () => void;
  onSubmit: (payload: MealPayload) => Promise<void>;
}

function makeRow(name = '', quantity = '1', unit = ''): IngredientRow {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    quantity,
    unit,
  };
}

export function MealFormModal({ isOpen, initialMeal, onClose, onSubmit }: MealFormModalProps) {
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [customTag, setCustomTag] = useState('');
  const [ingredients, setIngredients] = useState<IngredientRow[]>([makeRow()]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setCustomTag('');
    setShowUrlInput(false);
    setUploadingPhoto(false);
    if (initialMeal) {
      setName(initialMeal.name);
      setNotes(initialMeal.notes);
      setTags(initialMeal.tags);
      setImageUrl(initialMeal.imageUrl || '');
      setIngredients(
        initialMeal.ingredients.length > 0
          ? initialMeal.ingredients.map((ing) =>
              makeRow(ing.name, String(ing.quantity), ing.unit)
            )
          : [makeRow()]
      );
    } else {
      setName('');
      setNotes('');
      setTags([]);
      setImageUrl('');
      setIngredients([makeRow()]);
    }
  }, [isOpen, initialMeal]);

  if (!isOpen) return null;

  const handlePhotoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setError(null);
    setUploadingPhoto(true);
    try {
      const compressedDataUrl = await compressImageFile(file);
      const uploaded = await api.uploadMealPhoto(compressedDataUrl);
      setImageUrl(uploaded.imageUrl);
      setShowUrlInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const toggleTag = (tag: string) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const addCustomTag = () => {
    const trimmed = customTag.trim();
    if (!trimmed) return;
    if (!tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
      setTags((prev) => [...prev, trimmed]);
    }
    setCustomTag('');
  };

  const updateIngredient = (key: string, field: keyof IngredientRow, value: string) => {
    setIngredients((prev) =>
      prev.map((row) => (row.key === key ? { ...row, [field]: value } : row))
    );
  };

  const addIngredientRow = () => {
    setIngredients((prev) => [...prev, makeRow()]);
  };

  const removeIngredientRow = (key: string) => {
    setIngredients((prev) => (prev.length > 1 ? prev.filter((r) => r.key !== key) : prev));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a meal name.');
      return;
    }

    const parsedIngredients = ingredients
      .map((row) => ({
        name: row.name.trim(),
        quantity: Number(row.quantity),
        unit: row.unit.trim(),
      }))
      .filter((row) => row.name.length > 0);

    if (parsedIngredients.length === 0) {
      setError('Add at least one ingredient with a name.');
      return;
    }

    const invalidQty = parsedIngredients.find((i) => !Number.isFinite(i.quantity) || i.quantity <= 0);
    if (invalidQty) {
      setError(`Quantity for "${invalidQty.name}" must be a positive number.`);
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmedName,
        notes: notes.trim(),
        tags,
        imageUrl: imageUrl.trim(),
        ingredients: parsedIngredients,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save meal.');
    } finally {
      setSubmitting(false);
    }
  };

  const allTagChoices = Array.from(new Set([...SUGGESTED_TAGS, ...tags]));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A241E]/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="meal-modal-title"
    >
      <div className="bg-white w-full sm:max-w-xl max-h-[92vh] sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl border border-[#E6E1D6] shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6E1D6]">
          <h2 id="meal-modal-title" className="font-display text-xl font-bold text-[#1A241E]">
            {initialMeal ? 'Edit Meal' : 'Add New Meal'}
          </h2>
          <button
            type="button"
            id="close-meal-modal-btn"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#5C6961] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          {/* Meal Photo Uploader */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-sm font-semibold text-[#1A241E]">
                Meal Photo <span className="font-normal text-[#5C6961]">(optional)</span>
              </span>
              <button
                type="button"
                onClick={() => setShowUrlInput((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#5C6961] hover:text-[#1B5E42] cursor-pointer"
              >
                <Link2 className="w-3.5 h-3.5" />
                {showUrlInput ? 'Hide URL' : 'Paste URL'}
              </button>
            </div>

            <input
              ref={fileInputRef}
              id="meal-photo-file-input"
              type="file"
              accept="image/*"
              onChange={handlePhotoFileChange}
              className="hidden"
            />

            {imageUrl ? (
              <div className="relative rounded-2xl overflow-hidden border border-[#E6E1D6] bg-[#FAF8F4]">
                <img
                  src={imageUrl}
                  alt={name || 'Meal preview'}
                  className="w-full h-44 object-cover"
                />
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={uploadingPhoto}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl bg-[#1A241E]/80 text-white text-xs font-semibold backdrop-blur-xs hover:bg-[#1A241E] transition-colors cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    Change
                  </button>
                  <button
                    type="button"
                    id="remove-meal-photo-btn"
                    onClick={() => setImageUrl('')}
                    className="inline-flex items-center gap-1 h-8 px-2.5 rounded-xl bg-red-600/90 text-white text-xs font-semibold backdrop-blur-xs hover:bg-red-700 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                id="upload-meal-photo-btn"
                disabled={uploadingPhoto}
                onClick={() => fileInputRef.current?.click()}
                className="w-full rounded-2xl border-2 border-dashed border-[#D8D2C5] bg-[#FAF8F4] hover:border-[#1B5E42] hover:bg-[#EBF4EF]/50 py-5 px-4 flex flex-col items-center justify-center gap-1.5 text-center transition-colors cursor-pointer"
              >
                <span className="w-10 h-10 rounded-xl bg-white border border-[#E6E1D6] text-[#1B5E42] flex items-center justify-center shadow-2xs">
                  <ImagePlus className="w-5 h-5" />
                </span>
                <span className="text-sm font-semibold text-[#1A241E]">
                  {uploadingPhoto ? 'Optimizing & uploading photo...' : 'Take or upload a photo'}
                </span>
                <span className="text-xs text-[#5C6961]">
                  JPEG, PNG, or WebP · automatically resized for fast loading
                </span>
              </button>
            )}

            {showUrlInput && (
              <input
                id="meal-photo-url-input"
                type="url"
                placeholder="https://example.com/meal-photo.jpg"
                value={imageUrl.startsWith('/api/uploads/') ? '' : imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                className="mt-2 w-full h-10 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-xs text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none"
              />
            )}
          </div>

          <div>
            <label htmlFor="meal-name-input" className="block text-sm font-semibold text-[#1A241E] mb-1.5">
              Meal Name
            </label>
            <input
              id="meal-name-input"
              type="text"
              required
              placeholder="e.g., Turkey Enchilada Skillet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-[#1A241E] placeholder:text-[#8A948D] focus:bg-white focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none transition-all"
            />
          </div>

          <div>
            <label htmlFor="meal-notes-input" className="block text-sm font-semibold text-[#1A241E] mb-1.5">
              Notes <span className="font-normal text-[#5C6961]">(optional)</span>
            </label>
            <textarea
              id="meal-notes-input"
              rows={2}
              placeholder="Prep tips, cook time, or serving notes..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] placeholder:text-[#8A948D] focus:bg-white focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none transition-all resize-none"
            />
          </div>

          <div>
            <span className="block text-sm font-semibold text-[#1A241E] mb-2">Tags</span>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {allTagChoices.map((tag) => {
                const active = tags.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer ${
                      active
                        ? 'bg-[#1B5E42] text-white border-[#1B5E42]'
                        : 'bg-[#FAF8F4] text-[#5C6961] border-[#E6E1D6] hover:border-[#1B5E42]/40'
                    }`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <input
                id="meal-custom-tag-input"
                type="text"
                placeholder="Add custom tag..."
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCustomTag();
                  }
                }}
                className="flex-1 h-9 px-3 rounded-lg border border-[#D8D2C5] bg-[#FAF8F4] text-xs text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none"
              />
              <button
                type="button"
                id="add-custom-tag-btn"
                onClick={addCustomTag}
                className="px-3 h-9 rounded-lg text-xs font-semibold bg-[#EBF4EF] text-[#1B5E42] hover:bg-[#DCECE3] transition-colors cursor-pointer"
              >
                Add Tag
              </button>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-[#1A241E]">
                Ingredients ({ingredients.length})
              </span>
              <button
                type="button"
                id="add-ingredient-row-btn"
                onClick={addIngredientRow}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1B5E42] hover:text-[#144A33] px-2.5 py-1.5 rounded-lg bg-[#EBF4EF] hover:bg-[#DCECE3] transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Ingredient
              </button>
            </div>

            <div className="space-y-2.5">
              {ingredients.map((row, idx) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[1fr_72px_84px_36px] gap-2 items-center"
                >
                  <input
                    id={`ingredient-name-${idx}`}
                    type="text"
                    placeholder="Ingredient name"
                    value={row.name}
                    onChange={(e) => updateIngredient(row.key, 'name', e.target.value)}
                    className="h-10 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
                  />
                  <input
                    id={`ingredient-qty-${idx}`}
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="Qty"
                    value={row.quantity}
                    onChange={(e) => updateIngredient(row.key, 'quantity', e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] tabular-nums focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
                  />
                  <input
                    id={`ingredient-unit-${idx}`}
                    type="text"
                    list="common-units-list"
                    placeholder="Unit"
                    value={row.unit}
                    onChange={(e) => updateIngredient(row.key, 'unit', e.target.value)}
                    className="h-10 px-2.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => removeIngredientRow(row.key)}
                    disabled={ingredients.length === 1}
                    aria-label="Remove ingredient row"
                    className="h-10 w-9 rounded-xl flex items-center justify-center text-[#85918A] hover:text-red-600 hover:bg-red-50 disabled:opacity-30 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <datalist id="common-units-list">
                {COMMON_UNITS.filter(Boolean).map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="pt-2 pb-1 flex items-center justify-end gap-2.5 border-t border-[#E6E1D6]">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl text-sm font-semibold text-[#5C6961] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="save-meal-submit-btn"
              type="submit"
              disabled={submitting}
              className="h-11 px-5 rounded-xl text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-60 transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? 'Saving...' : initialMeal ? 'Save Changes' : 'Create Meal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
