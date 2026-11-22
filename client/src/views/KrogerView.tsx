import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ExternalLink,
  LogOut,
  MapPin,
  Minus,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingCart,
  Sparkles,
  Store,
  Tag,
  Truck,
  Unlink,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api } from '../api/client';
import type {
  CheaperAlternativeOption,
  GroceryItemSavingsAlert,
  GroceryListItem,
  KrogerAccountSummary,
  KrogerCartAddResult,
  KrogerDealsResponse,
  KrogerLocation,
  KrogerProduct,
  KrogerStatus,
  NewMealDealSuggestion,
  SavingsCheckResponse,
} from '../types';
import { KrogerBanner } from '../components/KrogerBanner';
import { KrogerDealsPanel } from '../components/KrogerDealsPanel';
import { ProductPickerModal } from '../components/ProductPickerModal';

interface KrogerViewProps {
  krogerStatus: KrogerStatus | null;
  dealsData: KrogerDealsResponse | null;
  scanningDeals: boolean;
  savingsData: SavingsCheckResponse | null;
  checkingSavings: boolean;
  initialSubTab?: 'cart' | 'deals';
  groceryItems: GroceryListItem[];
  onRefreshAll: () => Promise<void>;
  onScanDeals: () => Promise<void>;
  onCheckSavings: () => Promise<void>;
  onSwitchToAlternative: (
    item: GroceryListItem,
    alt: CheaperAlternativeOption
  ) => Promise<void>;
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
  savingsData,
  checkingSavings,
  initialSubTab = 'cart',
  groceryItems,
  onScanDeals,
  onCheckSavings,
  onSwitchToAlternative,
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
  const accounts: KrogerAccountSummary[] = krogerStatus?.accounts ?? [];
  const activeAccount =
    accounts.find((a) => a.isActive) ??
    accounts.find((a) => a.id === krogerStatus?.activeAccountId) ??
    accounts[0] ??
    null;
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

  // Multi-account state
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [newAccountLabel, setNewAccountLabel] = useState('');
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [editingAccountLabel, setEditingAccountLabel] = useState('');
  const [accountBusyId, setAccountBusyId] = useState<number | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Savings switch state
  const [switchingItemId, setSwitchingItemId] = useState<number | null>(null);

  useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  const activeItems = groceryItems.filter((item) => !item.isChecked);
  const mappedItems = activeItems.filter((item) => Boolean(item.productMapping));
  const unmappedItems = activeItems.filter((item) => !item.productMapping);

  const alertsByItemId = useMemo(() => {
    const map = new Map<number, GroceryItemSavingsAlert>();
    for (const alert of savingsData?.alerts ?? []) {
      map.set(alert.groceryItemId, alert);
    }
    return map;
  }, [savingsData]);

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

