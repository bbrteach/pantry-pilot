import { useMemo, useState } from 'react';
import { ArrowLeftRight, Edit3, Plus, Search, Trash2, Utensils, X } from 'lucide-react';
import type { Meal, MealPayload } from '../types';
import { MealFormModal } from '../components/MealFormModal';

interface MealsViewProps {
  meals: Meal[];
  onCreateMeal: (payload: MealPayload) => Promise<void>;
  onUpdateMeal: (id: number, payload: MealPayload) => Promise<void>;
  onDeleteMeal: (id: number) => Promise<void>;
}

export function MealsView({
  meals,
  onCreateMeal,
  onUpdateMeal,
  onDeleteMeal,
}: MealsViewProps) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const meal of meals) {
      for (const tag of meal.tags) {
        tagSet.add(tag);
      }
    }
    return ['All', ...Array.from(tagSet).sort((a, b) => a.localeCompare(b))];
  }, [meals]);

  const filteredMeals = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meals.filter((meal) => {
      const matchesTag =
        selectedTag === 'All' ||
        meal.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase());
      if (!matchesTag) return false;
      if (!q) return true;
      return (
        meal.name.toLowerCase().includes(q) ||
        meal.notes.toLowerCase().includes(q) ||
        meal.tags.some((t) => t.toLowerCase().includes(q)) ||
        meal.ingredients.some(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.alternatives ?? []).some((alt) => alt.toLowerCase().includes(q))
        )
      );
    });
  }, [meals, search, selectedTag]);

  const openCreate = () => {
    setEditingMeal(null);
    setModalOpen(true);
  };

  const openEdit = (meal: Meal) => {
    setEditingMeal(meal);
    setModalOpen(true);
  };

  const handleSave = async (payload: MealPayload) => {
    if (editingMeal) {
      await onUpdateMeal(editingMeal.id, payload);
    } else {
      await onCreateMeal(payload);
    }
  };

  return (
    <section className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            Meal Library
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {meals.length} saved family {meals.length === 1 ? 'meal' : 'meals'} ready for planning
          </p>
        </div>
        <button
          id="add-meal-btn"
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-1.5 h-11 px-4 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] active:scale-[0.98] transition-all shadow-xs shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Meal</span>
        </button>
      </div>

      {/* Search & Tag Filters */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4.5 h-4.5 text-[#85918A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="meals-search-input"
            type="search"
            placeholder="Search meals, notes, or ingredients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white border border-[#E6E1D6] text-sm text-[#1A241E] placeholder:text-[#8A948D] focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none transition-all shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#85918A] hover:bg-[#F3EFE6] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {allTags.map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                data-testid={`meal-tag-filter-${tag}`}
                onClick={() => setSelectedTag(tag)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                  active
                    ? 'bg-[#1B5E42] text-white border-[#1B5E42] shadow-xs'
                    : 'bg-white text-[#5C6961] border-[#E6E1D6] hover:border-[#1B5E42]/40 hover:text-[#1A241E]'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>

      {/* Meal cards */}
      {filteredMeals.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#E6E1D6] p-10 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#EBF4EF] text-[#1B5E42] mx-auto flex items-center justify-center mb-3">
            <Utensils className="w-6 h-6" />
          </div>
          <h2 className="text-base font-bold text-[#1A241E]">No matching meals</h2>
          <p className="text-sm text-[#5C6961] mt-1 max-w-xs mx-auto">
            Try clearing your search filter or add a new meal to your family rotation.
          </p>
          {(search || selectedTag !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedTag('All');
              }}
              className="mt-4 h-10 px-4 rounded-xl text-sm font-semibold bg-[#EBF4EF] text-[#1B5E42] hover:bg-[#DCECE3] transition-colors cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMeals.map((meal) => {
            const confirmingDelete = confirmDeleteId === meal.id;
            return (
              <article
                key={meal.id}
                data-testid={`meal-card-${meal.id}`}
                className="bg-white rounded-2xl border border-[#E6E1D6] overflow-hidden flex flex-col justify-between shadow-[0_1px_3px_rgba(26,36,30,0.04)] hover:border-[#C4DDD0] hover:shadow-[0_6px_20px_rgba(26,36,30,0.06)] transition-all"
              >
                {meal.imageUrl && (
                  <div className="w-full h-40 bg-[#FAF8F4] border-b border-[#F1EDE4] overflow-hidden">
                    <img
                      src={meal.imageUrl}
                      alt={meal.name}
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4 flex flex-col justify-between flex-1">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-base font-bold text-[#1A241E] leading-snug">
                      {meal.name}
                    </h2>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        aria-label={`Edit ${meal.name}`}
                        data-testid={`edit-meal-${meal.id}`}
                        onClick={() => openEdit(meal)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Delete ${meal.name}`}
                        data-testid={`delete-meal-${meal.id}`}
                        onClick={() =>
                          setConfirmDeleteId(confirmingDelete ? null : meal.id)
                        }
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {confirmingDelete && (
                    <div className="mt-2.5 p-2.5 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-red-700">Delete this meal?</span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold text-[#5C6961] bg-white border border-[#E6E1D6] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          data-testid={`confirm-delete-meal-${meal.id}`}
                          onClick={async () => {
                            await onDeleteMeal(meal.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-600 text-white hover:bg-red-700 cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {meal.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {meal.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF4EF] text-[#1B5E42]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {meal.notes && (
                    <p className="text-xs text-[#5C6961] mt-2.5 leading-relaxed line-clamp-2">
                      {meal.notes}
                    </p>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-[#F1EDE4]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#85918A] mb-1.5">
                    Ingredients ({meal.ingredients.length})
                  </p>
                  <ul className="flex flex-wrap gap-1.5">
                    {meal.ingredients.slice(0, 6).map((ing, idx) => {
                      const altCount = ing.alternatives?.length ?? 0;
                      return (
                        <li
                          key={`${meal.id}-${ing.name}-${idx}`}
                          title={
                            altCount > 0
                              ? `Swappable variants: ${ing.alternatives!.join(', ')}`
                              : undefined
                          }
                          className="inline-flex items-center gap-1 text-xs bg-[#FAF8F4] border border-[#ECE7DC] text-[#39453E] px-2 py-0.5 rounded-lg"
                        >
                          <span className="font-semibold tabular-nums">
                            {ing.quantity}
                            {ing.unit ? ` ${ing.unit}` : ''}
                          </span>{' '}
                          <span>{ing.name}</span>
                          {altCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 px-1 py-0.2 rounded bg-[#FDF3EB] border border-[#F0CFAF] text-[10px] font-bold text-[#8A421A] tabular-nums">
                              <ArrowLeftRight className="w-2.5 h-2.5" />
                              {altCount}
                            </span>
                          )}
                        </li>
                      );
                    })}
                    {meal.ingredients.length > 6 && (
                      <li className="text-xs text-[#5C6961] px-1.5 py-0.5 font-medium">
                        +{meal.ingredients.length - 6} more
                      </li>
                    )}
                  </ul>
                </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <MealFormModal
        isOpen={modalOpen}
        initialMeal={editingMeal}
        onClose={() => setModalOpen(false)}
        onSubmit={handleSave}
      />
    </section>
  );
}
