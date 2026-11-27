import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/database.js';
import {
  compareAlternativeForSameQuantity,
  parseProductSize,
} from './productSize.js';

export type FulfillmentModality = 'PICKUP' | 'DELIVERY';

export interface StoredKrogerStore {
  locationId: string;
  name: string;
  address: string;
  zip: string;
}

export interface KrogerLocationResult {
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

export interface KrogerProductResult {
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

export interface ProductMappingRecord {
  normalizedName: string;
  upc: string;
  productId: string;
  description: string;
  brand: string;
  size: string;
  imageUrl: string;
  lastPrice: number | null;
  promoPrice: number | null;
  updatedAt: string;
}

export interface KrogerAccountRow {
  id: number;
  label: string;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_at: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface KrogerAccountSummary {
  id: number;
  label: string;
  isActive: boolean;
  tokenExpiresAt: number;
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
  recommendedCartQuantity: number;
  totalAlternativeCost: number;
  currentTotalCost: number;
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

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
}

interface PendingOAuthState {
  expiresAt: number;
  accountLabel: string;
  replaceAccountId?: number;
}

export class KrogerApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = 'KROGER_ERROR') {
    super(message);
    this.name = 'KrogerApiError';
    this.status = status;
    this.code = code;
  }
}

// In-memory cache for Client Credentials token (no refresh token needed)
let clientTokenCache: { accessToken: string; expiresAt: number } | null = null;

// Per-account single-flight lock so concurrent requests never double-spend a rotating refresh token
const inFlightUserRefreshes = new Map<number, Promise<string>>();

// Short-lived CSRF states for OAuth2 Authorization Code flow
const pendingOAuthStates = new Map<string, PendingOAuthState>();
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export function resetKrogerServiceCaches(): void {
  clientTokenCache = null;
  inFlightUserRefreshes.clear();
  pendingOAuthStates.clear();
}

export function isKrogerConfigured(): boolean {
  return Boolean(config.kroger.clientId && config.kroger.clientSecret);
}

function assertConfigured(): void {
  if (!isKrogerConfigured()) {
    throw new KrogerApiError(
      'Kroger API credentials are not configured. Add KROGER_CLIENT_ID and KROGER_CLIENT_SECRET to .env.',
      503,
      'KROGER_NOT_CONFIGURED'
    );
  }
}

export function getBasicAuthHeader(): string {
  assertConfigured();
  const raw = `${config.kroger.clientId}:${config.kroger.clientSecret}`;
  return `Basic ${Buffer.from(raw, 'utf8').toString('base64')}`;
}

function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row ? row.value : null;
}

function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  ).run(key, value);
}

export function getSavedStore(): StoredKrogerStore | null {
  const locationId = getSetting('kroger_location_id');
  if (!locationId) return null;
  return {
    locationId,
    name: getSetting('kroger_store_name') || 'Kroger Store',
    address: getSetting('kroger_store_address') || '',
    zip: getSetting('kroger_zip') || '',
  };
}

export function saveStore(store: StoredKrogerStore): StoredKrogerStore {
  const tx = db.transaction(() => {
    setSetting('kroger_location_id', store.locationId.trim());
    setSetting('kroger_store_name', store.name.trim());
    setSetting('kroger_store_address', store.address.trim());
    setSetting('kroger_zip', store.zip.trim());
  });
  tx();
  return getSavedStore()!;
}

export function getSavedModality(): FulfillmentModality {
  const val = getSetting('kroger_modality');
  return val === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
}

export function saveModality(modality: FulfillmentModality): FulfillmentModality {
  const normalized: FulfillmentModality = modality === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
  setSetting('kroger_modality', normalized);
  return normalized;
}

// --- Multi-Account Kroger Token Management ---

export function listKrogerAccounts(): KrogerAccountRow[] {
  return db
    .prepare(
      `SELECT id, label, access_token, refresh_token, token_type, scope, expires_at, is_active, created_at, updated_at
       FROM kroger_accounts
       ORDER BY id ASC`
    )
    .all() as KrogerAccountRow[];
}

