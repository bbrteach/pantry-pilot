import { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  CalendarDays,
  Check,
  ChefHat,
  ListChecks,
  RotateCcw,
  Salad,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Utensils,
  X,
} from 'lucide-react';
import type {
  Meal,
  MealCustomization,
  MealSideItem,
  QuickSidePreset,
  ScheduleEntryType,
  ScheduleSlot,
} from '../types';
import { MealCustomizeModal } from '../components/MealCustomizeModal';

const DAYS = [
  { index: 0, short: 'Su', full: 'Sunday' },
  { index: 1, short: 'M', full: 'Monday' },
  { index: 2, short: 'T', full: 'Tuesday' },
  { index: 3, short: 'W', full: 'Wednesday' },
  { index: 4, short: 'Th', full: 'Thursday' },
  { index: 5, short: 'F', full: 'Friday' },
  { index: 6, short: 'Sa', full: 'Saturday' },
] as const;

interface PlannerViewProps {
  meals: Meal[];
  selectedMealIds: number[];
  customizations: Record<number, MealCustomization>;
  sidePresets: QuickSidePreset[];
  scheduleSlots: ScheduleSlot[];
  autoStaplesCount: number;
  generating: boolean;
  onToggleMeal: (mealId: number) => void;
  onSaveMealCustomization: (
    mealId: number,
    payload: { sides: MealSideItem[]; swaps: Record<string, string> }
  ) => Promise<void>;
  onSaveSidePresets: (presets: QuickSidePreset[]) => Promise<void>;
  onResetSidePresets: () => Promise<void>;
  onAssignMealDay: (mealId: number, dayOfWeek: number) => Promise<void>;
  onSetScheduleSlot: (
    weekNumber: 1 | 2,
    dayOfWeek: number,
    entryType: ScheduleEntryType,
    mealId?: number | null
  ) => Promise<void>;
  onClearScheduleSlot: (weekNumber: 1 | 2, dayOfWeek: number) => Promise<void>;
  onClearSchedule: () => Promise<void>;
  onClearPlan: () => void;
  onGenerateGroceryList: () => Promise<void>;
  onOpenKrogerDeals: () => void;
}

