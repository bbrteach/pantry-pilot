import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Link2,
  LogOut,
  MapPin,
  Minus,
  Package,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Store,
  Tag,
  Truck,
  Unlink,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  GroceryListItem,
  KrogerCartAddResult,
  KrogerDealsResponse,
  KrogerLocation,
  KrogerProduct,
  KrogerStatus,
  NewMealDealSuggestion,
} from '../types';
import { KrogerBanner } from '../components/KrogerBanner';
import { KrogerDealsPanel } from '../components/KrogerDealsPanel';
import { ProductPickerModal } from '../components/ProductPickerModal';

interface KrogerViewProps {
  krogerStatus: KrogerStatus | null;
  dealsData: KrogerDealsResponse | null;
  scanningDeals: boolean;
  initialSubTab?: 'cart' | 'deals';
  groceryItems: GroceryListItem[];
  onRefreshAll: () => Promise<void>;
  onScanDeals: () => Promise<void>;
  onAddSavedMealToPlan: (mealId: number) => void;
  onSaveAndPlanNewIdea: (idea: NewMealDealSuggestion) => Promise<void>;
  onUpdateCartQuantity: (item: GroceryListItem, nextQty: number) => Promise<void>;
  onSaveMapping: (item: GroceryListItem, product: KrogerProduct) => Promise<void>;
  onDeleteMapping: (normalizedName: string) => Promise<void>;
  onStatusChange: (status: KrogerStatus) => void;
  onGoToList: () => void;
}