export function getKrogerAccountById(accountId: number): KrogerAccountRow | null {
  const row = db
    .prepare(
      `SELECT id, label, access_token, refresh_token, token_type, scope, expires_at, is_active, created_at, updated_at
       FROM kroger_accounts
       WHERE id = ?`
    )
    .get(accountId) as KrogerAccountRow | undefined;
  return row ?? null;
}

export function getActiveKrogerAccount(): KrogerAccountRow | null {
  const active = db
    .prepare(
      `SELECT id, label, access_token, refresh_token, token_type, scope, expires_at, is_active, created_at, updated_at
       FROM kroger_accounts
       WHERE is_active = 1
       ORDER BY id ASC
       LIMIT 1`
    )
    .get() as KrogerAccountRow | undefined;

  if (active) return active;

  const first = db
    .prepare(
      `SELECT id, label, access_token, refresh_token, token_type, scope, expires_at, is_active, created_at, updated_at
       FROM kroger_accounts
       ORDER BY id ASC
       LIMIT 1`
    )
    .get() as KrogerAccountRow | undefined;

  if (first) {
    db.prepare('UPDATE kroger_accounts SET is_active = 1 WHERE id = ?').run(first.id);
    return { ...first, is_active: 1 };
  }

  return null;
}

/** Backwards-compatible helper returning the active account's token row */
export function getStoredUserToken(accountId?: number): KrogerAccountRow | null {
  if (typeof accountId === 'number' && Number.isInteger(accountId) && accountId > 0) {
    return getKrogerAccountById(accountId);
  }
  return getActiveKrogerAccount();
}

