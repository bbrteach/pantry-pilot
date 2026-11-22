import { useState } from 'react';
import { Edit3, PackageCheck, Plus, Trash2 } from 'lucide-react';
import type { Staple, StaplePayload } from '../types';
import { StapleFormModal } from '../components/StapleFormModal';

interface StaplesViewProps {
  staples: Staple[];
  onCreateStaple: (payload: StaplePayload) => Promise<void>;
  onUpdateStaple: (id: number, payload: Partial<StaplePayload>) => Promise<void>;
  onDeleteStaple: (id: number) => Promise<void>;
}

export function StaplesView({
  staples,
  onCreateStaple,
  onUpdateStaple,
  onDeleteStaple,
}: StaplesViewProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStaple, setEditingStaple] = useState<Staple | null>(null);

  const autoCount = staples.filter((s) => s.autoInclude).length;

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

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            Recurring Staples
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {autoCount} of {staples.length} household essentials auto-included on every new grocery list
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
        <div className="bg-white rounded-3xl border border-[#E6E1D6] divide-y divide-[#F0ECE3] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
          {staples.map((staple) => (
            <div
              key={staple.id}
              data-testid={`staple-row-${staple.id}`}
              className="p-4 flex items-center justify-between gap-3 hover:bg-[#FCFBF8] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-sm sm:text-base font-bold text-[#1A241E] truncate">
                    {staple.name}
                  </h2>
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-semibold bg-[#FAF8F4] border border-[#E6E1D6] text-[#39453E] tabular-nums">
                    {staple.quantity}
                    {staple.unit ? ` ${staple.unit}` : ''}
                  </span>
                </div>
                <p className="text-xs text-[#5C6961] mt-0.5">
                  {staple.autoInclude
                    ? 'Auto-included on new grocery lists'
                    : 'Saved only — not auto-included'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
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
