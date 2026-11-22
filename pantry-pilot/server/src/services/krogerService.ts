import crypto from 'node:crypto';
import { config } from '../config.js';
import { db } from '../db/database.js';

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

interface KrogerTokenRow {
  id: number;
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string;
  expires_at: number;
  updated_at: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
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

// Single-flight lock so concurrent requests never double-spend a rotating refresh token
let inFlightUserRefresh: Promise<string> | null = null;

// Short-lived CSRF states for OAuth2 Authorization Code flow
const pendingOAuthStates = new Map<string, number>();
const STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000;

export function resetKrogerServiceCaches(): void {
  clientTokenCache = null;
  inFlightUserRefresh = null;
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

export function getStoredUserToken(): KrogerTokenRow | null {
  const row = db
    .prepare(
      'SELECT id, access_token, refresh_token, token_type, scope, expires_at, updated_at FROM kroger_tokens WHERE id = 1'
    )
    .get() as KrogerTokenRow | undefined;
  return row ?? null;
}

export function saveUserTokens(tokenData: {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  scope: string;
  expiresAt: number;
}): void {
  db.prepare(
    `INSERT INTO kroger_tokens (id, access_token, refresh_token, token_type, scope, expires_at, updated_at)
     VALUES (1, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_type = excluded.token_type,
       scope = excluded.scope,
       expires_at = excluded.expires_at,
       updated_at = datetime('now')`
  ).run(
    tokenData.accessToken,
    tokenData.refreshToken,
    tokenData.tokenType,
    tokenData.scope,
    tokenData.expiresAt
  );
}

export function clearUserTokens(): void {
  db.prepare('DELETE FROM kroger_tokens WHERE id = 1').run();
}

export function getKrogerStatus() {
  const token = getStoredUserToken();
  return {
    configured: isKrogerConfigured(),
    authenticated: Boolean(token && token.refresh_token),
    tokenExpiresAt: token ? token.expires_at : null,
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
export function buildAuthorizationUrl(): { url: string; state: string } {
  assertConfigured();

  // Purge expired states
  const now = Date.now();
  for (const [k, exp] of pendingOAuthStates.entries()) {
    if (exp < now) pendingOAuthStates.delete(k);
  }

  const state = crypto.randomBytes(16).toString('hex');
  pendingOAuthStates.set(state, now + STATE_TTL_MS);

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

export function consumeOAuthState(state: string): boolean {
  const expiresAt = pendingOAuthStates.get(state);
  if (!expiresAt) return false;
  pendingOAuthStates.delete(state);
  return Date.now() <= expiresAt;
}

export async function exchangeAuthorizationCode(code: string): Promise<void> {
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
  saveUserTokens({
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenType: data.token_type || 'bearer',
    scope: data.scope || 'product.compact cart.basic:write',
    expiresAt: Date.now() + expiresInSec * 1000,
  });
}

/**
 * Refreshes an expired user OAuth2 token (30-min TTL) and IMMEDIATELY overwrites
 * the stored rotating refresh_token in SQLite.
 */
export async function refreshUserAccessToken(): Promise<string> {
  assertConfigured();

  if (inFlightUserRefresh) {
    return inFlightUserRefresh;
  }

  inFlightUserRefresh = (async () => {
    const stored = getStoredUserToken();
    if (!stored || !stored.refresh_token) {
      throw new KrogerApiError(
        'Your Kroger account is not connected. Please connect your Kroger account first.',
        401,
        'KROGER_AUTH_REQUIRED'
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: stored.refresh_token,
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
        clearUserTokens();
        throw new KrogerApiError(
          'Your Kroger session expired. Please reconnect your Kroger account.',
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
    const rotatedRefreshToken = data.refresh_token || stored.refresh_token;

    // Immediately overwrite stored tokens (especially rotating refresh_token)
    saveUserTokens({
      accessToken: data.access_token,
      refreshToken: rotatedRefreshToken,
      tokenType: data.token_type || stored.token_type || 'bearer',
      scope: data.scope || stored.scope,
      expiresAt: Date.now() + expiresInSec * 1000,
    });

    return data.access_token;
  })();

  try {
    return await inFlightUserRefresh;
  } finally {
    inFlightUserRefresh = null;
  }
}

export async function getValidUserAccessToken(): Promise<string> {
  assertConfigured();
  const stored = getStoredUserToken();
  if (!stored) {
    throw new KrogerApiError(
      'Connect your Kroger account before adding items to your cart.',
      401,
      'KROGER_AUTH_REQUIRED'
    );
  }

  if (Date.now() >= stored.expires_at - TOKEN_EXPIRY_BUFFER_MS) {
    return refreshUserAccessToken();
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
 * 6. Batch Add to Kroger Cart via PUT /v1/cart/add
 * Payload: { "items": [{ "upc": "...", "quantity": 1, "modality": "PICKUP" }] }
 */
export async function addItemsToKrogerCart(
  items: Array<{ upc: string; quantity: number; modality: FulfillmentModality }>
): Promise<void> {
  assertConfigured();
  if (items.length === 0) {
    throw new KrogerApiError('No mapped items to add to Kroger cart.', 400, 'NO_ITEMS');
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

  let token = await getValidUserAccessToken();
  let response = await sendWithToken(token);

  // If token was unexpectedly revoked/expired server-side, refresh once (with rotating refresh_token) and retry
  if (response.status === 401) {
    token = await refreshUserAccessToken();
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
}