export function saveUserTokens(tokenData: {
  accountId?: number;
  label?: string;
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
  makeActive?: boolean;
}): KrogerAccountRow {
  const tx = db.transaction(() => {
    const existing =
      typeof tokenData.accountId === 'number'
        ? getKrogerAccountById(tokenData.accountId)
        : null;

    if (existing) {
      if (tokenData.makeActive) {
        db.prepare('UPDATE kroger_accounts SET is_active = 0').run();
      }
      db.prepare(
        `UPDATE kroger_accounts
         SET label = ?, access_token = ?, refresh_token = ?, token_type = ?, scope = ?, expires_at = ?,
             is_active = CASE WHEN ? = 1 THEN 1 ELSE is_active END,
             updated_at = datetime('now')
         WHERE id = ?`
      ).run(
        tokenData.label?.trim() || existing.label,
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.tokenType,
        tokenData.scope,
        tokenData.expiresAt,
        tokenData.makeActive ? 1 : 0,
        existing.id
      );
      return getKrogerAccountById(existing.id)!;
    }

    const existingAccounts = listKrogerAccounts();
    const defaultLabel =
      tokenData.label?.trim() ||
      (existingAccounts.length === 0
        ? 'Account 1'
        : `Account ${existingAccounts.length + 1}`);

    const shouldActivate = tokenData.makeActive !== false;
    if (shouldActivate) {
      db.prepare('UPDATE kroger_accounts SET is_active = 0').run();
    }

    const res = db
      .prepare(
        `INSERT INTO kroger_accounts
          (label, access_token, refresh_token, token_type, scope, expires_at, is_active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(
        defaultLabel,
        tokenData.accessToken,
        tokenData.refreshToken,
        tokenData.tokenType,
        tokenData.scope,
        tokenData.expiresAt,
        shouldActivate ? 1 : 0
      );

    return getKrogerAccountById(Number(res.lastInsertRowid))!;
  });

  return tx();
}

export function setActiveKrogerAccount(accountId: number): KrogerAccountRow {
  const existing = getKrogerAccountById(accountId);
  if (!existing) {
    throw new KrogerApiError('Kroger account not found.', 404, 'ACCOUNT_NOT_FOUND');
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE kroger_accounts SET is_active = 0').run();
    db.prepare("UPDATE kroger_accounts SET is_active = 1, updated_at = datetime('now') WHERE id = ?").run(
      accountId
    );
  });
  tx();
  return getKrogerAccountById(accountId)!;
}

export function renameKrogerAccount(accountId: number, label: string): KrogerAccountRow {
  const clean = label.trim();
  if (!clean) {
    throw new KrogerApiError('Account label cannot be empty.', 400, 'INVALID_LABEL');
  }
  const existing = getKrogerAccountById(accountId);
  if (!existing) {
    throw new KrogerApiError('Kroger account not found.', 404, 'ACCOUNT_NOT_FOUND');
  }
  db.prepare("UPDATE kroger_accounts SET label = ?, updated_at = datetime('now') WHERE id = ?").run(
    clean.slice(0, 40),
    accountId
  );
  return getKrogerAccountById(accountId)!;
}

export function deleteKrogerAccount(accountId: number): void {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM kroger_accounts WHERE id = ?').run(accountId);
    const remaining = listKrogerAccounts();
    if (remaining.length > 0 && !remaining.some((a) => a.is_active === 1)) {
      db.prepare('UPDATE kroger_accounts SET is_active = 1 WHERE id = ?').run(remaining[0].id);
    }
  });
  tx();
}

export function clearUserTokens(): void {
  db.prepare('DELETE FROM kroger_accounts').run();
  db.prepare('DELETE FROM kroger_tokens').run();
}

export function getKrogerStatus() {
  const accounts = listKrogerAccounts();
  const active = getActiveKrogerAccount();
  const summaries: KrogerAccountSummary[] = accounts.map((a) => ({
    id: a.id,
    label: a.label,
    isActive: active ? a.id === active.id : false,
    tokenExpiresAt: a.expires_at,
  }));

  return {
    configured: isKrogerConfigured(),
    authenticated: Boolean(active && active.refresh_token),
    activeAccountId: active ? active.id : null,
    accounts: summaries,
    tokenExpiresAt: active ? active.expires_at : null,
    store: getSavedStore(),
    modality: getSavedModality(),
  };
}

/**
 * 1. Client Credentials OAuth2 flow (scope=product.compact)
 * Used for store search & catalog browsing before user login.
 */
export async function getClientCredentialsToken(forceRefresh = false): Promise<string> {
  assertConfigured();

  if (
    !forceRefresh &&
    clientTokenCache &&
    Date.now() < clientTokenCache.expiresAt - TOKEN_EXPIRY_BUFFER_MS
  ) {
    return clientTokenCache.accessToken;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'product.compact',
  });

  const response = await fetch(`${config.kroger.baseUrl}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new KrogerApiError(
      `Kroger client authentication failed (${response.status}): ${errText || response.statusText}`,
      response.status === 401 ? 401 : 502,
      'KROGER_CLIENT_AUTH_FAILED'
    );
  }

  const data = (await response.json()) as OAuthTokenResponse;
  if (!data.access_token) {
    throw new KrogerApiError('Kroger OAuth response missing access_token.', 502, 'KROGER_INVALID_TOKEN');
  }

  const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 1800;
  clientTokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + expiresInSec * 1000,
  };

  return clientTokenCache.accessToken;
}

/**
 * 2. Authorization Code OAuth2 flow (scope=product.compact cart.basic:write)
 */
export function buildAuthorizationUrl(options?: {
  accountLabel?: string;
  replaceAccountId?: number;
}): { url: string; state: string } {
  assertConfigured();

  const now = Date.now();
  for (const [k, entry] of pendingOAuthStates.entries()) {
    if (entry.expiresAt < now) pendingOAuthStates.delete(k);
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingOAuthStates.set(state, {
    expiresAt: now + STATE_TTL_MS,
    accountLabel: (options?.accountLabel || '').trim().slice(0, 40),
    replaceAccountId: options?.replaceAccountId,
  });

  const params = new URLSearchParams({
    scope: 'product.compact cart.basic:write',
    response_type: 'code',
    client_id: config.kroger.clientId,
    redirect_uri: config.kroger.redirectUri,
    state,
  });

  return {
    url: `${config.kroger.baseUrl}/connect/oauth2/authorize?${params.toString()}`,
    state,
  };
}

export function consumeOAuthStateMeta(state: string): PendingOAuthState | null {
  const entry = pendingOAuthStates.get(state);
  if (!entry) return null;
  pendingOAuthStates.delete(state);
  if (Date.now() > entry.expiresAt) return null;
  return entry;
}

export function consumeOAuthState(state: string): boolean {
  return consumeOAuthStateMeta(state) !== null;
}

export async function exchangeAuthorizationCode(
  code: string,
  options?: { accountLabel?: string; replaceAccountId?: number }
): Promise<KrogerAccountRow> {
  assertConfigured();

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.kroger.redirectUri,
  });

  const response = await fetch(`${config.kroger.baseUrl}/connect/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new KrogerApiError(
      `Kroger authorization code exchange failed (${response.status}): ${errText || response.statusText}`,
      502,
      'KROGER_CODE_EXCHANGE_FAILED'
    );
  }

  const data = (await response.json()) as OAuthTokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new KrogerApiError(
      'Kroger OAuth token response did not include access_token and refresh_token.',
      502,
      'KROGER_INVALID_TOKEN'
    );
  }

  const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 1800;
  return saveUserTokens({
    accountId: options?.replaceAccountId,
    label: options?.accountLabel,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || 'bearer',
    scope: data.scope || 'product.compact cart.basic:write',
    expiresAt: Date.now() + expiresInSec * 1000,
    makeActive: true,
  });
}

/**
 * Refreshes an expired user OAuth2 token (30-min TTL) for a specific account and
 * IMMEDIATELY overwrites that account's rotating refresh_token in SQLite.
 */
export async function refreshUserAccessToken(accountId?: number): Promise<string> {
  assertConfigured();

  const target = getStoredUserToken(accountId);
  if (!target || !target.refresh_token) {
    throw new KrogerApiError(
      'Your Kroger account is not connected. Please connect a Kroger account first.',
      401,
      'KROGER_AUTH_REQUIRED'
    );
  }

  const existingPromise = inFlightUserRefreshes.get(target.id);
  if (existingPromise) {
    return existingPromise;
  }

  const refreshPromise = (async () => {
    const current = getKrogerAccountById(target.id);
    if (!current || !current.refresh_token) {
      throw new KrogerApiError(
        'Selected Kroger account is no longer connected.',
        401,
        'KROGER_AUTH_REQUIRED'
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: current.refresh_token,
    });

    const response = await fetch(`${config.kroger.baseUrl}/connect/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: getBasicAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 401) {
        deleteKrogerAccount(current.id);
        throw new KrogerApiError(
          `Your Kroger session for "${current.label}" expired. Please reconnect that account.`,
          401,
          'KROGER_REAUTH_REQUIRED'
        );
      }
      throw new KrogerApiError(
        `Failed to refresh Kroger access token (${response.status}): ${errText || response.statusText}`,
        502,
        'KROGER_REFRESH_FAILED'
      );
    }

    const data = (await response.json()) as OAuthTokenResponse;
    if (!data.access_token) {
      throw new KrogerApiError('Refresh response missing access_token.', 502, 'KROGER_INVALID_TOKEN');
    }

    const expiresInSec = typeof data.expires_in === 'number' && data.expires_in > 0 ? data.expires_in : 1800;
    const rotatedRefreshToken = data.refresh_token || current.refresh_token;

    // Immediately overwrite stored rotating refresh_token for this exact account
    saveUserTokens({
      accountId: current.id,
      label: current.label,
      accessToken: data.access_token,
      refreshToken: rotatedRefreshToken,
      tokenType: data.token_type || current.token_type || 'bearer',
      scope: data.scope || current.scope,
      expiresAt: Date.now() + expiresInSec * 1000,
      makeActive: false,
    });

    return data.access_token;
  })();

  inFlightUserRefreshes.set(target.id, refreshPromise);
  try {
    return await refreshPromise;
  } finally {
    inFlightUserRefreshes.delete(target.id);
  }
}

