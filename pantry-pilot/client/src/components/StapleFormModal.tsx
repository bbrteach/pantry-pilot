import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Staple, StaplePayload } from '../types';

interface StapleFormModalProps {
  isOpen: boolean;
  initialStaple: Staple | null;
  onClose: () => void;
  onSubmit: (payload: StaplePayload) => Promise<void>;
}

export function StapleFormModal({
  isOpen,
  initialStaple,
  onClose,
  onSubmit,
}: StapleFormModalProps) {
  const [name, setName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('');
  const [autoInclude, setAutoInclude] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    if (initialStaple) {
      setName(initialStaple.name);
      setQuantity(String(initialStaple.quantity));
      setUnit(initialStaple.unit);
      setAutoInclude(initialStaple.autoInclude);
    } else {
      setName('');
      setQuantity('1');
      setUnit('');
      setAutoInclude(true);
    }
  }, [isOpen, initialStaple]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Staple name is required.');
      return;
    }

    const parsedQty = Number(quantity);
    if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
      setError('Quantity must be a positive number.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        name: trimmed,
        quantity: parsedQty,
        unit: unit.trim(),
        autoInclude,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save staple.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#1A241E]/45 backdrop-blur-[2px] p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="staple-modal-title"
    >
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-[#E6E1D6] shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E6E1D6]">
          <h2 id="staple-modal-title" className="font-display text-xl font-bold text-[#1A241E]">
            {initialStaple ? 'Edit Staple' : 'Add Recurring Staple'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="w-9 h-9 rounded-full flex items-center justify-center text-[#5C6961] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="staple-name-input" className="block text-sm font-semibold text-[#1A241E] mb-1.5">
              Item Name
            </label>
            <input
              id="staple-name-input"
              type="text"
              required
              placeholder="e.g., Almond Milk, Greek Yogurt"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="staple-qty-input" className="block text-sm font-semibold text-[#1A241E] mb-1.5">
                Default Qty
              </label>
              <input
                id="staple-qty-input"
                type="number"
                step="any"
                min="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-[#1A241E] tabular-nums focus:bg-white focus:border-[#1B5E42] focus:outline-none"
              />
            </div>
            <div>
              <label htmlFor="staple-unit-input" className="block text-sm font-semibold text-[#1A241E] mb-1.5">
                Unit
              </label>
              <input
                id="staple-unit-input"
                type="text"
                placeholder="gallon, pack, dozen..."
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-[#1A241E] focus:bg-white focus:border-[#1B5E42] focus:outline-none"
              />
            </div>
          </div>

          <label className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF8F4] border border-[#E6E1D6] cursor-pointer">
            <div>
              <span className="block text-sm font-semibold text-[#1A241E]">
                Auto-include on new lists
              </span>
              <span className="block text-xs text-[#5C6961]">
                Automatically added whenever you generate a grocery list
              </span>
            </div>
            <input
              id="staple-auto-include-checkbox"
              type="checkbox"
              checked={autoInclude}
              onChange={(e) => setAutoInclude(e.target.checked)}
              className="w-5 h-5 accent-[#1B5E42] rounded cursor-pointer"
            />
          </label>

          <div className="pt-2 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="h-11 px-4 rounded-xl text-sm font-semibold text-[#5C6961] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="save-staple-submit-btn"
              type="submit"
              disabled={submitting}
              className="h-11 px-5 rounded-xl text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-60 transition-colors shadow-xs cursor-pointer"
            >
              {submitting ? 'Saving...' : initialStaple ? 'Save Changes' : 'Add Staple'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
