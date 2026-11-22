import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, beforeEach, describe, it } from 'node:test';

// Point tests at a temporary isolated SQLite DB & mock Kroger credentials BEFORE importing app modules
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pantrypilot-kroger-test-'));
process.env.DATABASE_PATH = path.join(tempDir, 'test.db');
process.env.KROGER_CLIENT_ID = 'test_client_id';
process.env.KROGER_CLIENT_SECRET = 'test_client_secret';
process.env.KROGER_REDIRECT_URI = 'http://localhost:3001/api/kroger/callback';
process.env.KROGER_BASE_URL = 'https://api.kroger.com/v1';

const { db, initializeDatabase } = await import('../db/database.js');
const { seedDatabaseIfEmpty } = await import('../db/seed.js');
const kroger = await import('./krogerService.js');
const dealsService = await import('./dealsService.js');

initializeDatabase();
seedDatabaseIfEmpty();

const expectedBasic = `Basic ${Buffer.from('test_client_id:test_client_secret').toString('base64')}`;

describe('Kroger Public API Service (Phase 2)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    kroger.resetKrogerServiceCaches();
    db.prepare('DELETE FROM kroger_tokens').run();
    db.prepare('DELETE FROM app_settings').run();
    db.prepare('DELETE FROM product_mappings').run();
    globalThis.fetch = originalFetch;
  });

  after(() => {
    globalThis.fetch = originalFetch;
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('fetches and caches Client Credentials token with Basic Auth and scope=product.compact', async () => {
    let calls = 0;
    globalThis.fetch = (async (url, init) => {
      calls++;
      assert.equal(String(url), 'https://api.kroger.com/v1/connect/oauth2/token');
      assert.equal(init?.method, 'POST');
      assert.equal((init?.headers as Record<string, string>)['Authorization'], expectedBasic);
      assert.equal(String(init?.body), 'grant_type=client_credentials&scope=product.compact');
      return new Response(
        JSON.stringify({ access_token: 'cc-token-1', expires_in: 1800, token_type: 'bearer' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }) as typeof fetch;

    const first = await kroger.getClientCredentialsToken();
    const second = await kroger.getClientCredentialsToken();
    assert.equal(first, 'cc-token-1');
    assert.equal(second, 'cc-token-1');
    assert.equal(calls, 1, 'Client credentials token should be cached until near expiry');
  });

  it('builds Authorization Code URL with required scopes and validates single-use CSRF state', () => {
    const { url, state } = kroger.buildAuthorizationUrl();
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://api.kroger.com/v1/connect/oauth2/authorize');
    assert.equal(parsed.searchParams.get('scope'), 'product.compact cart.basic:write');
    assert.equal(parsed.searchParams.get('response_type'), 'code');
    assert.equal(parsed.searchParams.get('client_id'), 'test_client_id');
    assert.equal(parsed.searchParams.get('redirect_uri'), 'http://localhost:3001/api/kroger/callback');
    assert.equal(kroger.consumeOAuthState(state), true);
    assert.equal(kroger.consumeOAuthState(state), false, 'State must be single-use');
  });

  it('exchanges authorization code and stores tokens in SQLite', async () => {
    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'https://api.kroger.com/v1/connect/oauth2/token');
      assert.equal((init?.headers as Record<string, string>)['Authorization'], expectedBasic);
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get('grant_type'), 'authorization_code');
      assert.equal(params.get('code'), 'auth-code-123');
      return new Response(
        JSON.stringify({
          access_token: 'user-access-1',
          refresh_token: 'user-refresh-1',
          expires_in: 1800,
          token_type: 'bearer',
          scope: 'product.compact cart.basic:write',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    await kroger.exchangeAuthorizationCode('auth-code-123');
    const stored = kroger.getStoredUserToken();
    assert.ok(stored);
    assert.equal(stored.access_token, 'user-access-1');
    assert.equal(stored.refresh_token, 'user-refresh-1');
    assert.equal(kroger.getKrogerStatus().authenticated, true);
  });

  it('auto-refreshes expired token and IMMEDIATELY overwrites rotating refresh_token in SQLite (with single-flight lock)', async () => {
    // Seed an expired token
    kroger.saveUserTokens({
      accessToken: 'expired-access',
      refreshToken: 'refresh-v1',
      tokenType: 'bearer',
      scope: 'product.compact cart.basic:write',
      expiresAt: Date.now() - 5000,
    });

    let refreshCalls = 0;
    globalThis.fetch = (async (_url, init) => {
      refreshCalls++;
      const params = new URLSearchParams(String(init?.body));
      assert.equal(params.get('grant_type'), 'refresh_token');
      assert.equal(params.get('refresh_token'), 'refresh-v1');
      assert.equal((init?.headers as Record<string, string>)['Authorization'], expectedBasic);
      return new Response(
        JSON.stringify({
          access_token: 'fresh-access-v2',
          refresh_token: 'rotating-refresh-v2',
          expires_in: 1800,
          token_type: 'bearer',
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    // Fire two concurrent token requests to ensure single-flight lock prevents double-spending refresh-v1
    const [tokA, tokB] = await Promise.all([
      kroger.getValidUserAccessToken(),
      kroger.getValidUserAccessToken(),
    ]);

    assert.equal(tokA, 'fresh-access-v2');
    assert.equal(tokB, 'fresh-access-v2');
    assert.equal(refreshCalls, 1);

    const updated = kroger.getStoredUserToken();
    assert.equal(updated?.access_token, 'fresh-access-v2');
    assert.equal(
      updated?.refresh_token,
      'rotating-refresh-v2',
      'Stored refresh_token MUST be immediately overwritten with newly returned rotating token'
    );
  });

  it('searches Kroger locations by ZIP and persists chosen locationId', async () => {
    globalThis.fetch = (async (url) => {
      const u = String(url);
      if (u.endsWith('/connect/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'cc-tok', expires_in: 1800 }), { status: 200 });
      }
      assert(u.includes('/locations?'));
      assert(u.includes('filter.zipCode.near=45202'));
      assert(u.includes('filter.chain=Kroger'));
      return new Response(
        JSON.stringify({
          data: [
            {
              locationId: '01400376',
              name: 'Kroger - Downtown Cincinnati',
              chain: 'Kroger',
              phone: '513-555-0100',
              address: {
                addressLine1: '100 E Court St',
                city: 'Cincinnati',
                state: 'OH',
                zipCode: '45202',
              },
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const locations = await kroger.searchLocationsByZip('45202');
    assert.equal(locations.length, 1);
    assert.equal(locations[0].locationId, '01400376');

    const saved = kroger.saveStore({
      locationId: locations[0].locationId,
      name: locations[0].name,
      address: locations[0].fullAddress,
      zip: '45202',
    });
    assert.equal(saved.locationId, '01400376');
    assert.equal(kroger.getSavedStore()?.name, 'Kroger - Downtown Cincinnati');
  });

  it('searches Kroger products with limit=6, normalizes card metadata, and persists UPC mapping', async () => {
    globalThis.fetch = (async (url) => {
      const u = String(url);
      if (u.endsWith('/connect/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'cc-tok', expires_in: 1800 }), { status: 200 });
      }
      assert(u.includes('/products?'));
      assert(u.includes('filter.term=whole+milk'));
      assert(u.includes('filter.locationId=01400376'));
      assert(u.includes('filter.limit=6'));
      return new Response(
        JSON.stringify({
          data: [
            {
              productId: '0001111041700',
              upc: '0001111041700',
              description: 'Kroger Grade A Vitamin D Whole Milk',
              brand: 'Kroger',
              images: [
                {
                  perspective: 'front',
                  featured: true,
                  sizes: [{ size: 'medium', url: 'https://www.kroger.com/product/images/medium/front/0001111041700' }],
                },
              ],
              items: [
                {
                  size: '1 gal',
                  price: { regular: 3.29, promo: 2.79 },
                  inventory: { stockLevel: 'HIGH' },
                },
              ],
            },
          ],
        }),
        { status: 200 }
      );
    }) as typeof fetch;

    const products = await kroger.searchProducts('whole milk', '01400376', 6);
    assert.equal(products.length, 1);
    assert.equal(products[0].upc, '0001111041700');
    assert.equal(products[0].regularPrice, 3.29);
    assert.equal(products[0].promoPrice, 2.79);
    assert.equal(products[0].stockLevel, 'HIGH');
    assert.equal(products[0].size, '1 gal');

    const mapped = kroger.upsertProductMapping({
      normalizedName: 'Whole Milk',
      upc: products[0].upc,
      productId: products[0].productId,
      description: products[0].description,
      brand: products[0].brand,
      size: products[0].size,
      imageUrl: products[0].imageUrl,
      lastPrice: products[0].regularPrice,
      promoPrice: products[0].promoPrice,
    });
    assert.equal(mapped.normalizedName, 'whole milk');
    assert.equal(kroger.listProductMappings().length, 1);
  });

  it('sends batch PUT /v1/cart/add with expected { items: [{ upc, quantity, modality }] } payload', async () => {
    kroger.saveUserTokens({
      accessToken: 'valid-user-token',
      refreshToken: 'refresh-current',
      tokenType: 'bearer',
      scope: 'product.compact cart.basic:write',
      expiresAt: Date.now() + 20 * 60 * 1000,
    });

    let capturedBody = '';
    globalThis.fetch = (async (url, init) => {
      assert.equal(String(url), 'https://api.kroger.com/v1/cart/add');
      assert.equal(init?.method, 'PUT');
      assert.equal((init?.headers as Record<string, string>)['Authorization'], 'Bearer valid-user-token');
      capturedBody = String(init?.body);
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await kroger.addItemsToKrogerCart([
      { upc: '0001111041700', quantity: 2, modality: 'PICKUP' },
      { upc: '0001111085605', quantity: 1, modality: 'PICKUP' },
    ]);

    assert.deepEqual(JSON.parse(capturedBody), {
      items: [
        { upc: '0001111041700', quantity: 2, modality: 'PICKUP' },
        { upc: '0001111085605', quantity: 1, modality: 'PICKUP' },
      ],
    });
  });

  it('retries PUT /v1/cart/add after 401 by refreshing token and overwriting rotating refresh_token', async () => {
    kroger.saveUserTokens({
      accessToken: 'stale-access',
      refreshToken: 'refresh-old',
      tokenType: 'bearer',
      scope: 'product.compact cart.basic:write',
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    let cartAttempts = 0;
    globalThis.fetch = (async (url, init) => {
      const u = String(url);
      if (u.endsWith('/connect/oauth2/token')) {
        return new Response(
          JSON.stringify({
            access_token: 'rotated-access',
            refresh_token: 'refresh-new-rotated',
            expires_in: 1800,
          }),
          { status: 200 }
        );
      }
      cartAttempts++;
      const auth = (init?.headers as Record<string, string>)['Authorization'];
      if (cartAttempts === 1) {
        assert.equal(auth, 'Bearer stale-access');
        return new Response(JSON.stringify({ error: 'invalid_token' }), { status: 401 });
      }
      assert.equal(auth, 'Bearer rotated-access');
      return new Response(null, { status: 204 });
    }) as typeof fetch;

    await kroger.addItemsToKrogerCart([
      { upc: '0001111041700', quantity: 1, modality: 'DELIVERY' },
    ]);

    assert.equal(cartAttempts, 2);
    assert.equal(kroger.getStoredUserToken()?.refresh_token, 'refresh-new-rotated');
  });

  it('scans Kroger promo prices, caches active deals in SQLite, and suggests saved + new meals', async () => {
    kroger.saveStore({
      locationId: '01400376',
      name: 'Kroger Downtown',
      address: '100 E Court St',
      zip: '45202',
    });

    globalThis.fetch = (async (url) => {
      const u = String(url);
      if (u.endsWith('/connect/oauth2/token')) {
        return new Response(JSON.stringify({ access_token: 'cc-tok', expires_in: 1800 }), { status: 200 });
      }
      if (u.includes('filter.term=ground+beef')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                productId: 'p-beef',
                upc: '0001111000001',
                description: 'Kroger 80/20 Ground Beef',
                brand: 'Kroger',
                items: [{ size: '1 lb', price: { regular: 6.49, promo: 4.49 }, inventory: { stockLevel: 'HIGH' } }],
              },
            ],
          }),
          { status: 200 }
        );
      }
      if (u.includes('filter.term=shredded+cheddar+cheese')) {
        return new Response(
          JSON.stringify({
            data: [
              {
                productId: 'p-cheese',
                upc: '0001111000002',
                description: 'Kroger Sharp Shredded Cheddar Cheese',
                brand: 'Kroger',
                items: [{ size: '8 oz', price: { regular: 3.29, promo: 2.29 }, inventory: { stockLevel: 'HIGH' } }],
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    }) as typeof fetch;

    const scanned = await dealsService.scanKrogerDealsForStore('01400376');
    assert.equal(scanned.deals.length, 2);
    assert(scanned.savedMealSuggestions.length >= 2, 'Expected saved meals using beef/cheddar to be suggested');
    assert(
      scanned.savedMealSuggestions[0].matchedIngredients.length === 2,
      'Top saved meal should match both Ground Beef and Shredded Cheddar Cheese'
    );
    assert(scanned.newMealIdeas.length >= 1, 'Expected new curated meal ideas matched to current sales');

    // Confirm cached deals load from SQLite without hitting fetch again
    const cached = dealsService.getCachedKrogerDealsPayload();
    assert.equal(cached.deals.length, 2);
  });
});