export async function getValidUserAccessToken(accountId?: number): Promise<string> {
  assertConfigured();
  const stored = getStoredUserToken(accountId);
  if (!stored) {
    throw new KrogerApiError(
      'Connect a Kroger account before adding items to your cart.',
      401,
      'KROGER_AUTH_REQUIRED'
    );
  }

  if (Date.now() >= stored.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
    return refreshUserAccessToken(stored.id);
  }

  return stored.access_token;
}

/**
 * 3. Store Search via GET /v1/locations?filter.zipCode.near={zip}&filter.chain=Kroger
 */
export async function searchLocationsByZip(zip: string): Promise<KrogerLocationResult[]> {
  assertConfigured();
  const cleanZip = zip.trim();
  if (!/^\d{5}$/.test(cleanZip)) {
    throw new KrogerApiError('Please enter a valid 5-digit US ZIP code.', 400, 'INVALID_ZIP');
  }

  const token = await getClientCredentialsToken();
  const params = new URLSearchParams({
    'filter.zipCode.near': cleanZip,
    'filter.chain': 'Kroger',
    'filter.limit': '10',
  });

  const response = await fetch(`${config.kroger.baseUrl}/locations?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new KrogerApiError(
      `Kroger store lookup failed (${response.status}): ${errText || response.statusText}`,
      502,
      'KROGER_LOCATIONS_FAILED'
    );
  }

  const json = (await response.json()) as {
    data?: Array<{
      locationId?: string;
      name?: string;
      chain?: string;
      phone?: string;
      address?: {
        addressLine1?: string;
        city?: string;
        state?: string;
        zipCode?: string;
      };
    }>;
  };

  return (json.data || [])
    .filter((loc) => Boolean(loc.locationId))
    .map((loc) => {
      const line1 = loc.address?.addressLine1 || '';
      const city = loc.address?.city || '';
      const state = loc.address?.state || '';
      const zipCode = loc.address?.zipCode || '';
      const fullAddress = [line1, [city, state].filter(Boolean).join(', '), zipCode]
        .filter(Boolean)
        .join(' · ');

      return {
        locationId: loc.locationId!,
        name: loc.name || 'Kroger',
        chain: loc.chain || 'Kroger',
        addressLine1: line1,
        city,
        state,
        zipCode,
        fullAddress,
        phone: loc.phone || '',
      };
    });
}

function pickBestProductImage(
  images?: Array<{
    perspective?: string;
    featured?: boolean;
    sizes?: Array<{ size?: string; url?: string }>;
  }>
): string {
  if (!Array.isArray(images) || images.length === 0) return '';
  const preferred =
    images.find((img) => img.featured) ||
    images.find((img) => img.perspective === 'front') ||
    images[0];
  const sizes = preferred?.sizes || [];
  const chosen =
    sizes.find((s) => s.size === 'medium') ||
    sizes.find((s) => s.size === 'large') ||
    sizes.find((s) => s.size === 'small') ||
    sizes[0];
  return chosen?.url || '';
}

/**
 * 4. Product Search via GET /v1/products?filter.term={term}&filter.locationId={locationId}&filter.limit=6
 */
export async function searchProducts(
  term: string,
  locationId: string,
  limit = 6
): Promise<KrogerProductResult[]> {
  assertConfigured();
  const cleanTerm = term.trim();
  if (cleanTerm.length < 2) {
    throw new KrogerApiError('Search term must be at least 2 characters.', 400, 'INVALID_TERM');
  }
  if (!locationId.trim()) {
    throw new KrogerApiError(
      'Select a preferred Kroger store before searching products.',
      400,
      'STORE_REQUIRED'
    );
  }

  const token = await getClientCredentialsToken();
  const params = new URLSearchParams({
    'filter.term': cleanTerm,
    'filter.locationId': locationId.trim(),
    'filter.limit': String(Math.min(Math.max(1, limit), 12)),
  });

  const response = await fetch(`${config.kroger.baseUrl}/products?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new KrogerApiError(
      `Kroger product search failed (${response.status}): ${errText || response.statusText}`,
      502,
      'KROGER_PRODUCTS_FAILED'
    );
  }

  const json = (await response.json()) as {
    data?: Array<{
      productId?: string;
      upc?: string;
      description?: string;
      brand?: string;
      images?: Array<{
        perspective?: string;
        featured?: boolean;
        sizes?: Array<{ size?: string; url?: string }>;
      }>;
      items?: Array<{
        size?: string;
        price?: { regular?: number; promo?: number };
        inventory?: { stockLevel?: string };
      }>;
    }>;
  };

  return (json.data || [])
    .filter((p) => Boolean(p.upc))
    .map((p) => {
      const primaryItem = p.items?.[0];
      const regular =
        typeof primaryItem?.price?.regular === 'number' && primaryItem.price.regular > 0
          ? primaryItem.price.regular
          : null;
      const promo =
        typeof primaryItem?.price?.promo === 'number' && primaryItem.price.promo > 0
          ? primaryItem.price.promo
          : null;

      return {
        productId: p.productId || p.upc!,
        upc: p.upc!,
        description: p.description || 'Kroger Product',
        brand: p.brand || '',
        size: primaryItem?.size || '',
        imageUrl: pickBestProductImage(p.images),
        regularPrice: regular,
        promoPrice: promo,
        stockLevel: primaryItem?.inventory?.stockLevel || 'UNKNOWN',
      };
    });
}