export function KrogerView({
  krogerStatus,
  dealsData,
  scanningDeals,
  initialSubTab = 'cart',
  groceryItems,
  onScanDeals,
  onAddSavedMealToPlan,
  onSaveAndPlanNewIdea,
  onUpdateCartQuantity,
  onSaveMapping,
  onDeleteMapping,
  onStatusChange,
  onGoToList,
}: KrogerViewProps) {
  const configured = Boolean(krogerStatus?.configured);
  const authenticated = Boolean(krogerStatus?.authenticated);
  const savedStore = krogerStatus?.store ?? null;
  const modality = krogerStatus?.modality ?? 'PICKUP';

  const [subTab, setSubTab] = useState<'cart' | 'deals'>(initialSubTab);
  const [zip, setZip] = useState(savedStore?.zip || '');
  const [searchingStores, setSearchingStores] = useState(false);
  const [storeResults, setStoreResults] = useState<KrogerLocation[]>([]);
  const [showStoreSearch, setShowStoreSearch] = useState(!savedStore);
  const [storeError, setStoreError] = useState<string | null>(null);
  const [pickerItem, setPickerItem] = useState<GroceryListItem | null>(null);
  const [sendingCart, setSendingCart] = useState(false);
  const [cartError, setCartError] = useState<string | null>(null);
  const [cartResult, setCartResult] = useState<KrogerCartAddResult | null>(null);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const activeItems = groceryItems.filter((item) => !item.isChecked);
  const mappedItems = activeItems.filter((item) => Boolean(item.productMapping));
  const unmappedItems = activeItems.filter((item) => !item.productMapping);

  const handleStoreSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) return;
    setStoreError(null);
    setSearchingStores(true);
    try {
      const results = await api.searchKrogerLocations(zip);
      setStoreResults(results);
      if (results.length === 0) {
        setStoreError('No Kroger stores found near that ZIP code.');
      }
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Failed to search Kroger stores.');
      setStoreResults([]);
    } finally {
      setSearchingStores(false);
    }
  };

  const handleSelectStore = async (loc: KrogerLocation) => {
    setStoreError(null);
    try {
      const res = await api.saveKrogerStore({
        locationId: loc.locationId,
        name: loc.name,
        address: loc.fullAddress,
        zip: loc.zipCode || zip.trim(),
      });
      onStatusChange(res.status);
      setShowStoreSearch(false);
      setStoreResults([]);
    } catch (err) {
      setStoreError(err instanceof Error ? err.message : 'Failed to save store.');
    }
  };

  const handleModalityChange = async (next: 'PICKUP' | 'DELIVERY') => {
    if (!krogerStatus) return;
    onStatusChange({ ...krogerStatus, modality: next });
    try {
      await api.saveKrogerModality(next);
    } catch {
      // Keep UI responsive; server will persist on cart send too
    }
  };

  const handleDisconnect = async () => {
    const updated = await api.disconnectKroger();
    onStatusChange(updated);
    setCartResult(null);
  };

  const handleSendToCart = async () => {
    setCartError(null);
    setCartResult(null);
    setSendingCart(true);
    try {
      const result = await api.sendToKrogerCart(modality);
      setCartResult(result);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Failed to send items to Kroger cart.');
    } finally {
      setSendingCart(false);
    }
  };

  const canSend =
    configured && authenticated && mappedItems.length > 0 && !sendingCart;

  return (
    <section className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#1A241E]">
            {subTab === 'deals' ? 'Kroger Sales & Meal Ideas' : 'Match & Send to Kroger'}
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            {subTab === 'deals'
              ? 'Discover what is currently on sale at your local Kroger and plan meals around those deals.'
              : 'Link your grocery items to preferred Kroger UPCs once and fill your online cart in one tap.'}
          </p>
        </div>

        <button
          type="button"
          onClick={onGoToList}
          className="h-10 px-3.5 rounded-xl text-xs font-semibold bg-white border border-[#E6E1D6] text-[#1B5E42] hover:bg-[#EBF4EF] transition-colors shrink-0 cursor-pointer"
        >
          Review List
        </button>
      </div>

      {/* Sub-tab Switcher: Match & Send vs On Sale & Ideas */}
      <div
        role="tablist"
        aria-label="Kroger sections"
        className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-[#E6E1D6] max-w-md shadow-[0_1px_2px_rgba(26,36,30,0.03)]"
      >
        <button
          id="kroger-tab-cart"
          type="button"
          role="tab"
          aria-selected={subTab === 'cart'}
          onClick={() => setSubTab('cart')}
          className={`flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            subTab === 'cart'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>Match &amp; Send</span>
        </button>
        <button
          id="kroger-tab-deals"
          type="button"
          role="tab"
          aria-selected={subTab === 'deals'}
          onClick={() => setSubTab('deals')}
          className={`flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
            subTab === 'deals'
              ? 'bg-[#1B5E42] text-white shadow-xs'
              : 'text-[#5C6961] hover:text-[#1A241E]'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>On Sale &amp; Ideas</span>
          {(dealsData?.deals.length ?? 0) > 0 && (
            <span
              className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums ${
                subTab === 'deals' ? 'bg-white/20 text-white' : 'bg-[#FDF3EB] text-[#B85D2B]'
              }`}
            >
              {dealsData!.deals.length}
            </span>
          )}
        </button>
      </div>

      {subTab === 'deals' ? (
        <KrogerDealsPanel
          krogerStatus={krogerStatus}
          dealsData={dealsData}
          scanning={scanningDeals}
          onScanDeals={onScanDeals}
          onAddSavedMealToPlan={onAddSavedMealToPlan}
          onSaveAndPlanNewIdea={onSaveAndPlanNewIdea}
          onGoToStoreSetup={() => setSubTab('cart')}
        />
      ) : (
        <>
          {/* Graceful disabled banner when .env credentials are missing */}
          {!configured && <KrogerBanner krogerStatus={krogerStatus} />}

      {/* Store Selector & Account Connection */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Preferred Store Card */}
        <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 space-y-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[#EBF4EF] text-[#1B5E42] flex items-center justify-center shrink-0">
                <Store className="w-4.5 h-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#1A241E]">Preferred Kroger Store</h2>
                <p className="text-xs text-[#5C6961]">Used for local pricing &amp; stock levels</p>
              </div>
            </div>
            {savedStore && configured && (
              <button
                type="button"
                onClick={() => setShowStoreSearch((v) => !v)}
                className="text-xs font-semibold text-[#1B5E42] hover:underline cursor-pointer"
              >
                {showStoreSearch ? 'Cancel' : 'Change'}
              </button>
            )}
          </div>

          {savedStore && !showStoreSearch ? (
            <div className="p-3.5 rounded-2xl bg-[#FAF8F4] border border-[#E6E1D6]">
              <p className="text-sm font-bold text-[#1A241E]">{savedStore.name}</p>
              {savedStore.address && (
                <p className="text-xs text-[#5C6961] mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 shrink-0" />
                  <span>{savedStore.address}</span>
                </p>
              )}
              <p className="text-[11px] text-[#85918A] font-mono mt-1">
                Location ID: {savedStore.locationId}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              <form onSubmit={handleStoreSearch} className="flex gap-2">
                <input
                  id="kroger-zip-input"
                  type="text"
                  inputMode="numeric"
                  maxLength={5}
                  disabled={!configured}
                  placeholder="Enter 5-digit ZIP (e.g. 45202)"
                  value={zip}
                  onChange={(e) => setZip(e.target.value.replace(/[^\d]/g, ''))}
                  className="flex-1 h-10 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-sm text-[#1A241E] disabled:opacity-50 focus:bg-white focus:border-[#1B5E42] focus:outline-none"
                />
                <button
                  id="kroger-zip-search-btn"
                  type="submit"
                  disabled={!configured || searchingStores || zip.length !== 5}
                  className="h-10 px-4 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold hover:bg-[#144A33] disabled:opacity-45 transition-colors inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <Search className="w-3.5 h-3.5" />
                  {searchingStores ? 'Finding...' : 'Find'}
                </button>
              </form>

              {storeError && (
                <p className="text-xs font-medium text-red-700">{storeError}</p>
              )}

              {storeResults.length > 0 && (
                <div className="max-h-52 overflow-y-auto divide-y divide-[#F0ECE3] rounded-2xl border border-[#E6E1D6]">
                  {storeResults.map((loc) => (
                    <button
                      key={loc.locationId}
                      type="button"
                      onClick={() => void handleSelectStore(loc)}
                      className="w-full text-left p-3 hover:bg-[#EBF4EF]/60 transition-colors cursor-pointer"
                    >
                      <p className="text-xs font-bold text-[#1A241E]">{loc.name}</p>
                      <p className="text-[11px] text-[#5C6961] mt-0.5">{loc.fullAddress}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Kroger OAuth Account Card */}
        <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 flex flex-col justify-between gap-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  authenticated
                    ? 'bg-[#EBF4EF] text-[#1B5E42]'
                    : 'bg-[#F5F2EB] text-[#5C6961]'
                }`}
              >
                <Link2 className="w-4.5 h-4.5" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-[#1A241E]">Kroger Account</h2>
                <p className="text-xs text-[#5C6961]">
                  {authenticated
                    ? 'Connected · auto-refreshes rotating tokens'
                    : 'Sign in with Kroger to add items to your cart'}
                </p>
              </div>
            </div>

            <span
              className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                authenticated
                  ? 'bg-[#EBF4EF] text-[#1B5E42]'
                  : 'bg-[#F5F2EB] text-[#5C6961]'
              }`}
            >
              {authenticated ? 'Connected' : 'Not Connected'}
            </span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            {authenticated ? (
              <>
                <a
                  href="/api/kroger/auth/login"
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold border border-[#E6E1D6] text-[#1A241E] hover:bg-[#F3EFE6] transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reconnect
                </a>
                <button
                  type="button"
                  onClick={() => void handleDisconnect()}
                  className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Disconnect
                </button>
              </>
            ) : (
              <button
                id="kroger-connect-btn"
                type="button"
                disabled={!configured}
                onClick={() => {
                  window.location.href = '/api/kroger/auth/login';
                }}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl text-xs sm:text-sm font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ShoppingCart className="w-4 h-4" />
                Connect Kroger Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Fulfillment Modality + Pre-Send Warning + Batch Submit */}
      <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 space-y-4 shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A241E]">Fulfillment &amp; Cart Send</h2>
            <p className="text-xs text-[#5C6961] mt-0.5">
              {mappedItems.length} of {activeItems.length} active grocery items matched to Kroger products
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Fulfillment modality"
            className="inline-flex rounded-xl bg-[#FAF8F4] border border-[#E6E1D6] p-1 self-start sm:self-auto"
          >
            <button
              id="modality-pickup-btn"
              type="button"
              role="radio"
              aria-checked={modality === 'PICKUP'}
              onClick={() => void handleModalityChange('PICKUP')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modality === 'PICKUP'
                  ? 'bg-[#1B5E42] text-white shadow-xs'
                  : 'text-[#5C6961] hover:text-[#1A241E]'
              }`}
            >
              <Store className="w-3.5 h-3.5" />
              PICKUP
            </button>
            <button
              id="modality-delivery-btn"
              type="button"
              role="radio"
              aria-checked={modality === 'DELIVERY'}
              onClick={() => void handleModalityChange('DELIVERY')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                modality === 'DELIVERY'
                  ? 'bg-[#1B5E42] text-white shadow-xs'
                  : 'text-[#5C6961] hover:text-[#1A241E]'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              DELIVERY
            </button>
          </div>
        </div>

        {/* Mandatory Pre-Send Warning Banner */}
        <div
          id="kroger-presend-warning"
          className="rounded-2xl border border-amber-300/80 bg-amber-50 p-3.5 flex items-start gap-2.5"
        >
          <AlertTriangle className="w-4.5 h-4.5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm font-medium text-amber-900 leading-relaxed">
            Kroger&apos;s API adds items to your existing cart and cannot remove old items.
            Double-check your list here before sending.
          </p>
        </div>

        {cartError && (
          <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs sm:text-sm font-medium">
            {cartError}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <p className="text-xs text-[#5C6961]">
            {!configured
              ? 'Add Kroger API credentials to .env to enable sending.'
              : !authenticated
              ? 'Connect your Kroger account above before sending.'
              : mappedItems.length === 0
              ? 'Match at least one item below to send to your cart.'
              : `Ready to send ${mappedItems.length} mapped ${mappedItems.length === 1 ? 'item' : 'items'} for ${modality}.`}
          </p>
          <button
            id="send-to-kroger-cart-btn"
            type="button"
            disabled={!canSend}
            onClick={() => void handleSendToCart()}
            className="h-11 px-5 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer shrink-0"
          >
            <ShoppingCart className="w-4 h-4" />
            {sendingCart
              ? 'Sending to Kroger...'
              : `Send ${mappedItems.length} ${mappedItems.length === 1 ? 'Item' : 'Items'} to Kroger Cart`}
          </button>
        </div>
      </div>

      {/* Post-Send Summary */}
      {cartResult && (
        <div
          id="kroger-cart-summary"
          className="bg-[#EBF4EF] rounded-3xl border border-[#C4DDD0] p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 className="w-5 h-5 text-[#1B5E42] shrink-0 mt-0.5" />
              <div>
                <h2 className="text-base font-bold text-[#144A33]">
                  Added {cartResult.addedItems.length}{' '}
                  {cartResult.addedItems.length === 1 ? 'item' : 'items'} to your Kroger{' '}
                  {cartResult.modality} cart
                </h2>
                <p className="text-xs text-[#2D5E47] mt-0.5">
                  {cartResult.skippedItems.length > 0
                    ? `${cartResult.skippedItems.length} unmapped items were skipped.`
                    : 'All active grocery list items were added.'}
                </p>
              </div>
            </div>

            <a
              id="open-kroger-cart-link"
              href={cartResult.cartUrl || 'https://www.kroger.com/cart'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] transition-colors shadow-xs shrink-0"
            >
              <span>Open Kroger Cart to Review &amp; Checkout</span>
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="bg-white rounded-2xl border border-[#C4DDD0] p-3.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#1B5E42] mb-2">
                Added ({cartResult.addedItems.length})
              </p>
              <ul className="space-y-1.5 text-xs text-[#1A241E]">
                {cartResult.addedItems.map((added) => (
                  <li key={`${added.groceryItemId}-${added.upc}`} className="flex justify-between gap-2">
                    <span className="truncate font-medium">{added.description}</span>
                    <span className="font-bold tabular-nums shrink-0 text-[#1B5E42]">
                      ×{added.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {cartResult.skippedItems.length > 0 && (
              <div className="bg-white rounded-2xl border border-[#F0CFAF] p-3.5">
                <p className="text-xs font-bold uppercase tracking-wider text-[#B85D2B] mb-2">
                  Skipped / Unmapped ({cartResult.skippedItems.length})
                </p>
                <ul className="space-y-1.5 text-xs text-[#5C6961]">
                  {cartResult.skippedItems.map((skipped) => (
                    <li key={skipped.groceryItemId} className="flex justify-between gap-2">
                      <span className="font-medium text-[#1A241E]">{skipped.name}</span>
                      <span className="text-[11px]">{skipped.reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Grocery Items Product Matching List */}
      {activeItems.length === 0 ? (
        <div className="rounded-3xl bg-white border border-[#E6E1D6] p-10 text-center">
          <Package className="w-8 h-8 text-[#1B5E42] mx-auto mb-2.5" />
          <h2 className="text-base font-bold text-[#1A241E]">No active grocery items</h2>
          <p className="text-sm text-[#5C6961] mt-1">
            Generate or review your grocery list first, then come here to match products to Kroger.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {unmappedItems.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#85918A] px-1">
                Needs Product Match ({unmappedItems.length})
              </h2>
              <div className="bg-white rounded-3xl border border-[#E6E1D6] divide-y divide-[#F0ECE3] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
                {unmappedItems.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#1A241E]">{item.name}</span>
                        <span className="px-2 py-0.5 rounded-lg text-xs font-semibold bg-[#FAF8F4] border border-[#E6E1D6] text-[#5C6961] tabular-nums">
                          {item.quantityDisplay}
                        </span>
                      </div>
                      <p className="text-xs text-[#85918A] mt-0.5">
                        Not mapped yet · select once to auto-match future lists
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={!configured || !savedStore}
                      onClick={() => setPickerItem(item)}
                      title={
                        !configured
                          ? 'Add Kroger API credentials to .env to enable'
                          : !savedStore
                          ? 'Select a Kroger store first'
                          : `Find Kroger product for ${item.name}`
                      }
                      className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors shrink-0 cursor-pointer"
                    >
                      Find Product
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {mappedItems.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-[#1B5E42] px-1">
                Auto-Matched &amp; Ready for Cart ({mappedItems.length})
              </h2>
              <div className="bg-white rounded-3xl border border-[#C4DDD0] divide-y divide-[#F0ECE3] overflow-hidden shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
                {mappedItems.map((item) => {
                  const map = item.productMapping!;
                  const hasPromo =
                    map.promoPrice !== null &&
                    map.lastPrice !== null &&
                    map.promoPrice < map.lastPrice;
                  return (
                    <div
                      key={item.id}
                      className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className="w-14 h-14 rounded-xl bg-[#FAF8F4] border border-[#ECE7DC] flex items-center justify-center overflow-hidden shrink-0">
                          {map.imageUrl ? (
                            <img
                              src={map.imageUrl}
                              alt={map.description}
                              className="w-full h-full object-contain p-1"
                            />
                          ) : (
                            <Package className="w-5 h-5 text-[#85918A]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold uppercase tracking-wide text-[#1B5E42]">
                              {item.name} ({item.quantityDisplay})
                            </span>
                          </div>
                          <p className="text-sm font-bold text-[#1A241E] leading-snug mt-0.5">
                            {map.description}
                          </p>
                          <div className="flex items-center gap-2 flex-wrap text-xs text-[#5C6961] mt-0.5">
                            {[map.brand, map.size].filter(Boolean).join(' · ') && (
                              <span>{[map.brand, map.size].filter(Boolean).join(' · ')}</span>
                            )}
                            {hasPromo ? (
                              <span className="font-bold text-[#B85D2B] tabular-nums">
                                ${map.promoPrice!.toFixed(2)}{' '}
                                <span className="text-[#85918A] line-through font-normal">
                                  ${map.lastPrice!.toFixed(2)}
                                </span>
                              </span>
                            ) : map.lastPrice !== null ? (
                              <span className="font-semibold text-[#1A241E] tabular-nums">
                                ${map.lastPrice.toFixed(2)}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                        <div className="inline-flex items-center gap-1 rounded-xl border border-[#E6E1D6] bg-[#FAF8F4] p-0.5">
                          <button
                            type="button"
                            aria-label={`Decrease cart count for ${item.name}`}
                            onClick={() =>
                              void onUpdateCartQuantity(
                                item,
                                Math.max(1, item.cartQuantity - 1)
                              )
                            }
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="min-w-[28px] text-center text-xs font-bold tabular-nums text-[#1A241E]">
                            {item.cartQuantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase cart count for ${item.name}`}
                            onClick={() =>
                              void onUpdateCartQuantity(item, item.cartQuantity + 1)
                            }
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <button
                          type="button"
                          disabled={!configured || !savedStore}
                          onClick={() => setPickerItem(item)}
                          className="h-9 px-3 rounded-xl text-xs font-semibold border border-[#E6E1D6] text-[#1A241E] hover:bg-[#F3EFE6] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          Change product
                        </button>

                        <button
                          type="button"
                          aria-label={`Clear mapping for ${item.name}`}
                          onClick={() => void onDeleteMapping(item.normalizedName)}
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-[#85918A] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                        >
                          <Unlink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
        </>
      )}

      <ProductPickerModal
        item={pickerItem}
        onClose={() => setPickerItem(null)}
        onSelectProduct={onSaveMapping}
      />
    </section>
  );
}