  const handleActivateAccount = async (accountId: number) => {
    setAccountError(null);
    setAccountBusyId(accountId);
    try {
      const updated = await api.activateKrogerAccount(accountId);
      onStatusChange(updated);
      setCartResult(null);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not switch Kroger account.');
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleSaveRename = async (accountId: number) => {
    const trimmed = editingAccountLabel.trim();
    if (!trimmed) return;
    setAccountError(null);
    setAccountBusyId(accountId);
    try {
      const updated = await api.renameKrogerAccount(accountId, trimmed);
      onStatusChange(updated);
      setEditingAccountId(null);
      setEditingAccountLabel('');
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not rename account.');
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleRemoveAccount = async (accountId: number) => {
    setAccountError(null);
    setAccountBusyId(accountId);
    try {
      const updated = await api.deleteKrogerAccount(accountId);
      onStatusChange(updated);
      setCartResult(null);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : 'Could not disconnect account.');
    } finally {
      setAccountBusyId(null);
    }
  };

  const handleStartAddAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!configured) return;
    const label = newAccountLabel.trim() || `Account ${accounts.length + 1}`;
    window.location.href = `/api/kroger/auth/login?label=${encodeURIComponent(label)}`;
  };

  const handleSendToCart = async () => {
    setCartError(null);
    setCartResult(null);
    setSendingCart(true);
    try {
      const result = await api.sendToKrogerCart(modality, activeAccount?.id);
      setCartResult(result);
    } catch (err) {
      setCartError(err instanceof Error ? err.message : 'Failed to send items to Kroger cart.');
    } finally {
      setSendingCart(false);
    }
  };

  const handleSwitchAlt = async (item: GroceryListItem, alt: CheaperAlternativeOption) => {
    setSwitchingItemId(item.id);
    try {
      await onSwitchToAlternative(item, alt);
    } finally {
      setSwitchingItemId(null);
    }
  };

  const canSend =
    configured && authenticated && mappedItems.length > 0 && !sendingCart;
  const canCheckSavings = configured && Boolean(savedStore) && mappedItems.length > 0;

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

        {/* Multi-Account Kroger Switcher Card */}
        <div
          id="kroger-accounts-card"
          className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 flex flex-col justify-between gap-3 shadow-[0_1px_3px_rgba(26,36,30,0.04)]"
        >
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    authenticated
                      ? 'bg-[#EBF4EF] text-[#1B5E42]'
                      : 'bg-[#F5F2EB] text-[#5C6961]'
                  }`}
                >
                  <Users className="w-4.5 h-4.5" />
                </span>
                <div>
                  <h2 className="text-sm font-bold text-[#1A241E]">Kroger Accounts</h2>
                  <p className="text-xs text-[#5C6961]">
                    {accounts.length > 1
                      ? `${accounts.length} connected · toggle which cart receives items`
                      : authenticated
                      ? `Active: ${activeAccount?.label ?? 'Primary Account'} · add a 2nd account anytime`
                      : 'Connect one or more Kroger accounts to build & order carts'}
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
                {authenticated
                  ? `${accounts.length} Connected`
                  : 'Not Connected'}
              </span>
            </div>

            {accountError && (
              <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                {accountError}
              </p>
            )}

            {/* Connected Accounts List / Switcher */}
            {accounts.length > 0 && (
              <div className="space-y-2" role="radiogroup" aria-label="Active Kroger account">
                {accounts.map((acc) => {
                  const isEditing = editingAccountId === acc.id;
                  const isBusy = accountBusyId === acc.id;
                  return (
                    <div
                      key={acc.id}
                      className={`rounded-2xl border p-2.5 transition-all ${
                        acc.isActive
                          ? 'bg-[#EBF4EF]/75 border-[#1B5E42]'
                          : 'bg-[#FAF8F4] border-[#E6E1D6] hover:border-[#C4DDD0]'
                      }`}
                    >
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void handleSaveRename(acc.id);
                          }}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="text"
                            maxLength={40}
                            autoFocus
                            value={editingAccountLabel}
                            onChange={(e) => setEditingAccountLabel(e.target.value)}
                            placeholder="Account name (e.g. Sarah's Kroger)"
                            className="flex-1 h-8 px-2.5 rounded-lg border border-[#1B5E42] bg-white text-xs text-[#1A241E] focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isBusy || !editingAccountLabel.trim()}
                            aria-label="Save account name"
                            className="w-8 h-8 rounded-lg bg-[#1B5E42] text-white flex items-center justify-center hover:bg-[#144A33] disabled:opacity-50 cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Cancel rename"
                            onClick={() => {
                              setEditingAccountId(null);
                              setEditingAccountLabel('');
                            }}
                            className="w-8 h-8 rounded-lg border border-[#E6E1D6] bg-white text-[#5C6961] flex items-center justify-center hover:bg-[#F3EFE6] cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      ) : (
                        <div className="flex items-center justify-between gap-2">
                          <button
                            type="button"
                            role="radio"
                            aria-checked={acc.isActive}
                            disabled={isBusy}
                            onClick={() => {
                              if (!acc.isActive) void handleActivateAccount(acc.id);
                            }}
                            className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer disabled:opacity-60"
                          >
                            <span
                              className={`w-4.5 h-4.5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                acc.isActive
                                  ? 'border-[#1B5E42] bg-[#1B5E42]'
                                  : 'border-[#B8B0A0] bg-white'
                              }`}
                            >
                              {acc.isActive && <Check className="w-2.5 h-2.5 text-white" />}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs sm:text-sm font-bold text-[#1A241E] truncate">
                                  {acc.label}
                                </span>
                                {acc.isActive && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-[#1B5E42] text-white text-[10px] font-bold uppercase tracking-wide">
                                    Active Cart
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              title="Rename account"
                              aria-label={`Rename ${acc.label}`}
                              onClick={() => {
                                setEditingAccountId(acc.id);
                                setEditingAccountLabel(acc.label);
                              }}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white hover:text-[#1A241E] transition-colors cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <a
                              href={`/api/kroger/auth/login?replaceId=${acc.id}&label=${encodeURIComponent(acc.label)}`}
                              title="Reconnect / refresh login"
                              aria-label={`Reconnect ${acc.label}`}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#5C6961] hover:bg-white hover:text-[#1B5E42] transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </a>
                            <button
                              type="button"
                              disabled={isBusy}
                              title="Disconnect account"
                              aria-label={`Disconnect ${acc.label}`}
                              onClick={() => void handleRemoveAccount(acc.id)}
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#85918A] hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                            >
                              <LogOut className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Connect First or Additional Kroger Account */}
          {showAddAccount || accounts.length === 0 ? (
            <form onSubmit={handleStartAddAccount} className="space-y-2 pt-1">
              <div className="flex gap-2">
                <input
                  id="kroger-account-label-input"
                  type="text"
                  maxLength={40}
                  disabled={!configured}
                  value={newAccountLabel}
                  onChange={(e) => setNewAccountLabel(e.target.value)}
                  placeholder={
                    accounts.length === 0
                      ? "Label (e.g. Primary Kroger)"
                      : "2nd account label (e.g. Sarah's Kroger)"
                  }
                  className="flex-1 h-10 px-3 rounded-xl border border-[#D8D2C5] bg-[#FAF8F4] text-xs sm:text-sm text-[#1A241E] disabled:opacity-50 focus:bg-white focus:border-[#1B5E42] focus:outline-none"
                />
                <button
                  id="kroger-connect-btn"
                  type="submit"
                  disabled={!configured}
                  className="h-10 px-3.5 rounded-xl text-xs font-semibold bg-[#1B5E42] text-white hover:bg-[#144A33] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>{accounts.length === 0 ? 'Connect' : 'Sign In'}</span>
                </button>
                {accounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowAddAccount(false);
                      setNewAccountLabel('');
                    }}
                    className="h-10 px-2.5 rounded-xl text-xs font-semibold border border-[#E6E1D6] text-[#5C6961] hover:bg-[#F3EFE6] cursor-pointer"
                  >
                    Cancel
                  </button>
                )}
              </div>
              {accounts.length > 0 && (
                <p className="text-[11px] text-[#5C6961] leading-snug">
                  Tip: Connecting a 2nd account on this device? Open PantryPilot in a private/incognito tab or on their phone so Kroger asks for their login.
                </p>
              )}
            </form>
          ) : (
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                id="kroger-add-another-btn"
                type="button"
                disabled={!configured}
                onClick={() => setShowAddAccount(true)}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-xl text-xs font-semibold border border-[#1B5E42]/30 bg-[#EBF4EF]/60 text-[#1B5E42] hover:bg-[#EBF4EF] disabled:opacity-45 transition-colors cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>Add Another Kroger Account</span>
              </button>
              <span className="text-[11px] text-[#85918A]">
                Auto-refreshes tokens
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Fulfillment Modality + Pre-Send Warning + Batch Submit */}
      <div className="bg-white rounded-3xl border border-[#E6E1D6] p-4 sm:p-5 space-y-4 shadow-[0_1px_3px_rgba(26,36,30,0.04)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#1A241E]">Fulfillment &amp; Cart Send</h2>
            <p className="text-xs text-[#5C6961] mt-0.5">
              {mappedItems.length} of {activeItems.length} active grocery items matched to Kroger products
              {activeAccount ? ` · Target account: ${activeAccount.label}` : ''}
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
              ? 'Connect a Kroger account above before sending.'
              : mappedItems.length === 0
              ? 'Match at least one item below to send to your cart.'
              : `Ready to send ${mappedItems.length} mapped ${mappedItems.length === 1 ? 'item' : 'items'} to ${activeAccount?.label ?? 'Kroger'} (${modality}).`}
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
              : activeAccount
              ? `Send ${mappedItems.length} to ${activeAccount.label}`
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
                  {cartResult.addedItems.length === 1 ? 'item' : 'items'} to{' '}
                  {cartResult.accountLabel ? `${cartResult.accountLabel}'s` : 'your'} Kroger{' '}
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

      {/* Cheaper Brands / Sale Alternatives Banner */}
      {mappedItems.length > 0 && (
        <div
          id="kroger-savings-card"
          className={`rounded-3xl border p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            (savingsData?.alerts.length ?? 0) > 0
              ? 'bg-[#FDF3EB] border-[#F0CFAF]'
              : 'bg-white border-[#E6E1D6]'
          }`}
        >
          <div className="flex items-start gap-2.5">
            <span
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                (savingsData?.alerts.length ?? 0) > 0
                  ? 'bg-[#B85D2B] text-white'
                  : 'bg-[#FDF3EB] text-[#B85D2B]'
              }`}
            >
              <Sparkles className="w-4.5 h-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-[#1A241E]">
                {(savingsData?.alerts.length ?? 0) > 0
                  ? `Save up to $${savingsData!.totalPotentialSavings.toFixed(2)} on ${savingsData!.alerts.length} matched ${savingsData!.alerts.length === 1 ? 'item' : 'items'}`
                  : 'Cheaper Brand & Sale Checker'}
              </h2>
              <p className="text-xs text-[#5C6961] mt-0.5">
                {(savingsData?.alerts.length ?? 0) > 0
                  ? 'Cheaper brands or active sale versions were found at your store — tap Switch below any highlighted item.'
                  : savingsData
                  ? `Checked ${savingsData.checkedCount} mapped items — your current selections are already the lowest-priced options.`
                  : 'Compare your mapped products against store brands and live weekly sales before sending your cart.'}
              </p>
            </div>
          </div>

          <button
            id="kroger-check-savings-btn"
            type="button"
            disabled={!canCheckSavings || checkingSavings}
            onClick={() => void onCheckSavings()}
            className="h-9 px-3.5 rounded-xl text-xs font-semibold bg-[#B85D2B] text-white hover:bg-[#9D4E23] disabled:bg-[#E8DFD3] disabled:text-[#857A6E] disabled:cursor-not-allowed transition-colors inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${checkingSavings ? 'animate-spin' : ''}`} />
            <span>{checkingSavings ? 'Checking...' : 'Check Cheaper Brands'}</span>
          </button>
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
                  const alert = alertsByItemId.get(item.id);
                  return (
                    <div key={item.id} className="p-4 space-y-2.5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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

                      {alert && (
                        <div className="rounded-2xl bg-[#FDF3EB] border border-[#F0CFAF] p-2.5 sm:px-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="min-w-0 text-xs">
                            <span className="font-bold text-[#B85D2B]">
                              {alert.bestAlternative.isOnSale
                                ? 'On-sale alternative: '
                                : 'Cheaper brand: '}
                            </span>
                            <span className="font-semibold text-[#1A241E]">
                              {alert.bestAlternative.description}
                            </span>
                            {alert.bestAlternative.size && (
                              <span className="text-[#5C6961]"> · {alert.bestAlternative.size}</span>
                            )}
                            <span className="ml-1.5 font-bold text-[#1B5E42] tabular-nums">
                              ${alert.bestAlternative.effectivePrice.toFixed(2)} (save $
                              {alert.bestAlternative.totalSavings.toFixed(2)})
                            </span>
                          </div>
                          <button
                            type="button"
                            disabled={switchingItemId === item.id}
                            onClick={() => void handleSwitchAlt(item, alert.bestAlternative)}
                            className="h-8 px-3 rounded-xl bg-[#1B5E42] text-white text-xs font-semibold hover:bg-[#144A33] disabled:opacity-50 inline-flex items-center justify-center gap-1 shrink-0 cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3 h-3" />
                            <span>{switchingItemId === item.id ? 'Switching...' : 'Switch'}</span>
                          </button>
                        </div>
                      )}
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