/**
 * 5. Permanent Product-to-UPC Mappings in SQLite
 */
export function listProductMappings(): ProductMappingRecord[] {
  const rows = db
    .prepare(
      `SELECT normalized_name, upc, product_id, description, brand, size, image_url, last_price, promo_price, updated_at
       FROM product_mappings
       ORDER BY normalized_name COLLATE NOCASE ASC`
    )
    .all() as Array<{
    normalized_name: string;
    upc: string;
    product_id: string;
    description: string;
    brand: string;
    size: string;
    image_url: string;
    last_price: number | null;
    promo_price: number | null;
    updated_at: string;
  }>;

  return rows.map((r) => ({
    normalizedName: r.normalized_name,
    upc: r.upc,
    productId: r.product_id,
    description: r.description,
    brand: r.brand,
    size: r.size,
    imageUrl: r.image_url,
    lastPrice: r.last_price,
    promoPrice: r.promo_price,
    updatedAt: r.updated_at,
  }));
}

export function upsertProductMapping(input: {
  normalizedName: string;
  upc: string;
  productId?: string;
  description: string;
  brand?: string;
  size?: string;
  imageUrl?: string;
  lastPrice?: number | null;
  promoPrice?: number | null;
}): ProductMappingRecord {
  const normalizedName = input.normalizedName.trim().toLowerCase().replace(/\s+/g, ' ');
  db.prepare(
    `INSERT INTO product_mappings
      (normalized_name, upc, product_id, description, brand, size, image_url, last_price, promo_price, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(normalized_name) DO UPDATE SET
       upc = excluded.upc,
       product_id = excluded.product_id,
       description = excluded.description,
       brand = excluded.brand,
       size = excluded.size,
       image_url = excluded.image_url,
       last_price = excluded.last_price,
       promo_price = excluded.promo_price,
       updated_at = datetime('now')`
  ).run(
    normalizedName,
    input.upc.trim(),
    (input.productId || '').trim(),
    input.description.trim(),
    (input.brand || '').trim(),
    (input.size || '').trim(),
    (input.imageUrl || '').trim(),
    input.lastPrice ?? null,
    input.promoPrice ?? null
  );

  return listProductMappings().find((m) => m.normalizedName === normalizedName)!;
}

