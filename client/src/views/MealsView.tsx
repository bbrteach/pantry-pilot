import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Check,
  Clock,
  Edit3,
  ExternalLink,
  Globe,
  Link2,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  Utensils,
  X,
} from 'lucide-react';
import type { Meal, MealIdea, MealIdeasFeedResponse, MealPayload } from '../types';
import { MealFormModal } from '../components/MealFormModal';
import { normalizeIngKey } from '../utils/variants';

interface MealsViewProps {
  meals: Meal[];
  mealIdeasFeed: MealIdeasFeedResponse | null;
  refreshingIdeas: boolean;
  onRefreshMealIdeas: () => Promise<void>;
  onSearchWebIdeas: (query: string) => Promise<MealIdea[]>;
  onImportRecipeUrl: (url: string) => Promise<MealIdea | null>;
  initialSubTab?: 'library' | 'ideas';
  onSubTabChange?: (subTab: 'library' | 'ideas') => void;
  onCreateMeal: (payload: MealPayload) => Promise<void>;
  onUpdateMeal: (id: number, payload: MealPayload) => Promise<void>;
  onDeleteMeal: (id: number) => Promise<void>;
  onAddMealIdea: (idea: MealIdea) => Promise<void>;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return 'Not refreshed yet';
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return '';
  const diffMs = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'Updated just now';
  if (mins < 60) return `Updated ${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `Updated ${days}d ago`;
}

export function MealsView({
  meals,
  mealIdeasFeed,
  refreshingIdeas,
  onRefreshMealIdeas,
  onSearchWebIdeas,
  onImportRecipeUrl,
  initialSubTab = 'library',
  onSubTabChange,
  onCreateMeal,
  onUpdateMeal,
  onDeleteMeal,
  onAddMealIdea,
}: MealsViewProps) {
  const [subTab, setSubTab] = useState<'library' | 'ideas'>(initialSubTab);
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('All');
  const [ideaSearch, setIdeaSearch] = useState('');
  const [selectedIdeaTag, setSelectedIdeaTag] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [hideAddedIdeas, setHideAddedIdeas] = useState(false);
  const [addingIdeaId, setAddingIdeaId] = useState<string | null>(null);
  const [searchingWeb, setSearchingWeb] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importingUrl, setImportingUrl] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const mealIdeas = mealIdeasFeed?.ideas ?? [];

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const handleSelectSubTab = (next: 'library' | 'ideas') => {
    setSubTab(next);
    onSubTabChange?.(next);
  };

  const libraryNameSet = useMemo(() => {
    const set = new Set<string>();
    for (const meal of meals) {
      set.add(normalizeIngKey(meal.name));
    }
    return set;
  }, [meals]);

  const ideasWithStatus = useMemo(
    () =>
      mealIdeas.map((idea) => ({
        ...idea,
        inLibrary: libraryNameSet.has(normalizeIngKey(idea.name)),
      })),
    [mealIdeas, libraryNameSet]
  );

  const availableIdeasCount = useMemo(
    () => ideasWithStatus.filter((idea) => !idea.inLibrary).length,
    [ideasWithStatus]
  );

  const liveIdeasCount = useMemo(
    () => ideasWithStatus.filter((idea) => idea.isLive).length,
    [ideasWithStatus]
  );

  const sourceOptions = useMemo(() => {
    const liveSources = new Set<string>();
    let hasCurated = false;
    for (const idea of mealIdeas) {
      if (idea.isLive && idea.sourceName) {
        liveSources.add(idea.sourceName);
      } else {
        hasCurated = true;
      }
    }
    const opts: string[] = ['All'];
    if (liveSources.size > 0) {
      opts.push('Live Web');
      for (const s of Array.from(liveSources).sort((a, b) => a.localeCompare(b))) {
        opts.push(s);
      }
    }
    if (hasCurated) {
      opts.push('Curated');
    }
    return opts;
  }, [mealIdeas]);

  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const meal of meals) {
      for (const tag of meal.tags) {
        tagSet.add(tag);
      }
    }
    return ['All', ...Array.from(tagSet).sort((a, b) => a.localeCompare(b))];
  }, [meals]);

  const allIdeaTags = useMemo(() => {
    const tagSet = new Set<string>();
    for (const idea of mealIdeas) {
      for (const tag of idea.tags) {
        tagSet.add(tag);
      }
    }
    return ['All', ...Array.from(tagSet).sort((a, b) => a.localeCompare(b))];
  }, [mealIdeas]);

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

  const filteredIdeas = useMemo(() => {
    const q = ideaSearch.trim().toLowerCase();
    return ideasWithStatus.filter((idea) => {
      if (hideAddedIdeas && idea.inLibrary) return false;

      if (selectedSource === 'Live Web' && !idea.isLive) return false;
      if (selectedSource === 'Curated' && idea.isLive) return false;
      if (
        selectedSource !== 'All' &&
        selectedSource !== 'Live Web' &&
        selectedSource !== 'Curated' &&
        idea.sourceName !== selectedSource
      ) {
        return false;
      }

      const matchesTag =
        selectedIdeaTag === 'All' ||
        idea.tags.some((t) => t.toLowerCase() === selectedIdeaTag.toLowerCase());
      if (!matchesTag) return false;

      if (!q) return true;
      return (
        idea.name.toLowerCase().includes(q) ||
        idea.notes.toLowerCase().includes(q) ||
        idea.prepTime.toLowerCase().includes(q) ||
        idea.sourceName.toLowerCase().includes(q) ||
        idea.tags.some((t) => t.toLowerCase().includes(q)) ||
        idea.ingredients.some(
          (i) =>
            i.name.toLowerCase().includes(q) ||
            (i.alternatives ?? []).some((alt) => alt.toLowerCase().includes(q))
        )
      );
    });
  }, [ideasWithStatus, hideAddedIdeas, selectedSource, ideaSearch, selectedIdeaTag]);

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

  const handleAddIdeaClick = async (idea: MealIdea) => {
    if (addingIdeaId) return;
    setAddingIdeaId(idea.id);
    try {
      await onAddMealIdea(idea);
    } finally {
      setAddingIdeaId(null);
    }
  };

  const handleWebSearchSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const q = ideaSearch.trim();
    if (q.length < 2 || searchingWeb) return;
    setSearchingWeb(true);
    try {
      setSelectedSource('All');
      setSelectedIdeaTag('All');
      await onSearchWebIdeas(q);
    } finally {
      setSearchingWeb(false);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = importUrl.trim();
    if (!trimmed || importingUrl) return;
    setImportingUrl(true);
    try {
      const imported = await onImportRecipeUrl(trimmed);
      if (imported) {
        setImportUrl('');
        setImportOpen(false);
        setSelectedSource('All');
        setSelectedIdeaTag('All');
        setIdeaSearch('');
      }
    } finally {
      setImportingUrl(false);
    }
  };

  return (
    <section className="space-y-5">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            {subTab === 'ideas' ? 'Meal Ideas' : 'Meal Library'}
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {subTab === 'ideas'
              ? liveIdeasCount > 0
                ? `${liveIdeasCount} live web recipes & ${availableIdeasCount} total ideas ready to add in one tap`
                : `${availableIdeasCount} fresh dinner ${availableIdeasCount === 1 ? 'idea' : 'ideas'} ready to add to your library in one tap`
              : `${meals.length} saved family ${meals.length === 1 ? 'meal' : 'meals'} ready for planning`}
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

      {/* Segmented Tab Switcher: Meal Library vs Meal Ideas */}
      <div
        role="tablist"
        aria-label="Meal sections"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-[#E6E1D6] max-w-md shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
      >
        <button
          id="meals-tab-library"
          type="button"
          role="tab"
          aria-selected={subTab === 'library'}
          onClick={() => handleSelectSubTab('library')}
          className={`flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            subTab === 'library'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <BookOpen className="w-4 h-4 shrink-0" />
          <span>Meal Library</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
              subTab === 'library' ? 'bg-white/20 text-white' : 'bg-[#EBF4EF] text-[#1B5E42]'
            }`}
          >
            {meals.length}
          </span>
        </button>

        <button
          id="meals-tab-ideas"
          type="button"
          role="tab"
          aria-selected={subTab === 'ideas'}
          onClick={() => handleSelectSubTab('ideas')}
          className={`flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            subTab === 'ideas'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Meal Ideas</span>
          {availableIdeasCount > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                subTab === 'ideas' ? 'bg-white/20 text-white' : 'bg-[#FDF3EB] text-[#B85D2B]'
              }`}
            >
              {availableIdeasCount}
            </span>
          )}
        </button>
      </div>

      {subTab === 'library' ? (
        <>
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
                Try clearing your search filter, add a custom meal, or browse Meal Ideas for instant inspiration.
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                {(search || selectedTag !== 'All') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setSelectedTag('All');
                    }}
                    className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#EBF4EF] text-[#1B5E42] hover:bg-[#DCECE3] transition-colors cursor-pointer"
                  >
                    Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleSelectSubTab('ideas')}
                  className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#FDF3EB] border border-[#F0CFAF] text-[#8A421A] hover:bg-[#F9E6D4] transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  Browse Meal Ideas
                </button>
              </div>
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
                            <span className="text-xs font-semibold text-red-700">
                              Delete this meal?
                            </span>
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
        </>
      ) : (
        /* Meal Ideas Tab */
        <div className="space-y-4">
          {/* Live Web Feed Status & Action Bar */}
          <div className="rounded-2xl bg-white border border-[#E6E1D6] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_1px_2px_rgba(26,36,30,0.03)]">
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-xl bg-[#EBF4EF] text-[#1B5E42] flex items-center justify-center shrink-0">
                <Globe className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-[#1A241E]">
                  {refreshingIdeas
                    ? 'Pulling fresh recipes from recipe websites...'
                    : liveIdeasCount > 0
                    ? `Live Recipes (${liveIdeasCount}) + Curated Classics`
                    : 'Live Recipe Discovery'}
                </p>
                <p className="text-xs text-[#5C6961] mt-0.5">
                  Auto-updates from Budget Bytes, Skinnytaste, Pinch of Yum, RecipeTin Eats,
                  Natasha&apos;s Kitchen &amp; TheMealDB
                  {mealIdeasFeed?.lastRefreshedAt
                    ? ` · ${formatRelativeTime(mealIdeasFeed.lastRefreshedAt)}`
                    : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                id="toggle-import-recipe-url-btn"
                type="button"
                onClick={() => setImportOpen((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  importOpen
                    ? 'bg-[#EBF4EF] border-[#C4DDD0] text-[#1B5E42]'
                    : 'bg-white border-[#E6E1D6] text-[#5C6961] hover:text-[#1A241E] hover:bg-[#FAF8F4]'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>Import URL</span>
              </button>
              <button
                id="refresh-meal-ideas-btn"
                type="button"
                disabled={refreshingIdeas}
                onClick={() => void onRefreshMealIdeas()}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-60 transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingIdeas ? 'animate-spin' : ''}`} />
                <span>{refreshingIdeas ? 'Refreshing...' : 'Refresh Ideas'}</span>
              </button>
            </div>
          </div>

          {/* Import Any Recipe URL Inline Form */}
          {importOpen && (
            <form
              onSubmit={handleImportSubmit}
              className="rounded-2xl bg-[#FAF8F4] border border-[#E6E1D6] p-3.5 space-y-2"
            >
              <label
                htmlFor="import-recipe-url-input"
                className="block text-xs font-bold text-[#1A241E]"
              >
                Paste any recipe link to extract ingredients automatically
              </label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="import-recipe-url-input"
                  type="url"
                  required
                  placeholder="https://www.budgetbytes.com/..."
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  className="flex-1 h-10 px-3 rounded-xl bg-white border border-[#D8D2C5] text-sm text-[#1A241E] placeholder:text-[#8A948D] focus:border-[#1B5E42] focus:outline-none"
                />
                <button
                  id="submit-import-recipe-url-btn"
                  type="submit"
                  disabled={importingUrl || !importUrl.trim()}
                  className="h-10 px-4 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold hover:bg-[#144A33] disabled:opacity-50 transition-colors shrink-0 cursor-pointer"
                >
                  {importingUrl ? 'Importing...' : 'Import Recipe'}
                </button>
              </div>
            </form>
          )}

          {/* Search (Instant Filter + Live Web Search) & Filters */}
          <div className="space-y-3">
            <form onSubmit={handleWebSearchSubmit} className="relative flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4.5 h-4.5 text-[#85918A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="meal-ideas-search-input"
                  type="search"
                  placeholder="Filter ideas or search live recipes (e.g. lasagna, curry, shrimp)..."
                  value={ideaSearch}
                  onChange={(e) => setIdeaSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-10 rounded-2xl bg-white border border-[#E6E1D6] text-sm text-[#1A241E] placeholder:text-[#8A948D] focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none transition-all shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
                />
                {ideaSearch && (
                  <button
                    type="button"
                    onClick={() => setIdeaSearch('')}
                    aria-label="Clear meal ideas search"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center text-[#85918A] hover:bg-[#F3EFE6] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {ideaSearch.trim().length >= 2 && (
                <button
                  id="search-web-ideas-btn"
                  type="submit"
                  disabled={searchingWeb}
                  className="inline-flex items-center gap-1.5 h-11 px-4 rounded-2xl bg-[#FDF3EB] border border-[#F0CFAF] text-[#8A421A] hover:bg-[#F9E6D4] disabled:opacity-60 text-xs sm:text-sm font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
                >
                  <Globe className={`w-4 h-4 ${searchingWeb ? 'animate-spin' : ''}`} />
                  <span>{searchingWeb ? 'Searching...' : 'Search Web'}</span>
                </button>
              )}
            </form>

            {/* Source filter pills */}
            {sourceOptions.length > 2 && (
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#85918A] mr-1 shrink-0">
                  Source
                </span>
                {sourceOptions.map((src) => {
                  const active = selectedSource === src;
                  return (
                    <button
                      key={src}
                      type="button"
                      data-testid={`idea-source-filter-${src}`}
                      onClick={() => setSelectedSource(src)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                        active
                          ? 'bg-[#1A241E] text-white border-[#1A241E]'
                          : 'bg-white text-[#5C6961] border-[#E6E1D6] hover:border-[#1A241E]/40 hover:text-[#1A241E]'
                      }`}
                    >
                      {src}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Tag filter pills + hide added toggle */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5 max-w-full">
                {allIdeaTags.map((tag) => {
                  const active = selectedIdeaTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      data-testid={`idea-tag-filter-${tag}`}
                      onClick={() => setSelectedIdeaTag(tag)}
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

              <button
                id="toggle-hide-added-ideas-btn"
                type="button"
                aria-pressed={hideAddedIdeas}
                onClick={() => setHideAddedIdeas((prev) => !prev)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all shrink-0 cursor-pointer ${
                  hideAddedIdeas
                    ? 'bg-[#EBF4EF] text-[#1B5E42] border-[#C4DDD0]'
                    : 'bg-white text-[#5C6961] border-[#E6E1D6] hover:text-[#1A241E]'
                }`}
              >
                <Check className={`w-3.5 h-3.5 ${hideAddedIdeas ? 'opacity-100' : 'opacity-40'}`} />
                <span>Hide already in library</span>
              </button>
            </div>
          </div>

          {filteredIdeas.length === 0 ? (
            <div className="rounded-3xl bg-white border border-[#E6E1D6] p-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-[#FDF3EB] text-[#B85D2B] mx-auto flex items-center justify-center mb-3">
                <Sparkles className="w-6 h-6" />
              </div>
              <h2 className="text-base font-bold text-[#1A241E]">
                {availableIdeasCount === 0 && hideAddedIdeas
                  ? 'All loaded meal ideas are in your library!'
                  : 'No matching meal ideas loaded yet'}
              </h2>
              <p className="text-sm text-[#5C6961] mt-1 max-w-sm mx-auto">
                {ideaSearch.trim().length >= 2
                  ? `Search online recipes for "${ideaSearch.trim()}" or clear your filters to browse all ideas.`
                  : 'Try refreshing for fresh web recipes or clearing your current filters.'}
              </p>
              <div className="mt-4 flex items-center justify-center gap-2 flex-wrap">
                {ideaSearch.trim().length >= 2 && (
                  <button
                    type="button"
                    disabled={searchingWeb}
                    onClick={() => void handleWebSearchSubmit()}
                    className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Globe className="w-4 h-4" />
                    Search Web for &ldquo;{ideaSearch.trim()}&rdquo;
                  </button>
                )}
                {(ideaSearch ||
                  selectedIdeaTag !== 'All' ||
                  selectedSource !== 'All' ||
                  hideAddedIdeas) && (
                  <button
                    type="button"
                    onClick={() => {
                      setIdeaSearch('');
                      setSelectedIdeaTag('All');
                      setSelectedSource('All');
                      setHideAddedIdeas(false);
                    }}
                    className="h-10 px-4 rounded-xl text-sm font-semibold bg-[#EBF4EF] text-[#1B5E42] hover:bg-[#DCECE3] transition-colors cursor-pointer"
                  >
                    Show All Ideas
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredIdeas.map((idea) => {
                const isAdding = addingIdeaId === idea.id;
                return (
                  <article
                    key={idea.id}
                    data-testid={`meal-idea-card-${idea.id}`}
                    className={`rounded-2xl border overflow-hidden flex flex-col justify-between transition-all ${
                      idea.inLibrary
                        ? 'bg-[#FCFDFC] border-[#C4DDD0] shadow-[0_1px_2px_rgba(27,94,66,0.05)]'
                        : 'bg-white border-[#E6E1D6] shadow-[0_1px_3px_rgba(26,36,30,0.04)] hover:border-[#C4DDD0] hover:shadow-[0_6px_20px_rgba(26,36,30,0.06)]'
                    }`}
                  >
                    {idea.imageUrl && (
                      <div className="relative w-full h-40 bg-[#FAF8F4] border-b border-[#F1EDE4] overflow-hidden">
                        <img
                          src={idea.imageUrl}
                          alt={idea.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#1A241E]/80 text-white backdrop-blur-xs shadow-xs">
                            <Globe className="w-3 h-3" />
                            {idea.sourceName}
                          </span>
                          {idea.sourceUrl && (
                            <a
                              href={idea.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              aria-label={`View original ${idea.name} recipe on ${idea.sourceName}`}
                              title={`Open original recipe on ${idea.sourceName}`}
                              className="w-7 h-7 rounded-full bg-white/90 text-[#1A241E] hover:bg-white flex items-center justify-center shadow-xs transition-colors"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="p-4 flex flex-col justify-between flex-1">
                      <div>
                        {!idea.imageUrl && (
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-bold bg-[#F5F2EB] text-[#5C6961]">
                              {idea.isLive ? (
                                <Globe className="w-2.5 h-2.5" />
                              ) : (
                                <Sparkles className="w-2.5 h-2.5" />
                              )}
                              {idea.sourceName || 'Curated'}
                            </span>
                            {idea.sourceUrl && (
                              <a
                                href={idea.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1B5E42] hover:underline"
                              >
                                Recipe
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}

                        <div className="flex items-start justify-between gap-2">
                          <h2 className="text-base font-bold text-[#1A241E] leading-snug">
                            {idea.name}
                          </h2>
                          {idea.prepTime && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#FAF8F4] border border-[#E6E1D6] text-[#5C6961] whitespace-nowrap shrink-0">
                              <Clock className="w-3 h-3" />
                              {idea.prepTime}
                            </span>
                          )}
                        </div>

                        {idea.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {idea.tags.map((tag) => (
                              <span
                                key={tag}
                                className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#EBF4EF] text-[#1B5E42]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {idea.notes && (
                          <p className="text-xs text-[#5C6961] mt-2.5 leading-relaxed line-clamp-2">
                            {idea.notes}
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-[#F1EDE4]">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#85918A] mb-1.5">
                          Ingredients ({idea.ingredients.length})
                        </p>
                        <ul className="flex flex-wrap gap-1.5">
                          {idea.ingredients.slice(0, 6).map((ing, idx) => {
                            const altCount = ing.alternatives?.length ?? 0;
                            return (
                              <li
                                key={`${idea.id}-${ing.name}-${idx}`}
                                title={
                                  altCount > 0
                                    ? `Includes swappable variants: ${ing.alternatives!.join(', ')}`
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
                          {idea.ingredients.length > 6 && (
                            <li className="text-xs text-[#5C6961] px-1.5 py-0.5 font-medium">
                              +{idea.ingredients.length - 6} more
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>

                    {/* Instant Add to Library Footer */}
                    <div
                      className={`px-4 py-3 border-t flex items-center justify-between gap-2 ${
                        idea.inLibrary
                          ? 'bg-[#EBF4EF]/70 border-[#D5E6DC]'
                          : 'bg-[#FAF8F4] border-[#F1EDE4]'
                      }`}
                    >
                      {idea.inLibrary ? (
                        <>
                          <span
                            data-testid={`meal-idea-added-badge-${idea.id}`}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#1B5E42]"
                          >
                            <Check className="w-4 h-4 stroke-[2.75]" />
                            In Your Meal Library
                          </span>
                          <button
                            type="button"
                            onClick={() => handleSelectSubTab('library')}
                            className="text-xs font-semibold text-[#1B5E42] hover:underline cursor-pointer"
                          >
                            View Library
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={isAdding}
                          data-testid={`add-meal-idea-${idea.id}`}
                          onClick={() => void handleAddIdeaClick(idea)}
                          className="w-full h-9 px-3.5 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold hover:bg-[#144A33] active:scale-[0.98] disabled:opacity-60 transition-all inline-flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Plus className="w-4 h-4 stroke-[2.5]" />
                          <span>{isAdding ? 'Adding...' : 'Add to Meal Library'}</span>
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
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
