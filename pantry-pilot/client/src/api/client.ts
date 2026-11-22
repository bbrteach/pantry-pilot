import type {
  GroceryListItem,
  KrogerCartAddResult,
  KrogerDealsResponse,
  KrogerLocation,
  KrogerProduct,
  KrogerStatus,
  Meal,
  MealPayload,
  ProductMapping,
  ScheduleEntryType,
  ScheduleSlot,
  Staple,
  StaplePayload,
  UnitAmount,
} from '../types';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Ignore JSON parse failure
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const api = {
  getAuthStatus: () =>
    request<{ passcodeEnabled: boolean; authenticated: boolean }>('/api/auth/status'),

  loginPasscode: (passcode: string) =>
    request<{ passcodeEnabled: boolean; authenticated: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ passcode }),
    }),

  logoutPasscode: () =>
    request<{ passcodeEnabled: boolean; authenticated: boolean }>('/api/auth/logout', {
      method: 'POST',
    }),

  getKrogerStatus: () => request<KrogerStatus>('/api/kroger/status'),

  getMeals: (params?: { search?: string; tag?: string }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.tag && params.tag !== 'All') query.set('tag', params.tag);
    const qs = query.toString();
    return request<Meal[]>(`/api/meals${qs ? `?${qs}` : ''}`);
  },

  createMeal: (payload: MealPayload) =>
    request<Meal>('/api/meals', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateMeal: (id: number, payload: MealPayload) =>
    request<Meal>(`/api/meals/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteMeal: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/api/meals/${id}`, {
      method: 'DELETE',
    }),

  uploadMealPhoto: (dataUrl: string) =>
    request<{ imageUrl: string }>('/api/uploads/meal-photo', {
      method: 'POST',
      body: JSON.stringify({ dataUrl }),
    }),

  getStaples: () => request<Staple[]>('/api/staples'),

  createStaple: (payload: StaplePayload) =>
    request<Staple>('/api/staples', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateStaple: (id: number, payload: Partial<StaplePayload>) =>
    request<Staple>(`/api/staples/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteStaple: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/api/staples/${id}`, {
      method: 'DELETE',
    }),

  getPlan: () => request<{ mealIds: number[] }>('/api/plan'),

  savePlan: (mealIds: number[]) =>
    request<{ mealIds: number[] }>('/api/plan', {
      method: 'PUT',
      body: JSON.stringify({ mealIds }),
    }),

  getGroceryList: () => request<GroceryListItem[]>('/api/grocery-list'),

  generateGroceryList: (mealIds: number[]) =>
    request<{
      summary: { mealCount: number; stapleCount: number; itemCount: number };
      items: GroceryListItem[];
    }>('/api/grocery-list/generate', {
      method: 'POST',
      body: JSON.stringify({ mealIds }),
    }),

  addGroceryItem: (payload: { name: string; quantity: number; unit: string }) =>
    request<GroceryListItem>('/api/grocery-list/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateGroceryItem: (
    id: number,
    payload: {
      isChecked?: boolean;
      delta?: number;
      unitIndex?: number;
      unitBreakdown?: UnitAmount[];
      name?: string;
      cartQuantity?: number;
    }
  ) =>
    request<GroceryListItem>(`/api/grocery-list/items/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  deleteGroceryItem: (id: number) =>
    request<{ deleted: boolean; id: number }>(`/api/grocery-list/items/${id}`, {
      method: 'DELETE',
    }),

  clearCheckedGroceryItems: () =>
    request<{ deletedCount: number }>('/api/grocery-list/checked', {
      method: 'DELETE',
    }),

  // Phase 2: Kroger Public API
  disconnectKroger: () =>
    request<KrogerStatus>('/api/kroger/auth/disconnect', {
      method: 'POST',
    }),

  searchKrogerLocations: (zip: string) =>
    request<KrogerLocation[]>(`/api/kroger/locations?zip=${encodeURIComponent(zip.trim())}`),

  saveKrogerStore: (store: {
    locationId: string;
    name: string;
    address: string;
    zip: string;
  }) =>
    request<{ store: NonNullable<KrogerStatus['store']>; status: KrogerStatus }>(
      '/api/kroger/store',
      {
        method: 'POST',
        body: JSON.stringify(store),
      }
    ),

  saveKrogerModality: (modality: 'PICKUP' | 'DELIVERY') =>
    request<{ modality: 'PICKUP' | 'DELIVERY' }>('/api/kroger/modality', {
      method: 'PUT',
      body: JSON.stringify({ modality }),
    }),

  searchKrogerProducts: (term: string, limit = 6) =>
    request<KrogerProduct[]>(
      `/api/kroger/products?term=${encodeURIComponent(term.trim())}&limit=${limit}`
    ),

  getProductMappings: () => request<ProductMapping[]>('/api/kroger/mappings'),

  saveProductMapping: (payload: {
    normalizedName: string;
    upc: string;
    productId?: string;
    description: string;
    brand?: string;
    size?: string;
    imageUrl?: string;
    lastPrice?: number | null;
    promoPrice?: number | null;
  }) =>
    request<ProductMapping>('/api/kroger/mappings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  deleteProductMapping: (normalizedName: string) =>
    request<{ deleted: boolean; normalizedName: string }>(
      `/api/kroger/mappings/${encodeURIComponent(normalizedName)}`,
      {
        method: 'DELETE',
      }
    ),

  sendToKrogerCart: (modality: 'PICKUP' | 'DELIVERY') =>
    request<KrogerCartAddResult>('/api/kroger/cart/add', {
      method: 'POST',
      body: JSON.stringify({ modality }),
    }),

  // 2-Week Meal Schedule
  getSchedule: () => request<{ slots: ScheduleSlot[] }>('/api/schedule'),

  assignMealDay: (mealId: number, dayOfWeek: number) =>
    request<{
      action: 'assigned' | 'removed' | 'full';
      weekNumber?: 1 | 2;
      dayOfWeek: number;
      message?: string;
      slots: ScheduleSlot[];
      mealIds: number[];
    }>('/api/schedule/assign-meal-day', {
      method: 'POST',
      body: JSON.stringify({ mealId, dayOfWeek }),
    }),

  setScheduleSlot: (payload: {
    weekNumber: 1 | 2;
    dayOfWeek: number;
    entryType: ScheduleEntryType;
    mealId?: number | null;
  }) =>
    request<{ slots: ScheduleSlot[]; mealIds: number[] }>('/api/schedule/slot', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }),

  clearScheduleSlot: (weekNumber: 1 | 2, dayOfWeek: number) =>
    request<{ slots: ScheduleSlot[]; mealIds: number[] }>(
      `/api/schedule/slot/${weekNumber}/${dayOfWeek}`,
      { method: 'DELETE' }
    ),

  clearSchedule: () =>
    request<{ slots: ScheduleSlot[]; mealIds: number[] }>('/api/schedule', {
      method: 'DELETE',
    }),

  // Kroger Deals & Sale-Based Meal Suggestions
  getKrogerDeals: () => request<KrogerDealsResponse>('/api/kroger/deals'),

  scanKrogerDeals: () =>
    request<KrogerDealsResponse>('/api/kroger/deals/scan', {
      method: 'POST',
    }),
};