export function deleteProductMapping(normalizedName: string): boolean {
  const key = normalizedName.trim().toLowerCase().replace(/\s+/g, ' ');
  const result = db.prepare('DELETE FROM product_mappings WHERE normalized_name = ?').run(key);
  return result.changes > 0;
}

/**
 * 6. Check Cheaper Versions / Brands or On-Sale Alternatives for Mapped Shopping List Items
 */
function getEffectivePrice(regular: number | null, promo: number | null): number | null {
  if (promo !== null && promo > 0 && (regular === null || promo <= regular)) {
    return promo;
  }
  if (regular !== null && regular > 0) {
    return regular;
  }
  return null;
}

function roundMoney(v: number): number {
  return Math.round(v * 100) / 100;
}

export async function checkCheaperAlternativesForGroceryList(): Promise<{
  checkedCount: number;
  totalPotentialSavings: number;
  alerts: GroceryItemSavingsAlert[];
}> {
  assertConfigured();
  const store = getSavedStore();
  if (!store) {
    throw new KrogerApiError(
      'Select a preferred Kroger store to compare prices and sales.',
      400,
      'STORE_REQUIRED'
    );
  }

  const mappedRows = db
    .prepare(
      `SELECT
         g.id AS grocery_item_id,
         g.name AS item_name,
         g.normalized_name,
         g.cart_quantity,
         p.upc,
         p.description,
         p.brand,
         p.size,
         p.last_price,
         p.promo_price
       FROM grocery_list_items g
       JOIN product_mappings p ON p.normalized_name = g.normalized_name
       WHERE g.is_checked = 0
       ORDER BY g.name COLLATE NOCASE ASC`
    )
    .all() as Array<{
    grocery_item_id: number;
    item_name: string;
    normalized_name: string;
    cart_quantity: number;
    upc: string;
    description: string;
    brand: string;
    size: string;
    last_price: number | null;
    promo_price: number | null;
  }>;

  if (mappedRows.length === 0) {
    return { checkedCount: 0, totalPotentialSavings: 0, alerts: [] };
  }

  const alerts: GroceryItemSavingsAlert[] = [];
  const batchSize = 4;

  for (let i = 0; i < mappedRows.length; i += batchSize) {
    const batch = mappedRows.slice(i, i + batchSize);
    const batchAlerts = await Promise.all(
      batch.map(async (row): Promise<GroceryItemSavingsAlert | null> => {
        try {
          const candidates = await searchProducts(row.item_name, store.locationId, 8);
          if (candidates.length === 0) return null;

          // Update current product's live price and size if present in search results
          const liveCurrent = candidates.find((c) => c.upc === row.upc);
          const curRegular = liveCurrent?.regularPrice ?? row.last_price;
          const curPromo = liveCurrent?.promoPrice ?? row.promo_price;
          const curSizeStr = liveCurrent?.size || row.size || '';
          const curEffective = getEffectivePrice(curRegular, curPromo);
          if (curEffective === null) return null;

          const curParsedSize = parseProductSize(
            curSizeStr,
            liveCurrent?.description || row.description
          );
          if (!curParsedSize) return null;

          const qty = Math.max(1, row.cart_quantity || 1);
          const cheaperOptions: CheaperAlternativeOption[] = [];

          for (const cand of candidates) {
            if (cand.upc === row.upc) continue;
            if (cand.stockLevel === 'TEMPORARILY_OUT_OF_STOCK') continue;
            const eff = getEffectivePrice(cand.regularPrice, cand.promoPrice);
            if (eff === null) continue;

            const candParsedSize = parseProductSize(cand.size, cand.description);
            const comparison = compareAlternativeForSameQuantity({
              currentSize: curParsedSize,
              currentEffectivePrice: curEffective,
              currentCartQuantity: qty,
              candidateSize: candParsedSize,
              candidateEffectivePrice: eff,
              minTotalSavings: 0.1,
            });
            if (!comparison) continue;

            const isOnSale =
              cand.promoPrice !== null &&
              cand.regularPrice !== null &&
              cand.promoPrice > 0 &&
              cand.promoPrice < cand.regularPrice;

            cheaperOptions.push({
              upc: cand.upc,
              productId: cand.productId,
              description: cand.description,
              brand: cand.brand,
              size: cand.size,
              imageUrl: cand.imageUrl,
              regularPrice: cand.regularPrice,
              promoPrice: cand.promoPrice,
              effectivePrice: eff,
              isOnSale,
              stockLevel: cand.stockLevel,
              recommendedCartQuantity: comparison.recommendedCartQuantity,
              totalAlternativeCost: comparison.candidateTotalCost,
              currentTotalCost: comparison.currentTotalCost,
              savingsPerUnit: comparison.savingsPerCurrentUnit,
              totalSavings: comparison.totalSavings,
              savingsPercent: comparison.savingsPercent,
            });
          }

          if (cheaperOptions.length === 0) return null;

          cheaperOptions.sort(
            (a, b) =>
              b.totalSavings - a.totalSavings || Number(b.isOnSale) - Number(a.isOnSale)
          );

          return {
            groceryItemId: row.grocery_item_id,
            itemName: row.item_name,
            normalizedName: row.normalized_name,
            cartQuantity: qty,
            currentProduct: {
              upc: row.upc,
              description: row.description,
              brand: row.brand,
              size: curSizeStr,
              regularPrice: curRegular,
              promoPrice: curPromo,
              effectivePrice: curEffective,
            },
            bestAlternative: cheaperOptions[0],
            otherAlternatives: cheaperOptions.slice(1, 3),
          };
        } catch {
          return null;
        }
      })
    );

    for (const alert of batchAlerts) {
      if (alert) alerts.push(alert);
    }
  }

  alerts.sort((a, b) => b.bestAlternative.totalSavings - a.bestAlternative.totalSavings);
  const totalPotentialSavings = roundMoney(
    alerts.reduce((sum, a) => sum + a.bestAlternative.totalSavings, 0)
  );

  return {
    checkedCount: mappedRows.length,
    totalPotentialSavings,
    alerts,
  };
}

