import { useCallback, useEffect, useState } from 'react';
import { api } from './api/client';
import type {
  ActiveTab,
  CheaperAlternativeOption,
  GroceryListItem,
  KrogerDealsResponse,
  KrogerProduct,
  KrogerStatus,
  Meal,
  MealCustomization,
  MealIdea,
  MealIdeasFeedResponse,
  MealPayload,
  MealSideItem,
  NewMealDealSuggestion,
  QuickSidePreset,
  SavingsCheckResponse,
  ScheduleEntryType,
  ScheduleSlot,
  Staple,
  StaplePayload,
} from './types';
import { QUICK_SIDE_PRESETS } from './utils/variants';
import { NavShell } from './components/NavShell';
import { PasscodeGate } from './components/PasscodeGate';
import { MealsView } from './views/MealsView';
import { StaplesView } from './views/StaplesView';
import { PlannerView } from './views/PlannerView';
import { GroceryListView } from './views/GroceryListView';
import { KrogerView } from './views/KrogerView';

function getInitialTab(): ActiveTab {
  const hash = window.location.hash.replace('#', '');
  if (
    hash === 'meals' ||
    hash === 'staples' ||
    hash === 'plan' ||
    hash === 'list' ||
    hash === 'kroger'
  ) {
    return hash;
  }
  if (hash === 'ideas') {
    return 'meals';
  }
  return 'meals';
}

function getInitialMealsSubTab(): 'library' | 'ideas' {
  return window.location.hash.replace('#', '') === 'ideas' ? 'ideas' : 'library';
}

