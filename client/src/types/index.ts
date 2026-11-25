export interface Ingredient {
  id?: number;
  name: string;
  quantity: number;
  unit: string;
  alternatives?: string[];
}

export interface Meal {
  id: number;
  name: string;
  notes: string;
  tags: string[];
  imageUrl: string;
  ingredients: Ingredient[];
  createdAt: string;
  updatedAt: string;
}

export interface MealPayload {
  name: string;
  notes: string;
  tags: string[];
  imageUrl?: string;
  ingredients: Array<{
    name: string;
    quantity: number;
    unit: string;
    alternatives?: string[];
  }>;
}

export interface Staple {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  autoInclude: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaplePayload {
  name: string;
  quantity: number;
  unit: string;
  category?: string;
  autoInclude: boolean;
}

export interface UnitAmount {
  quantity: number;
  unit: string;
}

export interface ProductMapping {
  normalizedName: string;
  upc: string;
  productId: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  lastPrice: number | null;
  promoPrice: number | null;
}

export interface GroceryListItem {
  id: number;
  name: string;
  normalizedName: string;
  unitBreakdown: UnitAmount[];
  quantityDisplay: string;
  sources: string[];
  isChecked: boolean;
  isAdHoc: boolean;
  cartQuantity: number;
  createdAt: string;
  updatedAt: string;
  productMapping: ProductMapping | null;
}

export interface KrogerAccountSummary {
  id: number;
  label: string;
  isActive: boolean;
  tokenExpiresAt: number;
}

export interface KrogerStatus {
  configured: boolean;
  authenticated: boolean;
  activeAccountId: number | null;
  accounts: KrogerAccountSummary[];
  tokenExpiresAt: number | null;
  store: {
    locationId: string;
    name: string;
    address: string;
    zip: string;
  } | null;
  modality: 'PICKUP' | 'DELIVERY';
}

export interface KrogerLocation {
  locationId: string;
  name: string;
  chain: string;
  addressLine1: string;
  city: string;
  state: string;
  zipCode: string;
  fullAddress: string;
  phone: string;
}

export interface KrogerProduct {
  productId: string;
  upc: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  regularPrice: number | null;
  promoPrice: number | null;
  stockLevel: string;
}

export interface KrogerCartAddResult {
  success: boolean;
  modality: 'PICKUP' | 'DELIVERY';
  accountId?: number;
  accountLabel?: string;
  addedItems: Array<{
    groceryItemId: number;
    name: string;
    upc: string;
    description: string;
    size: string;
    quantity: number;
    modality: 'PICKUP' | 'DELIVERY';
  }>;
  skippedItems: Array<{
    groceryItemId: number;
    name: string;
    reason: string;
  }>;
  cartUrl: string;
}

export interface MealSideItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface QuickSidePreset {
  name: string;
  quantity: number;
  unit: string;
  category: 'Vegetable' | 'Side';
}

export interface MealCustomization {
  mealId: number;
  sides: MealSideItem[];
  swaps: Record<string, string>;
}

export interface CheaperAlternativeOption {
  upc: string;
  productId: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  regularPrice: number | null;
  promoPrice: number | null;
  effectivePrice: number;
  isOnSale: boolean;
  stockLevel: string;
  savingsPerUnit: number;
  totalSavings: number;
  savingsPercent: number;
}

export interface GroceryItemSavingsAlert {
  groceryItemId: number;
  itemName: string;
  normalizedName: string;
  cartQuantity: number;
  currentProduct: {
    upc: string;
    description: string;
    brand: string;
    size: string;
    regularPrice: number | null;
    promoPrice: number | null;
    effectivePrice: number;
  };
  bestAlternative: CheaperAlternativeOption;
  otherAlternatives: CheaperAlternativeOption[];
}

export interface SavingsCheckResponse {
  checkedCount: number;
  totalPotentialSavings: number;
  alerts: GroceryItemSavingsAlert[];
}

export type ScheduleEntryType = 'meal' | 'myod' | 'restaurant';

export interface ScheduleSlot {
  weekNumber: 1 | 2;
  dayOfWeek: number; // 0=Su .. 6=Sa
  entryType: ScheduleEntryType;
  mealId: number | null;
  updatedAt?: string;
}

export interface KrogerDealItem {
  id?: number;
  locationId: string;
  searchTerm: string;
  upc: string;
  productId: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  regularPrice: number;
  promoPrice: number;
  savingsAmount: number;
  savingsPercent: number;
  stockLevel: string;
  scannedAt: string;
}

export interface MatchedSaleIngredient {
  ingredientName: string;
  dealUpc: string;
  dealDescription: string;
  regularPrice: number;
  promoPrice: number;
  savingsAmount: number;
  savingsPercent: number;
}

export interface SavedMealDealSuggestion {
  mealId: number;
  mealName: string;
  imageUrl: string;
  tags: string[];
  notes: string;
  inCurrentPlan: boolean;
  matchedIngredients: MatchedSaleIngredient[];
  estimatedSavings: number;
}

export interface NewMealDealSuggestion {
  id: string;
  name: string;
  notes: string;
  tags: string[];
  ingredients: Array<{ name: string; quantity: number; unit: string }>;
  matchedIngredients: MatchedSaleIngredient[];
  estimatedSavings: number;
}

export interface KrogerDealsResponse {
  configured: boolean;
  store: KrogerStatus['store'];
  scannedAt: string | null;
  deals: KrogerDealItem[];
  savedMealSuggestions: SavedMealDealSuggestion[];
  newMealIdeas: NewMealDealSuggestion[];
}

export type ActiveTab = 'meals' | 'staples' | 'plan' | 'list' | 'kroger';