/**
 * 7. Batch Add to Kroger Cart via PUT /v1/cart/add
 * Payload: { "items": [{ "upc": "...", "quantity": 1, "modality": "PICKUP" }] }
 */
export async function addItemsToKrogerCart(
  items: Array<{ upc: string; quantity: number; modality: FulfillmentModality }>,
  accountId?: number
): Promise<{ accountId: number; accountLabel: string }> {
  assertConfigured();
  if (items.length === 0) {
    throw new KrogerApiError('No mapped items to add to Kroger cart.', 400, 'NO_ITEMS');
  }

  const targetAccount = getStoredUserToken(accountId);
  if (!targetAccount) {
    throw new KrogerApiError(
      'Connect a Kroger account before adding items to your cart.',
      401,
      'KROGER_AUTH_REQUIRED'
    );
  }

  const sendWithToken = async (accessToken: string) =>
    fetch(`${config.kroger.baseUrl}/cart/add`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ items }),
    });

  let token = await getValidUserAccessToken(targetAccount.id);
  let response = await sendWithToken(token);

  // If token was unexpectedly revoked/expired server-side, refresh once (with rotating refresh_token) and retry
  if (response.status === 401) {
    token = await refreshUserAccessToken(targetAccount.id);
    response = await sendWithToken(token);
  }

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new KrogerApiError(
      `Kroger cart add failed (${response.status}): ${errText || response.statusText}`,
      response.status === 401 ? 401 : 502,
      'KROGER_CART_ADD_FAILED'
    );
  }

  return {
    accountId: targetAccount.id,
    accountLabel: targetAccount.label,
  };
}
