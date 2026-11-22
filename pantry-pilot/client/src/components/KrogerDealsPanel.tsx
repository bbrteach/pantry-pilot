import { useState } from 'react';
import {
  Check,
  Package,
  Plus,
  RefreshCw,
  Sparkles,
  Store,
  Tag,
} from 'lucide-react';
import type {
  KrogerDealsResponse,
  KrogerStatus,
  MealPayload,
  NewMealDealSuggestion,
} from '../types';
import { KrogerBanner } from './KrogerBanner';

interface KrogerDealsPanelProps {
  krogerStatus: KrogerStatus | null;
  dealsData: KrogerDealsResponse | null;
  scanning: boolean;
  onScanDeals: () => Promise<void>;
  onAddSavedMealToPlan: (mealId: number) => void;
  onSaveAndPlanNewIdea: (idea: NewMealDealSuggestion) => Promise<void>;
  onGoToStoreSetup: () => void;
}

export function KrogerDealsPanel({
  krogerStatus,
  dealsData,
  scanning,
  onScanDeals,
  onAddSavedMealToPlan,
  onSaveAndPlanNewIdea,
  onGoToStoreSetup,
}: KrogerDealsPanelProps) {
  const [savingIdeaId, setSavingIdeaId] = useState<string | null>(null);
  const configured = Boolean(krogerStatus?.configured);
  const store = krogerStatus?.store ?? null;

  const deals = dealsData?.deals ?? [];
  const savedSuggestions = dealsData?.savedMealSuggestions ?? [];
  const newIdeas = dealsData?.newMealIdeas ?? [];
  const scannedAt = dealsData?.scannedAt
    ? new Date(dealsData.scannedAt).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
    : null;

  const handleSaveIdea = async (idea: NewMealDealSuggestion) => {
    setSavingIdeaId(idea.id);
    try {
      await onSaveAndPlanNewIdea(idea);
    } finally {
      setSavingIdeaId(null);
    }
  };

  return (
    <div className="space-y-5">
      {!configured && <KrogerBanner krogerStatus={krogerStatus} />}

      {/* Scan Control Card */}
      <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-2xl bg-[#FDF3EB] text-[#B85D2B] flex items-center justify-center shrink-0">
            <Tag className="w-5 h-5" />
          </span>
          <div>
            <h2 className="text-base font-bold text-[#1A241E]">
              Currently On Sale at Kroger
            </h2>
            <p className="text-xs text-[#5C6961] mt-0.5">
              {!configured
                ? 'Add Kroger API credentials to .env to scan live local promo prices.'
                : !store
                ? 'Select your preferred Kroger store first to scan this week’s local sales.'
                : scannedAt
                ? `${deals.length} active sale items at ${store.name} · last scanned ${scannedAt}`
                : `Ready to scan live sale prices at ${store.name} for your family meals & staples.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {configured && !store ? (
            <button
              type="button"
              onClick={onGoToStoreSetup}
              className="h-10 px-4 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold hover:bg-[#144A33] inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Store className="w-4 h-4" />
              Select Store
            </button>
          ) : (
            <button
              id="scan-kroger-deals-btn"
              type="button"
              disabled={!configured || !store || scanning}
              onClick={() => void onScanDeals()}
              className="h-10 px-4 rounded-xl bg-[#1B5E42] text-white text-xs sm:text-sm font-semibold hover:bg-[#144A33] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors inline-flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              <span>{scanning ? 'Scanning Store Sales...' : deals.length > 0 ? 'Refresh Sales' : 'Scan Store Sales'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Section 1: Your Saved Meals On Sale */}
      {savedSuggestions.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#1B5E42]">
              Your Saved Meals With Sale Ingredients ({savedSuggestions.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {savedSuggestions.map((item) => (
              <article
                key={item.mealId}
                className="bg-white rounded-2xl border border-[#C4DDD0] p-4 flex flex-col justify-between gap-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={item.mealName}
                          className="w-12 h-12 rounded-xl object-cover border border-[#E6E1D6] shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <h4 className="text-sm sm:text-base font-bold text-[#1A241E] leading-snug">
                          {item.mealName}
                        </h4>
                        <p className="text-xs font-semibold text-[#B85D2B] mt-0.5 tabular-nums">
                          {item.matchedIngredients.length} on sale · Est. save ~${item.estimatedSavings.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onAddSavedMealToPlan(item.mealId)}
                      className={`h-9 px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1 shrink-0 transition-colors cursor-pointer ${
                        item.inCurrentPlan
                          ? 'bg-[#EBF4EF] text-[#1B5E42] border border-[#C4DDD0]'
                          : 'bg-[#1B5E42] text-white hover:bg-[#144A33]'
                      }`}
                    >
                      {item.inCurrentPlan ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                          In Plan
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                          Add to Plan
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {item.matchedIngredients.map((ing) => (
                      <span
                        key={`${item.mealId}-${ing.dealUpc}`}
                        className="text-[11px] px-2.5 py-1 rounded-lg bg-[#FDF3EB] border border-[#F0CFAF] text-[#6E3414] font-medium tabular-nums"
                      >
                        <strong>{ing.ingredientName}</strong>: ${ing.promoPrice.toFixed(2)}{' '}
                        <span className="line-through opacity-65">${ing.regularPrice.toFixed(2)}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Section 2: Suggested New Meal Ideas Inspired by Sales */}
      {newIdeas.length > 0 && (
        <div className="space-y-2.5">
          <div className="flex items-center gap-1.5 px-1">
            <Sparkles className="w-3.5 h-3.5 text-[#B85D2B]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8A421A]">
              Suggested New Meal Ideas From This Week&apos;s Sales ({newIdeas.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {newIdeas.map((idea) => (
              <article
                key={idea.id}
                className="bg-white rounded-2xl border border-[#E6E1D6] p-4 flex flex-col justify-between gap-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-sm sm:text-base font-bold text-[#1A241E]">
                        {idea.name}
                      </h4>
                      <p className="text-xs font-semibold text-[#B85D2B] mt-0.5 tabular-nums">
                        Uses {idea.matchedIngredients.length} sale{' '}
                        {idea.matchedIngredients.length === 1 ? 'item' : 'items'} · Est. save ~$
                        {idea.estimatedSavings.toFixed(2)}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={savingIdeaId === idea.id}
                      onClick={() => void handleSaveIdea(idea)}
                      className="h-9 px-3 rounded-xl text-xs font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:opacity-60 inline-flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      {savingIdeaId === idea.id ? 'Saving...' : 'Save & Plan'}
                    </button>
                  </div>

                  <p className="text-xs text-[#5C6961] mt-2 leading-relaxed">{idea.notes}</p>

                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {idea.matchedIngredients.map((ing) => (
                      <span
                        key={`${idea.id}-${ing.dealUpc}`}
                        className="text-[11px] px-2 py-0.5 rounded-lg bg-[#FDF3EB] border border-[#F0CFAF] text-[#6E3414] font-medium tabular-nums"
                      >
                        {ing.ingredientName} ${ing.promoPrice.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {/* Section 3: Active Kroger Sale Products Grid */}
      {deals.length > 0 ? (
        <div className="space-y-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#85918A] px-1">
            All Scanned Sale Items ({deals.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deals.map((deal) => (
              <div
                key={deal.upc}
                className="bg-white rounded-2xl border border-[#E6E1D6] p-3.5 flex gap-3 items-center shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
              >
                <div className="w-16 h-16 rounded-xl bg-[#FAF8F4] border border-[#ECE7DC] flex items-center justify-center overflow-hidden shrink-0">
                  {deal.imageUrl ? (
                    <img
                      src={deal.imageUrl}
                      alt={deal.description}
                      loading="lazy"
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Package className="w-6 h-6 text-[#85918A]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-[#FDF3EB] text-[#B85D2B] border border-[#F0CFAF] tabular-nums">
                      {deal.savingsPercent}% OFF
                    </span>
                    <span className="text-[10px] font-medium text-[#85918A] truncate">
                      {deal.size}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#1A241E] line-clamp-2 mt-1 leading-snug">
                    {deal.description}
                  </p>
                  <div className="flex items-baseline gap-1.5 mt-1 tabular-nums">
                    <span className="text-sm font-extrabold text-[#B85D2B]">
                      ${deal.promoPrice.toFixed(2)}
                    </span>
                    <span className="text-xs text-[#85918A] line-through">
                      ${deal.regularPrice.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-3xl bg-white border border-[#E6E1D6] p-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-[#FDF3EB] text-[#B85D2B] mx-auto flex items-center justify-center mb-3">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-[#1A241E]">
            {configured ? 'No sales scanned yet' : 'Live Kroger Sales Ready When Connected'}
          </h3>
          <p className="text-sm text-[#5C6961] mt-1 max-w-md mx-auto">
            {configured
              ? 'Tap "Scan Store Sales" above to check live promo prices on your family’s ingredients and get meal suggestions.'
              : 'Once your Kroger API credentials are added to .env and a local store is selected, PantryPilot will scan current promo prices and suggest meals that save the most.'}
          </p>
        </div>
      )}
    </div>
  );
}

export type { MealPayload };