export function PlannerView({
  meals,
  selectedMealIds,
  customizations,
  sidePresets,
  scheduleSlots,
  autoStaplesCount,
  generating,
  onToggleMeal,
  onSaveMealCustomization,
  onSaveSidePresets,
  onResetSidePresets,
  onAssignMealDay,
  onSetScheduleSlot,
  onClearScheduleSlot,
  onClearSchedule,
  onClearPlan,
  onGenerateGroceryList,
  onOpenKrogerDeals,
}: PlannerViewProps) {
  const [subView, setSubView] = useState<'select' | 'schedule'>('select');
  const [selectedTag, setSelectedTag] = useState('All');
  const [customizingMeal, setCustomizingMeal] = useState<Meal | null>(null);

  const selectedSet = useMemo(() => new Set(selectedMealIds), [selectedMealIds]);
  const mealById = useMemo(() => new Map(meals.map((m) => [m.id, m])), [meals]);

  const slotMap = useMemo(() => {
    const map = new Map<string, ScheduleSlot>();
    for (const slot of scheduleSlots) {
      map.set(`${slot.weekNumber}-${slot.dayOfWeek}`, slot);
    }
    return map;
  }, [scheduleSlots]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const meal of meals) {
      meal.tags.forEach((t) => set.add(t));
    }
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [meals]);

  const visibleMeals = useMemo(() => {
    if (selectedTag === 'All') return meals;
    return meals.filter((m) =>
      m.tags.some((t) => t.toLowerCase() === selectedTag.toLowerCase())
    );
  }, [meals, selectedTag]);

  const count = selectedMealIds.length;
  const scheduledDaysCount = scheduleSlots.length;

  const rangeLabel =
    subView === 'schedule'
      ? `${scheduledDaysCount} of 14 days planned across Week 1 & Week 2`
      : count === 0
      ? 'Tap meals or weekday pills (Su–Sa) to plan 1–2 weeks'
      : `${count} meals selected · ${scheduledDaysCount} days scheduled`;

  return (
    <section className="space-y-5 pb-24 md:pb-20">
      {/* Header + Sub-view Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            {subView === 'schedule' ? '2-Week Meal Schedule' : 'Meal Planner'}
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">{rangeLabel}</p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            id="plan-open-deals-btn"
            type="button"
            onClick={onOpenKrogerDeals}
            className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-semibold bg-[#FDF3EB] border border-[#F0CFAF] text-[#8A421A] hover:bg-[#F9E8D8] transition-colors cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5" />
            <span>Kroger Sales</span>
          </button>

          {subView === 'select' && count > 0 && (
            <button
              id="clear-plan-btn"
              type="button"
              onClick={onClearPlan}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-semibold text-[#5C6961] bg-white border border-[#E6E1D6] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear ({count})
            </button>
          )}

          {subView === 'schedule' && scheduledDaysCount > 0 && (
            <button
              id="clear-schedule-btn"
              type="button"
              onClick={() => void onClearSchedule()}
              className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl text-xs font-semibold text-[#5C6961] bg-white border border-[#E6E1D6] hover:bg-[#F3EFE6] transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Clear Schedule
            </button>
          )}
        </div>
      </div>

      {/* Segmented Switch: Select Meals vs 2-Week Schedule */}
      <div
        role="tablist"
        aria-label="Planner views"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-[#E6E1D6] max-w-md shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
      >
        <button
          id="plan-tab-select"
          type="button"
          role="tab"
          aria-selected={subView === 'select'}
          onClick={() => setSubView('select')}
          className={`flex items-center justify-center gap-1.5 min-h-[42px] py-1.5 px-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            subView === 'select'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <ListChecks className="w-4 h-4 shrink-0" />
          <span>Select Meals</span>
          {count > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                subView === 'select' ? 'bg-white/20 text-white' : 'bg-[#EBF4EF] text-[#1B5E42]'
              }`}
            >
              {count}
            </span>
          )}
        </button>
        <button
          id="plan-tab-schedule"
          type="button"
          role="tab"
          aria-selected={subView === 'schedule'}
          onClick={() => setSubView('schedule')}
          className={`flex items-center justify-center gap-1.5 min-h-[42px] py-1.5 px-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            subView === 'schedule'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <CalendarDays className="w-4 h-4 shrink-0" />
          <span className="sm:hidden">Schedule</span>
          <span className="hidden sm:inline">2-Week Schedule</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
              subView === 'schedule' ? 'bg-white/20 text-white' : 'bg-[#EBF4EF] text-[#1B5E42]'
            }`}
          >
            {scheduledDaysCount}/14
          </span>
        </button>
      </div>

      {subView === 'select' ? (
        <>
          {/* Progress meter for 5-14 meal stretch */}
          <div className="bg-white rounded-2xl border border-[#E6E1D6] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#EBF4EF] text-[#1B5E42] flex items-center justify-center font-bold text-base tabular-nums shrink-0">
                {count}
              </div>
              <div>
                <p className="text-sm font-bold text-[#1A241E]">
                  Tap a meal to include, or tap <span className="text-[#1B5E42]">Su–Sa</span> to schedule it
                </p>
                <p className="text-xs text-[#5C6961]">
                  Once selected, add vegetables/sides or swap pasta, sauce &amp; protein variants · +{autoStaplesCount} staples
                </p>
              </div>
            </div>
            <div className="w-full sm:w-44">
              <div className="flex justify-between text-[11px] font-semibold text-[#5C6961] mb-1 tabular-nums">
                <span>Target: 5–14 meals</span>
                <span>{Math.min(count, 14)}/14</span>
              </div>
              <div className="h-2 rounded-full bg-[#ECE7DC] overflow-hidden">
                <div
                  className="h-full rounded-full bg-[#1B5E42] transition-all duration-300"
                  style={{ width: `${Math.min(100, (count / 14) * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Tag filters */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            {allTags.map((tag) => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setSelectedTag(tag)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                    active
                      ? 'bg-[#1B5E42] text-white border-[#1B5E42]'
                      : 'bg-white text-[#5C6961] border-[#E6E1D6] hover:border-[#1B5E42]/40'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>

          {/* Tap-to-select meal grid with Su M T W Th F Sa buttons + Sides & Swaps */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {visibleMeals.map((meal) => {
              const isSelected = selectedSet.has(meal.id);
              const custom = customizations[meal.id];
              const sides = custom?.sides ?? [];
              const swapEntries = Object.entries(custom?.swaps ?? {});

              return (
                <div
                  key={meal.id}
                  data-testid={`plan-meal-card-${meal.id}`}
                  className={`rounded-2xl border-2 transition-all flex flex-col justify-between overflow-hidden ${
                    isSelected
                      ? 'bg-[#EBF4EF] border-[#1B5E42] shadow-[0_4px_16px_rgba(27,94,66,0.12)]'
                      : 'bg-white border-[#E6E1D6] hover:border-[#C4DDD0] shadow-[0_1px_2px_rgba(26,36,30,0.03)]'
                  }`}
                >
                  {/* Top selectable area */}
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onToggleMeal(meal.id)}
                    className="text-left p-4 pb-3 flex-1 cursor-pointer w-full"
                  >
                    <div className="flex items-start justify-between gap-2.5 w-full">
                      <div className="flex items-start gap-3 min-w-0">
                        {meal.imageUrl && (
                          <img
                            src={meal.imageUrl}
                            alt={meal.name}
                            loading="lazy"
                            className="w-13 h-13 rounded-xl object-cover border border-[#E6E1D6] shrink-0"
                          />
                        )}
                        <div className="min-w-0">
                          <h2 className="text-sm sm:text-base font-bold text-[#1A241E] leading-snug">
                            {meal.name}
                          </h2>
                          {meal.tags.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {meal.tags.map((tag) => (
                                <span
                                  key={tag}
                                  className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                                    isSelected
                                      ? 'bg-[#1B5E42]/12 text-[#144A33]'
                                      : 'bg-[#F5F2EB] text-[#5C6961]'
                                  }`}
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-all ${
                          isSelected
                            ? 'bg-[#1B5E42] text-white scale-105'
                            : 'border-2 border-[#D6D1C6] bg-white text-transparent'
                        }`}
                      >
                        <Check className="w-4 h-4 stroke-[3]" />
                      </span>
                    </div>

                    <p className="text-xs text-[#5C6961] mt-2.5 line-clamp-1">
                      {meal.ingredients.length} ingredients:{' '}
                      {meal.ingredients.map((i) => i.name).join(', ')}
                    </p>

                    {/* Active sides & swaps badges */}
                    {(sides.length > 0 || swapEntries.length > 0) && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {sides.map((side) => (
                          <span
                            key={side.id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-white text-[#1B5E42] border border-[#C4DDD0]"
                          >
                            <Salad className="w-3 h-3" />+ {side.name}
                          </span>
                        ))}
                        {swapEntries.map(([orig, rep]) => (
                          <span
                            key={orig}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-[#FDF3EB] text-[#8A421A] border border-[#F0CFAF]"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            {rep}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>

                  {/* Customize button bar (shown when selected) */}
                  {isSelected && (
                    <div className="px-3 pb-2.5 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        data-testid={`customize-meal-${meal.id}`}
                        onClick={() => setCustomizingMeal(meal)}
                        className="w-full h-8 px-3 rounded-xl bg-white border border-[#C4DDD0] text-xs font-semibold text-[#1B5E42] hover:bg-[#1B5E42] hover:text-white transition-colors inline-flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        <span>
                          {sides.length > 0 || swapEntries.length > 0
                            ? `Edit Sides (${sides.length}) & Swaps (${swapEntries.length})`
                            : '+ Add Side / Swap Ingredients'}
                        </span>
                      </button>
                    </div>
                  )}

                  {/* Weekday Quick-Schedule Row: Su M T W Th F Sa */}
                  <div
                    className={`px-3 py-2.5 border-t ${
                      isSelected
                        ? 'border-[#C4DDD0] bg-[#E2EFE8]/70'
                        : 'border-[#F1EDE4] bg-[#FAF8F4]'
                    }`}
                  >
                    <div className="grid grid-cols-7 gap-1">
                      {DAYS.map((day) => {
                        const w1 = slotMap.get(`1-${day.index}`);
                        const w2 = slotMap.get(`2-${day.index}`);
                        const onW1 = w1?.entryType === 'meal' && w1.mealId === meal.id;
                        const onW2 = w2?.entryType === 'meal' && w2.mealId === meal.id;
                        const assignedWeek = onW1 && onW2 ? '1+2' : onW1 ? '1' : onW2 ? '2' : null;
                        const w1TakenByOther = Boolean(w1) && !onW1;
                        const bothTakenByOther = w1TakenByOther && Boolean(w2) && !onW2;

                        const titleText = assignedWeek
                          ? `${meal.name} on Week ${assignedWeek} ${day.full} (tap to remove)`
                          : bothTakenByOther
                          ? `Both ${day.full}s are already filled`
                          : w1TakenByOther
                          ? `Week 1 ${day.full} is taken — tap to put on Week 2 ${day.full}`
                          : `Assign ${meal.name} to Week 1 ${day.full}`;

                        return (
                          <button
                            key={day.index}
                            type="button"
                            data-testid={`meal-${meal.id}-day-${day.short}`}
                            aria-label={`${day.full} for ${meal.name}`}
                            aria-pressed={Boolean(assignedWeek)}
                            title={titleText}
                            onClick={() => void onAssignMealDay(meal.id, day.index)}
                            className={`relative h-8 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                              onW1
                                ? 'bg-[#1B5E42] text-white shadow-2xs'
                                : onW2
                                ? 'bg-[#B85D2B] text-white shadow-2xs'
                                : bothTakenByOther
                                ? 'bg-[#ECE7DC]/70 text-[#A3ABA5] border border-transparent'
                                : w1TakenByOther
                                ? 'bg-white text-[#5C6961] border border-dashed border-[#B85D2B]/60 hover:border-[#B85D2B]'
                                : 'bg-white text-[#39453E] border border-[#E2DDD2] hover:border-[#1B5E42] hover:text-[#1B5E42]'
                            }`}
                          >
                            <span>{day.short}</span>
                            {assignedWeek && (
                              <span className="text-[8px] font-extrabold leading-none ml-0.5 opacity-90">
                                {assignedWeek}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        /* 2-Week Meal Schedule View */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {([1, 2] as const).map((weekNum) => (
            <div
              key={weekNum}
              data-testid={`schedule-week-${weekNum}`}
              className="bg-white rounded-3xl border border-[#E6E1D6] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]"
            >
              <div className="px-4 py-3.5 bg-[#FAF8F4] border-b border-[#E6E1D6] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-7 h-7 rounded-lg text-xs font-extrabold flex items-center justify-center ${
                      weekNum === 1
                        ? 'bg-[#1B5E42] text-white'
                        : 'bg-[#B85D2B] text-white'
                    }`}
                  >
                    W{weekNum}
                  </span>
                  <h2 className="text-base font-bold text-[#1A241E]">
                    Week {weekNum}
                  </h2>
                </div>
                <span className="text-xs font-semibold text-[#5C6961] tabular-nums">
                  {DAYS.filter((d) => slotMap.has(`${weekNum}-${d.index}`)).length}/7 days set
                </span>
              </div>

              <div className="divide-y divide-[#F0ECE3]">
                {DAYS.map((day) => {
                  const slot = slotMap.get(`${weekNum}-${day.index}`);
                  const scheduledMeal =
                    slot?.entryType === 'meal' && slot.mealId
                      ? mealById.get(slot.mealId)
                      : undefined;
                  const custom = scheduledMeal ? customizations[scheduledMeal.id] : undefined;
                  const sides = custom?.sides ?? [];
                  const swapEntries = Object.entries(custom?.swaps ?? {});

                  return (
                    <div
                      key={day.index}
                      data-testid={`schedule-slot-${weekNum}-${day.short}`}
                      className="p-3.5 flex items-start justify-between gap-2.5 min-h-[68px]"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-11 shrink-0 text-center pt-0.5">
                          <div className="text-xs font-extrabold uppercase tracking-wide text-[#1B5E42]">
                            {day.short}
                          </div>
                          <div className="text-[10px] text-[#85918A] leading-tight">
                            {day.full.slice(0, 3)}
                          </div>
                        </div>

                        {slot ? (
                          slot.entryType === 'meal' && scheduledMeal ? (
                            <div className="min-w-0 flex-1 space-y-1.5">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {scheduledMeal.imageUrl && (
                                  <img
                                    src={scheduledMeal.imageUrl}
                                    alt={scheduledMeal.name}
                                    className="w-10 h-10 rounded-xl object-cover border border-[#E6E1D6] shrink-0"
                                  />
                                )}
                                <div className="min-w-0">
                                  <p className="text-sm font-bold text-[#1A241E] truncate">
                                    {scheduledMeal.name}
                                  </p>
                                  <p className="text-[11px] text-[#5C6961] truncate">
                                    {scheduledMeal.tags.join(' · ') || `${scheduledMeal.ingredients.length} ingredients`}
                                  </p>
                                </div>
                              </div>

                              {(sides.length > 0 || swapEntries.length > 0) && (
                                <div className="flex flex-wrap gap-1">
                                  {sides.map((s) => (
                                    <span
                                      key={s.id}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#EBF4EF] text-[#1B5E42]"
                                    >
                                      + {s.name}
                                    </span>
                                  ))}
                                  {swapEntries.map(([orig, rep]) => (
                                    <span
                                      key={orig}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold bg-[#FDF3EB] text-[#8A421A]"
                                    >
                                      ⇄ {rep}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : slot.entryType === 'myod' ? (
                            <div className="flex items-center gap-2 min-w-0 pt-1">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#FDF3EB] text-[#8A421A] border border-[#F0CFAF]">
                                <ChefHat className="w-3.5 h-3.5" />
                                MYOD
                              </span>
                              <span className="text-xs text-[#5C6961] truncate">
                                Make Your Own Dinner / Leftovers
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 min-w-0 pt-1">
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-bold bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE]">
                                <Utensils className="w-3.5 h-3.5" />
                                Restaurant
                              </span>
                              <span className="text-xs text-[#5C6961] truncate">
                                Dining Out / Takeout
                              </span>
                            </div>
                          )
                        ) : (
                          /* Empty day controls: MYOD, Restaurant, or pick a meal */
                          <div className="flex items-center gap-1.5 flex-wrap flex-1 pt-0.5">
                            <button
                              type="button"
                              data-testid={`set-myod-${weekNum}-${day.short}`}
                              onClick={() =>
                                void onSetScheduleSlot(weekNum, day.index, 'myod', null)
                              }
                              className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#FDF3EB] text-[#8A421A] border border-[#F0CFAF] hover:bg-[#F9E6D4] transition-colors cursor-pointer"
                            >
                              MYOD
                            </button>
                            <button
                              type="button"
                              data-testid={`set-restaurant-${weekNum}-${day.short}`}
                              onClick={() =>
                                void onSetScheduleSlot(weekNum, day.index, 'restaurant', null)
                              }
                              className="h-8 px-2.5 rounded-lg text-xs font-semibold bg-[#EEF2FF] text-[#3730A3] border border-[#C7D2FE] hover:bg-[#E0E7FF] transition-colors cursor-pointer"
                            >
                              Restaurant
                            </button>
                            <select
                              aria-label={`Pick a meal for Week ${weekNum} ${day.full}`}
                              value=""
                              onChange={(e) => {
                                const id = Number(e.target.value);
                                if (id > 0) {
                                  void onSetScheduleSlot(weekNum, day.index, 'meal', id);
                                }
                              }}
                              className="h-8 px-2 rounded-lg text-xs font-medium bg-[#FAF8F4] text-[#5C6961] border border-[#E6E1D6] hover:border-[#1B5E42] focus:outline-none max-w-[130px] cursor-pointer"
                            >
                              <option value="">+ Meal...</option>
                              {meals.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>

                      {slot && (
                        <div className="flex items-center gap-1 shrink-0">
                          {scheduledMeal && (
                            <button
                              type="button"
                              data-testid={`schedule-customize-${weekNum}-${day.short}`}
                              onClick={() => setCustomizingMeal(scheduledMeal)}
                              title="Add side/vegetable or swap ingredients"
                              className="h-8 px-2 rounded-lg text-[11px] font-semibold bg-[#FAF8F4] border border-[#E6E1D6] text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors cursor-pointer inline-flex items-center gap-1"
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Sides/Swaps</span>
                            </button>
                          )}
                          <button
                            type="button"
                            aria-label={`Clear Week ${weekNum} ${day.full}`}
                            data-testid={`clear-slot-${weekNum}-${day.short}`}
                            onClick={() => void onClearScheduleSlot(weekNum, day.index)}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#85918A] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sticky Generate CTA bar */}
      <div className="fixed bottom-[70px] md:bottom-6 inset-x-0 z-20 px-4 pointer-events-none">
        <div className="max-w-5xl mx-auto flex justify-center">
          <button
            id="generate-grocery-list-btn"
            type="button"
            disabled={generating || (count === 0 && autoStaplesCount === 0)}
            onClick={onGenerateGroceryList}
            className="pointer-events-auto w-full sm:w-auto sm:min-w-[360px] min-h-[52px] py-3 px-6 rounded-2xl bg-[#1B5E42] text-white font-semibold text-sm sm:text-base shadow-[0_10px_28px_rgba(27,94,66,0.32)] hover:bg-[#144A33] active:scale-[0.99] disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center gap-2.5 cursor-pointer"
          >
            <Sparkles className="w-4.5 h-4.5" />
            <span>
              {generating
                ? 'Consolidating Grocery List...'
                : `Generate Grocery List (${count} ${count === 1 ? 'meal' : 'meals'} + ${autoStaplesCount} staples)`}
            </span>
            <ArrowRight className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      <MealCustomizeModal
        meal={customizingMeal}
        initialCustomization={customizingMeal ? customizations[customizingMeal.id] ?? null : null}
        sidePresets={sidePresets}
        onSaveSidePresets={onSaveSidePresets}
        onResetSidePresets={onResetSidePresets}
        onClose={() => setCustomizingMeal(null)}
        onSave={onSaveMealCustomization}
      />
    </section>
  );
}