export function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>(getInitialTab);
  const [mealsSubTab, setMealsSubTab] = useState<'library' | 'ideas'>(getInitialMealsSubTab);
  const [krogerSubTab, setKrogerSubTab] = useState<'cart' | 'deals'>('cart');
  const [authChecked, setAuthChecked] = useState(false);
  const [passcodeEnabled, setPasscodeEnabled] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [mealIdeasFeed, setMealIdeasFeed] = useState<MealIdeasFeedResponse | null>(null);
  const [refreshingIdeas, setRefreshingIdeas] = useState(false);
  const [staples, setStaples] = useState<Staple[]>([]);
  const [selectedMealIds, setSelectedMealIds] = useState<number[]>([]);
  const [customizations, setCustomizations] = useState<Record<number, MealCustomization>>({});
  const [sidePresets, setSidePresets] = useState<QuickSidePreset[]>(QUICK_SIDE_PRESETS);
  const [scheduleSlots, setScheduleSlots] = useState<ScheduleSlot[]>([]);
  const [groceryItems, setGroceryItems] = useState<GroceryListItem[]>([]);
  const [krogerStatus, setKrogerStatus] = useState<KrogerStatus | null>(null);
  const [krogerDeals, setKrogerDeals] = useState<KrogerDealsResponse | null>(null);
  const [scanningDeals, setScanningDeals] = useState(false);
  const [savingsData, setSavingsData] = useState<SavingsCheckResponse | null>(null);
  const [checkingSavings, setCheckingSavings] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const selectTab = (tab: ActiveTab) => {
    setActiveTab(tab);
    window.history.replaceState(
      null,
      '',
      `#${tab === 'meals' && mealsSubTab === 'ideas' ? 'ideas' : tab}`
    );
  };

  const selectMealsSubTab = (subTab: 'library' | 'ideas') => {
    setMealsSubTab(subTab);
    window.history.replaceState(null, '', subTab === 'ideas' ? '#ideas' : '#meals');
  };

  // Handle OAuth2 callback query params (?kroger_connected=1&kroger_account=... / ?kroger_error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connected = params.get('kroger_connected');
    const accountName = params.get('kroger_account');
    const krogerErr = params.get('kroger_error');
    if (connected === '1') {
      showToast(
        accountName
          ? `Connected "${accountName}" Kroger account!`
          : 'Connected your Kroger account!'
      );
      setActiveTab('kroger');
      window.history.replaceState(null, '', '/#kroger');
    } else if (krogerErr) {
      setErrorBanner(`Kroger login error: ${krogerErr}`);
      setActiveTab('kroger');
      window.history.replaceState(null, '', '/#kroger');
    }
  }, [showToast]);

  const runSavingsCheck = useCallback(
    async (silent: boolean) => {
      setCheckingSavings(true);
      try {
        const res = await api.checkKrogerSavings();
        setSavingsData(res);
        if (!silent) {
          if (res.alerts.length > 0) {
            showToast(
              `Found ${res.alerts.length} cheaper/sale ${res.alerts.length === 1 ? 'option' : 'options'} (save $${res.totalPotentialSavings.toFixed(2)})`
            );
          } else {
            showToast('Your mapped items are already the lowest-priced options!');
          }
        }
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error ? err.message : 'Could not check cheaper alternatives'
          );
        }
      } finally {
        setCheckingSavings(false);
      }
    },
    [showToast]
  );

  const refreshMealIdeasFeed = useCallback(
    async (silent: boolean) => {
      setRefreshingIdeas(true);
      try {
        const fresh = await api.refreshMealIdeas();
        setMealIdeasFeed(fresh);
        if (!silent) {
          showToast(
            fresh.liveCount > 0
              ? `Loaded ${fresh.liveCount} fresh recipes from recipe websites`
              : 'Meal ideas checked — showing available recipes'
          );
        }
      } catch (err) {
        if (!silent) {
          showToast(
            err instanceof Error ? err.message : 'Could not refresh live recipe ideas'
          );
        }
      } finally {
        setRefreshingIdeas(false);
      }
    },
    [showToast]
  );

  const loadAllData = useCallback(async () => {
    try {
      setLoading(true);
      setErrorBanner(null);
      const [
        mealsData,
        mealIdeasData,
        staplesData,
        planData,
        scheduleData,
        groceryData,
        krogerData,
        dealsData,
      ] = await Promise.all([
        api.getMeals(),
        api.getMealIdeas().catch(() => null),
        api.getStaples(),
        api.getPlan(),
        api.getSchedule(),
        api.getGroceryList(),
        api.getKrogerStatus().catch(() => null),
        api.getKrogerDeals().catch(() => null),
      ]);
      setMeals(mealsData);
      setMealIdeasFeed(mealIdeasData);
      setStaples(staplesData);
      setSelectedMealIds(planData.mealIds);
      setCustomizations(planData.customizations ?? {});
      if (Array.isArray(planData.sidePresets)) {
        setSidePresets(planData.sidePresets);
      }
      setScheduleSlots(scheduleData.slots);
      setGroceryItems(groceryData);
      setKrogerStatus(krogerData);
      setKrogerDeals(dealsData);

      if (mealIdeasData?.stale) {
        void refreshMealIdeasFeed(true);
      }

      const hasMappedActive = groceryData.some((i) => !i.isChecked && Boolean(i.productMapping));
      if (krogerData?.configured && krogerData?.store && hasMappedActive) {
        void runSavingsCheck(true);
      } else {
        setSavingsData(null);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Unable to connect to the PantryPilot server.'
      );
    } finally {
      setLoading(false);
    }
  }, [runSavingsCheck, refreshMealIdeasFeed]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const status = await api.getAuthStatus();
        if (!active) return;
        setPasscodeEnabled(status.passcodeEnabled);
        setAuthenticated(status.authenticated);
        setAuthChecked(true);
        if (status.authenticated) {
          await loadAllData();
        } else {
          setLoading(false);
        }
      } catch {
        if (!active) return;
        setAuthChecked(true);
        setAuthenticated(true);
        await loadAllData();
      }
    })();
    return () => {
      active = false;
    };
  }, [loadAllData]);

  const handleUnlock = async (passcode: string) => {
    const status = await api.loginPasscode(passcode);
    setPasscodeEnabled(status.passcodeEnabled);
    setAuthenticated(status.authenticated);
    if (status.authenticated) {
      await loadAllData();
    }
  };

  const handleLock = async () => {
    await api.logoutPasscode();
    setAuthenticated(false);
  };

  // Meal handlers
  const handleCreateMeal = async (payload: MealPayload) => {
    const created = await api.createMeal(payload);
    setMeals((prev) =>
      [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
    );
    showToast(`Added "${created.name}"`);
  };

  const handleUpdateMeal = async (id: number, payload: MealPayload) => {
    const updated = await api.updateMeal(id, payload);
    setMeals((prev) =>
      prev
        .map((m) => (m.id === id ? updated : m))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
    showToast(`Updated "${updated.name}"`);
  };

  const handleDeleteMeal = async (id: number) => {
    await api.deleteMeal(id);
    setMeals((prev) => prev.filter((m) => m.id !== id));
    setSelectedMealIds((prev) => prev.filter((mid) => mid !== id));
    setCustomizations((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setScheduleSlots((prev) => prev.filter((s) => s.mealId !== id));
    showToast('Meal deleted');
  };

  const handleAddMealIdea = async (idea: MealIdea) => {
    try {
      const created = await api.addMealIdeaToLibrary(idea.id);
      setMeals((prev) =>
        [...prev, created].sort((a, b) => a.name.localeCompare(b.name))
      );
      showToast(`Added "${created.name}" to Meal Library`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not add meal idea');
    }
  };

  const handleRefreshMealIdeas = async () => {
    await refreshMealIdeasFeed(false);
  };

  const handleSearchWebIdeas = async (query: string): Promise<MealIdea[]> => {
    try {
      const res = await api.searchWebMealIdeas(query);
      setMealIdeasFeed(res.feed);
      if (res.results.length > 0) {
        showToast(
          `Found ${res.results.length} online ${res.results.length === 1 ? 'recipe' : 'recipes'} for "${res.query}"`
        );
      } else {
        showToast(`No online recipes found for "${res.query}"`);
      }
      return res.results;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not search online recipes');
      return [];
    }
  };

  const handleImportRecipeUrl = async (url: string): Promise<MealIdea | null> => {
    try {
      const res = await api.importMealIdeaFromUrl(url);
      setMealIdeasFeed(res.feed);
      showToast(`Imported "${res.idea.name}" from ${res.idea.sourceName}`);
      return res.idea;
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not import recipe from URL');
      return null;
    }
  };

  // Staple handlers
  const handleCreateStaple = async (payload: StaplePayload) => {
    const created = await api.createStaple(payload);
    setStaples((prev) => [...prev, created]);
    showToast(`Added "${created.name}" to staples`);
  };

  const handleUpdateStaple = async (id: number, payload: Partial<StaplePayload>) => {
    const updated = await api.updateStaple(id, payload);
    setStaples((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleSetAllStaplesSavedOnly = async () => {
    try {
      const res = await api.setAllStaplesAutoInclude(false);
      setStaples(res.staples);
      showToast(
        res.updatedCount > 0
          ? `Changed ${res.updatedCount} ${res.updatedCount === 1 ? 'staple' : 'staples'} to saved only`
          : 'All staples are already saved only'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update staples');
    }
  };

  const handleDeleteStaple = async (id: number) => {
    await api.deleteStaple(id);
    setStaples((prev) => prev.filter((s) => s.id !== id));
    showToast('Staple removed');
  };

  const handleAddStapleToList = async (staple: Staple) => {
    try {
      const res = await api.addStapleToGroceryList(staple.id);
      setGroceryItems(res.items);
      if (res.action === 'added') {
        showToast(`Added "${res.item.name}" (${res.item.quantityDisplay}) to list/cart`);
      } else if (res.action === 'restored') {
        showToast(`Moved "${res.item.name}" back to active list/cart`);
      } else {
        showToast(`Updated "${res.item.name}" on list/cart (${res.item.quantityDisplay})`);
      }
      if (krogerStatus?.configured && krogerStatus?.store && res.item.productMapping) {
        void runSavingsCheck(true);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to add staple to list');
    }
  };

  // Planner & 2-Week Schedule handlers
  const handleTogglePlanMeal = async (mealId: number) => {
    const nextIds = selectedMealIds.includes(mealId)
      ? selectedMealIds.filter((id) => id !== mealId)
      : [...selectedMealIds, mealId];
    setSelectedMealIds(nextIds);
    try {
      const [saved, sched] = await Promise.all([api.savePlan(nextIds), api.getSchedule()]);
      setSelectedMealIds(saved.mealIds);
      setCustomizations(saved.customizations ?? {});
      setScheduleSlots(sched.slots);
      // Keep deals "In Plan" badges synced
      setKrogerDeals((prev) =>
        prev
          ? {
              ...prev,
              savedMealSuggestions: prev.savedMealSuggestions.map((s) => ({
                ...s,
                inCurrentPlan: saved.mealIds.includes(s.mealId),
              })),
            }
          : prev
      );
    } catch {
      showToast('Failed to save selection');
    }
  };

  const handleSaveMealCustomization = async (
    mealId: number,
    payload: { sides: MealSideItem[]; swaps: Record<string, string[]> }
  ) => {
    const res = await api.saveMealCustomization(mealId, payload);
    setCustomizations(res.customizations);
    if (!selectedMealIds.includes(mealId)) {
      const savedPlan = await api.savePlan([...selectedMealIds, mealId]);
      setSelectedMealIds(savedPlan.mealIds);
    }
    const sideCount = payload.sides.length;
    const swapCount = Object.keys(payload.swaps).length;
    if (sideCount === 0 && swapCount === 0) {
      showToast('Reset sides & ingredient swaps');
    } else {
      const parts: string[] = [];
      if (sideCount > 0) parts.push(`${sideCount} ${sideCount === 1 ? 'side' : 'sides'}`);
      if (swapCount > 0) parts.push(`${swapCount} ${swapCount === 1 ? 'swap' : 'swaps'}`);
      showToast(`Saved ${parts.join(' & ')} for this plan`);
    }
  };

  const handleSaveSidePresets = async (presets: QuickSidePreset[]) => {
    const res = await api.saveSidePresets(presets);
    setSidePresets(res.presets);
    showToast('Updated quick-pick veggies & sides');
  };

  const handleResetSidePresets = async () => {
    const res = await api.resetSidePresets();
    setSidePresets(res.presets);
    showToast('Restored default quick-pick veggies & sides');
  };

  const handleAssignMealDay = async (mealId: number, dayOfWeek: number) => {
    try {
      const res = await api.assignMealDay(mealId, dayOfWeek);
      setScheduleSlots(res.slots);
      setSelectedMealIds(res.mealIds);
      if (res.message) showToast(res.message);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not schedule that day');
    }
  };

  const handleSetScheduleSlot = async (
    weekNumber: 1 | 2,
    dayOfWeek: number,
    entryType: ScheduleEntryType,
    mealId?: number | null
  ) => {
    try {
      const res = await api.setScheduleSlot({
        weekNumber,
        dayOfWeek,
        entryType,
        mealId: mealId ?? null,
      });
      setScheduleSlots(res.slots);
      setSelectedMealIds(res.mealIds);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not update schedule');
    }
  };

  const handleClearScheduleSlot = async (weekNumber: 1 | 2, dayOfWeek: number) => {
    const res = await api.clearScheduleSlot(weekNumber, dayOfWeek);
    setScheduleSlots(res.slots);
  };

  const handleClearSchedule = async () => {
    const res = await api.clearSchedule();
    setScheduleSlots(res.slots);
    showToast('Cleared 2-week schedule');
  };

  const handleClearPlan = async () => {
    try {
      const res = await api.resetMealPlan();
      setSelectedMealIds(res.mealIds);
      setCustomizations(res.customizations);
      setScheduleSlots(res.slots);
      setKrogerDeals((prev) =>
        prev
          ? {
              ...prev,
              savedMealSuggestions: prev.savedMealSuggestions.map((s) => ({
                ...s,
                inCurrentPlan: false,
              })),
            }
          : prev
      );
      showToast('Cleared meal plan & schedule — ready to start over');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear meal plan');
    }
  };

  const handleGenerateGroceryList = async () => {
    setGenerating(true);
    try {
      const result = await api.generateGroceryList(selectedMealIds);
      setGroceryItems(result.items);
      setSavingsData(null);
      selectTab('list');
      showToast(
        `Consolidated ${result.summary.itemCount} items from ${result.summary.mealCount} meals & ${result.summary.stapleCount} staples`
      );
      const hasMappedActive = result.items.some(
        (i) => !i.isChecked && Boolean(i.productMapping)
      );
      if (krogerStatus?.configured && krogerStatus?.store && hasMappedActive) {
        void runSavingsCheck(true);
      }
    } catch (err) {
      setErrorBanner(
        err instanceof Error ? err.message : 'Failed to generate grocery list.'
      );
    } finally {
      setGenerating(false);
    }
  };

  // Grocery list handlers
  const handleToggleGroceryChecked = async (item: GroceryListItem) => {
    const updated = await api.updateGroceryItem(item.id, {
      isChecked: !item.isChecked,
    });
    setGroceryItems((prev) =>
      prev
        .map((i) => (i.id === item.id ? updated : i))
        .sort((a, b) => Number(a.isChecked) - Number(b.isChecked) || a.name.localeCompare(b.name))
    );
  };

  const handleStepQuantity = async (
    item: GroceryListItem,
    delta: number,
    unitIndex = 0
  ) => {
    const updated = await api.updateGroceryItem(item.id, { delta, unitIndex });
    setGroceryItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const handleUpdateCartQuantity = async (item: GroceryListItem, nextQty: number) => {
    const updated = await api.updateGroceryItem(item.id, { cartQuantity: nextQty });
    setGroceryItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
  };

  const handleDeleteGroceryItem = async (id: number) => {
    await api.deleteGroceryItem(id);
    setGroceryItems((prev) => prev.filter((i) => i.id !== id));
    setSavingsData((prev) => {
      if (!prev) return prev;
      const alerts = prev.alerts.filter((a) => a.groceryItemId !== id);
      const totalPotentialSavings = Number(
        alerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0).toFixed(2)
      );
      return { ...prev, alerts, totalPotentialSavings };
    });
    showToast('Removed item from list');
  };

  const handleClearChecked = async () => {
    await api.clearCheckedGroceryItems();
    setGroceryItems((prev) => prev.filter((i) => !i.isChecked));
    showToast('Cleared checked items');
  };

  const handleClearGroceryList = async () => {
    try {
      const res = await api.clearGroceryList();
      setGroceryItems([]);
      setSavingsData(null);
      showToast(
        res.deletedCount > 0
          ? `Cleared all ${res.deletedCount} ${res.deletedCount === 1 ? 'item' : 'items'} from shopping list`
          : 'Shopping list is already empty'
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to clear shopping list');
    }
  };

  const handleAddAdHocItem = async (payload: {
    name: string;
    quantity: number;
    unit: string;
  }) => {
    const created = await api.addGroceryItem(payload);
    setGroceryItems((prev) =>
      [...prev, created].sort(
        (a, b) => Number(a.isChecked) - Number(b.isChecked) || a.name.localeCompare(b.name)
      )
    );
    showToast(`Added "${created.name}"`);
  };

  // Kroger Deals, Savings & Mappings handlers
  const handleScanDeals = async () => {
    setScanningDeals(true);
    try {
      const fresh = await api.scanKrogerDeals();
      setKrogerDeals(fresh);
      showToast(`Found ${fresh.deals.length} active sale items at Kroger`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to scan store sales');
    } finally {
      setScanningDeals(false);
    }
  };

  const handleCheckSavings = async () => {
    await runSavingsCheck(false);
  };

  const handleSwitchToAlternative = async (
    item: GroceryListItem,
    alt: CheaperAlternativeOption
  ) => {
    await api.saveProductMapping({
      normalizedName: item.normalizedName,
      upc: alt.upc,
      productId: alt.productId,
      description: alt.description,
      brand: alt.brand,
      size: alt.size,
      imageUrl: alt.imageUrl,
      lastPrice: alt.regularPrice,
      promoPrice: alt.promoPrice,
    });
    const nextCartQty =
      typeof alt.recommendedCartQuantity === 'number' && alt.recommendedCartQuantity >= 1
        ? alt.recommendedCartQuantity
        : item.cartQuantity;
    if (nextCartQty !== item.cartQuantity) {
      await api.updateGroceryItem(item.id, { cartQuantity: nextCartQty });
    }
    const refreshed = await api.getGroceryList();
    setGroceryItems(refreshed);
    setSavingsData((prev) => {
      if (!prev) return prev;
      const alerts = prev.alerts.filter((a) => a.groceryItemId !== item.id);
      const totalPotentialSavings = Number(
        alerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0).toFixed(2)
      );
      return { ...prev, alerts, totalPotentialSavings };
    });
    const qtyPrefix = nextCartQty !== item.cartQuantity ? `${nextCartQty} × ` : '';
    showToast(`Switched "${item.name}" → ${qtyPrefix}${alt.description}`);
  };

  const handleSaveAndPlanNewIdea = async (idea: NewMealDealSuggestion) => {
    const created = await api.createMeal({
      name: idea.name,
      notes: idea.notes,
      tags: idea.tags,
      ingredients: idea.ingredients,
    });
    setMeals((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
    const nextIds = Array.from(new Set([...selectedMealIds, created.id]));
    const savedPlan = await api.savePlan(nextIds);
    setSelectedMealIds(savedPlan.mealIds);
    const refreshedDeals = await api.getKrogerDeals().catch(() => null);
    if (refreshedDeals) setKrogerDeals(refreshedDeals);
    showToast(`Saved "${created.name}" & added to your plan!`);
  };

  const handleSaveProductMapping = async (item: GroceryListItem, product: KrogerProduct) => {
    await api.saveProductMapping({
      normalizedName: item.normalizedName,
      upc: product.upc,
      productId: product.productId,
      description: product.description,
      brand: product.brand,
      size: product.size,
      imageUrl: product.imageUrl,
      lastPrice: product.regularPrice,
      promoPrice: product.promoPrice,
    });
    const refreshed = await api.getGroceryList();
    setGroceryItems(refreshed);
    setSavingsData((prev) => {
      if (!prev) return prev;
      const alerts = prev.alerts.filter((a) => a.groceryItemId !== item.id);
      const totalPotentialSavings = Number(
        alerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0).toFixed(2)
      );
      return { ...prev, alerts, totalPotentialSavings };
    });
    showToast(`Matched "${item.name}" → ${product.description}`);
  };

  const handleDeleteProductMapping = async (normalizedName: string) => {
    await api.deleteProductMapping(normalizedName);
    const refreshed = await api.getGroceryList();
    setGroceryItems(refreshed);
    setSavingsData((prev) => {
      if (!prev) return prev;
      const alerts = prev.alerts.filter((a) => a.normalizedName !== normalizedName);
      const totalPotentialSavings = Number(
        alerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0).toFixed(2)
      );
      return { ...prev, alerts, totalPotentialSavings };
    });
    showToast('Cleared product mapping');
  };

  const autoStaplesCount = staples.filter((s) => s.autoInclude).length;
  const activeGroceryCount = groceryItems.filter((i) => !i.isChecked).length;
  const mappedGroceryCount = groceryItems.filter(
    (i) => !i.isChecked && Boolean(i.productMapping)
  ).length;

  if (!authChecked) {
    return (
      <div className="min-h-screen bg-[#F8F6F1] flex items-center justify-center text-[#5C6961]">
        <div className="w-8 h-8 rounded-full border-3 border-[#C4DDD0] border-t-[#1B5E42] animate-spin" />
      </div>
    );
  }

  if (passcodeEnabled && !authenticated) {
    return <PasscodeGate onUnlock={handleUnlock} />;
  }

  return (
    <NavShell
      activeTab={activeTab}
      onSelectTab={selectTab}
      selectedMealsCount={selectedMealIds.length}
      activeGroceryCount={activeGroceryCount}
      autoStaplesCount={autoStaplesCount}
      mappedGroceryCount={mappedGroceryCount}
      passcodeEnabled={passcodeEnabled}
      onLock={handleLock}
    >
      {errorBanner && (
        <div className="mb-4 p-3.5 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm font-medium flex items-center justify-between gap-3">
          <span>{errorBanner}</span>
          <button
            type="button"
            onClick={() => void loadAllData()}
            className="text-xs font-bold underline shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex flex-col items-center justify-center text-[#5C6961] gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-[#C4DDD0] border-t-[#1B5E42] animate-spin" />
          <p className="text-sm font-medium">Loading your pantry...</p>
        </div>
      ) : (
        <>
          {activeTab === 'meals' && (
            <MealsView
              meals={meals}
              mealIdeasFeed={mealIdeasFeed}
              refreshingIdeas={refreshingIdeas}
              onRefreshMealIdeas={handleRefreshMealIdeas}
              onSearchWebIdeas={handleSearchWebIdeas}
              onImportRecipeUrl={handleImportRecipeUrl}
              initialSubTab={mealsSubTab}
              onSubTabChange={selectMealsSubTab}
              onCreateMeal={handleCreateMeal}
              onUpdateMeal={handleUpdateMeal}
              onDeleteMeal={handleDeleteMeal}
              onAddMealIdea={handleAddMealIdea}
            />
          )}

          {activeTab === 'staples' && (
            <StaplesView
              staples={staples}
              groceryItems={groceryItems}
              onCreateStaple={handleCreateStaple}
              onUpdateStaple={handleUpdateStaple}
              onSetAllSavedOnly={handleSetAllStaplesSavedOnly}
              onDeleteStaple={handleDeleteStaple}
              onAddStapleToList={handleAddStapleToList}
            />
          )}

          {activeTab === 'plan' && (
            <PlannerView
              meals={meals}
              selectedMealIds={selectedMealIds}
              customizations={customizations}
              sidePresets={sidePresets}
              scheduleSlots={scheduleSlots}
              autoStaplesCount={autoStaplesCount}
              generating={generating}
              onToggleMeal={handleTogglePlanMeal}
              onSaveMealCustomization={handleSaveMealCustomization}
              onSaveSidePresets={handleSaveSidePresets}
              onResetSidePresets={handleResetSidePresets}
              onAssignMealDay={handleAssignMealDay}
              onSetScheduleSlot={handleSetScheduleSlot}
              onClearScheduleSlot={handleClearScheduleSlot}
              onClearSchedule={handleClearSchedule}
              onClearPlan={handleClearPlan}
              onGenerateGroceryList={handleGenerateGroceryList}
              onOpenKrogerDeals={() => {
                setKrogerSubTab('deals');
                selectTab('kroger');
              }}
            />
          )}

          {activeTab === 'list' && (
            <GroceryListView
              items={groceryItems}
              krogerStatus={krogerStatus}
              savingsData={savingsData}
              checkingSavings={checkingSavings}
              onCheckSavings={handleCheckSavings}
              onSwitchToAlternative={handleSwitchToAlternative}
              onToggleChecked={handleToggleGroceryChecked}
              onStepQuantity={handleStepQuantity}
              onDeleteItem={handleDeleteGroceryItem}
              onClearChecked={handleClearChecked}
              onClearAll={handleClearGroceryList}
              onAddAdHocItem={handleAddAdHocItem}
              onGoToPlanner={() => selectTab('plan')}
              onOpenKroger={() => {
                setKrogerSubTab('cart');
                selectTab('kroger');
              }}
            />
          )}

          {activeTab === 'kroger' && (
            <KrogerView
              krogerStatus={krogerStatus}
              dealsData={krogerDeals}
              scanningDeals={scanningDeals}
              savingsData={savingsData}
              checkingSavings={checkingSavings}
              initialSubTab={krogerSubTab}
              groceryItems={groceryItems}
              onRefreshAll={loadAllData}
              onScanDeals={handleScanDeals}
              onCheckSavings={handleCheckSavings}
              onSwitchToAlternative={handleSwitchToAlternative}
              onAddSavedMealToPlan={handleTogglePlanMeal}
              onSaveAndPlanNewIdea={handleSaveAndPlanNewIdea}
              onUpdateCartQuantity={handleUpdateCartQuantity}
              onSaveMapping={handleSaveProductMapping}
              onDeleteMapping={handleDeleteProductMapping}
              onStatusChange={setKrogerStatus}
              onGoToList={() => selectTab('list')}
            />
          )}
        </>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[82px] md:bottom-6 left-1/2 md:left-auto md:right-6 -translate-x-1/2 md:translate-x-0 z-50 px-4 py-2.5 rounded-2xl bg-[#1A241E] text-white text-xs sm:text-sm font-semibold shadow-lg whitespace-nowrap pointer-events-none"
        >
          {toast}
        </div>
      )}
    </NavShell>
  );
}

export default App;
