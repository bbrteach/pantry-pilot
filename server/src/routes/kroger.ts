import { Router } from 'express';
import { config } from '../config.js';
import { db } from '../db/database.js';
import {
  KrogerApiError,
  addItemsToKrogerCart,
  buildAuthorizationUrl,
  checkCheaperAlternativesForGroceryList,
  clearUserTokens,
  consumeOAuthStateMeta,
  deleteKrogerAccount,
  deleteProductMapping,
  exchangeAuthorizationCode,
  getKrogerStatus,
  getSavedModality,
  getSavedStore,
  listProductMappings,
  renameKrogerAccount,
  saveModality,
  saveStore,
  searchLocationsByZip,
  searchProducts,
  setActiveKrogerAccount,
  upsertProductMapping,
  type FulfillmentModality,
} from '../services/krogerService.js';
import {
  getCachedKrogerDealsPayload,
  scanKrogerDealsForStore,
} from '../services/dealsService.js';

export const krogerRouter = Router();

function handleError(res: import('express').Response, err: unknown) {
  if (err instanceof KrogerApiError) {
    res.status(err.status).json({ error: err.message, code: err.code });
    return;
  }
  console.error('Kroger route error:', err);
  res.status(500).json({ error: 'Unexpected Kroger API error.' });
}

krogerRouter.get('/status', (_req, res) => {
  res.json(getKrogerStatus());
});

krogerRouter.get('/auth/login', (req, res) => {
  try {
    const label = typeof req.query.label === 'string' ? req.query.label.trim() : '';
    const rawReplace = Number(req.query.replaceId);
    const replaceAccountId =
      Number.isInteger(rawReplace) && rawReplace > 0 ? rawReplace : undefined;

    const { url } = buildAuthorizationUrl({
      accountLabel: label,
      replaceAccountId,
    });
    res.redirect(url);
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.get('/callback', async (req, res) => {
  const errorParam = typeof req.query.error === 'string' ? req.query.error : '';
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const redirectBase = config.clientUrl || '';

  if (errorParam) {
    res.redirect(`${redirectBase}/?kroger_error=${encodeURIComponent(errorParam)}#kroger`);
    return;
  }

  const stateMeta = state ? consumeOAuthStateMeta(state) : null;
  if (!code || !stateMeta) {
    res.redirect(
      `${redirectBase}/?kroger_error=${encodeURIComponent('Invalid or expired OAuth state. Please try connecting again.')}#kroger`
    );
    return;
  }

  try {
    const account = await exchangeAuthorizationCode(code, {
      accountLabel: stateMeta.accountLabel,
      replaceAccountId: stateMeta.replaceAccountId,
    });
    res.redirect(
      `${redirectBase}/?kroger_connected=1&kroger_account=${encodeURIComponent(account.label)}#kroger`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Kroger login failed.';
    res.redirect(`${redirectBase}/?kroger_error=${encodeURIComponent(msg)}#kroger`);
  }
});

krogerRouter.post('/auth/disconnect', (_req, res) => {
  clearUserTokens();
  res.json(getKrogerStatus());
});

krogerRouter.post('/accounts/:id/activate', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid account ID.' });
      return;
    }
    setActiveKrogerAccount(id);
    res.json(getKrogerStatus());
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.patch('/accounts/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    const label = typeof req.body?.label === 'string' ? req.body.label : '';
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid account ID.' });
      return;
    }
    renameKrogerAccount(id, label);
    res.json(getKrogerStatus());
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.delete('/accounts/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid account ID.' });
      return;
    }
    deleteKrogerAccount(id);
    res.json(getKrogerStatus());
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.get('/locations', async (req, res) => {
  try {
    const zip = typeof req.query.zip === 'string' ? req.query.zip : '';
    const locations = await searchLocationsByZip(zip);
    res.json(locations);
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.post('/store', (req, res) => {
  const body = req.body ?? {};
  const locationId = typeof body.locationId === 'string' ? body.locationId.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const address = typeof body.address === 'string' ? body.address.trim() : '';
  const zip = typeof body.zip === 'string' ? body.zip.trim() : '';

  if (!locationId) {
    res.status(400).json({ error: 'locationId is required.' });
    return;
  }

  const saved = saveStore({
    locationId,
    name: name || 'Kroger Store',
    address,
    zip,
  });

  res.json({ store: saved, status: getKrogerStatus() });
});

krogerRouter.put('/modality', (req, res) => {
  const raw = typeof req.body?.modality === 'string' ? req.body.modality.toUpperCase() : '';
  if (raw !== 'PICKUP' && raw !== 'DELIVERY') {
    res.status(400).json({ error: 'Modality must be PICKUP or DELIVERY.' });
    return;
  }
  const saved = saveModality(raw as FulfillmentModality);
  res.json({ modality: saved });
});

krogerRouter.get('/products', async (req, res) => {
  try {
    const term = typeof req.query.term === 'string' ? req.query.term : '';
    const requestedLocationId =
      typeof req.query.locationId === 'string' ? req.query.locationId.trim() : '';
    const limit = Number(req.query.limit || 6);
    const savedStore = getSavedStore();
    const locationId = requestedLocationId || savedStore?.locationId || '';

    const products = await searchProducts(term, locationId, Number.isFinite(limit) ? limit : 6);
    res.json(products);
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.get('/mappings', (_req, res) => {
  res.json(listProductMappings());
});

krogerRouter.put('/mappings', (req, res) => {
  const body = req.body ?? {};
  const normalizedName =
    typeof body.normalizedName === 'string' ? body.normalizedName.trim() : '';
  const upc = typeof body.upc === 'string' ? body.upc.trim() : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';

  if (!normalizedName || !upc || !description) {
    res.status(400).json({ error: 'normalizedName, upc, and description are required.' });
    return;
  }

  const saved = upsertProductMapping({
    normalizedName,
    upc,
    productId: typeof body.productId === 'string' ? body.productId : '',
    description,
    brand: typeof body.brand === 'string' ? body.brand : '',
    size: typeof body.size === 'string' ? body.size : '',
    imageUrl: typeof body.imageUrl === 'string' ? body.imageUrl : '',
    lastPrice: typeof body.lastPrice === 'number' ? body.lastPrice : null,
    promoPrice: typeof body.promoPrice === 'number' ? body.promoPrice : null,
  });

  res.json(saved);
});

krogerRouter.delete('/mappings/:normalizedName', (req, res) => {
  const normalizedName = decodeURIComponent(req.params.normalizedName || '');
  const deleted = deleteProductMapping(normalizedName);
  res.json({ deleted, normalizedName });
});

krogerRouter.post('/savings-check', async (_req, res) => {
  try {
    const result = await checkCheaperAlternativesForGroceryList();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.post('/cart/add', async (req, res) => {
  try {
    const body = req.body ?? {};
    const requestedModality =
      typeof body.modality === 'string' ? body.modality.toUpperCase() : getSavedModality();
    const modality: FulfillmentModality =
      requestedModality === 'DELIVERY' ? 'DELIVERY' : 'PICKUP';
    saveModality(modality);

    const requestedAccountId = Number(body.accountId);
    const accountId =
      Number.isInteger(requestedAccountId) && requestedAccountId > 0
        ? requestedAccountId
        : undefined;

    const rows = db
      .prepare(
        `SELECT
          g.id, g.name, g.normalized_name, g.cart_quantity,
          p.upc, p.description, p.brand, p.size, p.image_url, p.last_price, p.promo_price
         FROM grocery_list_items g
         LEFT JOIN product_mappings p ON p.normalized_name = g.normalized_name
         WHERE g.is_checked = 0
         ORDER BY g.name COLLATE NOCASE ASC`
      )
      .all() as Array<{
      id: number;
      name: string;
      normalized_name: string;
      cart_quantity: number;
      upc: string | null;
      description: string | null;
      brand: string | null;
      size: string | null;
      image_url: string | null;
      last_price: number | null;
      promo_price: number | null;
    }>;

    const filterIds = Array.isArray(body.itemIds)
      ? new Set<number>(
          (body.itemIds as unknown[])
            .map((id) => Number(id))
            .filter((id): id is number => Number.isInteger(id) && id > 0)
        )
      : null;

    const targetRows = filterIds ? rows.filter((r) => filterIds.has(r.id)) : rows;

    const addedItems: Array<{
      groceryItemId: number;
      name: string;
      upc: string;
      description: string;
      size: string;
      quantity: number;
      modality: FulfillmentModality;
    }> = [];

    const skippedItems: Array<{
      groceryItemId: number;
      name: string;
      reason: string;
    }> = [];

    for (const row of targetRows) {
      if (!row.upc) {
        skippedItems.push({
          groceryItemId: row.id,
          name: row.name,
          reason: 'Not mapped to a Kroger product',
        });
        continue;
      }
      addedItems.push({
        groceryItemId: row.id,
        name: row.name,
        upc: row.upc,
        description: row.description || row.name,
        size: row.size || '',
        quantity: Math.max(1, Math.round(row.cart_quantity || 1)),
        modality,
      });
    }

    if (addedItems.length === 0) {
      res.status(400).json({
        error: 'No mapped grocery items to send. Match at least one item to a Kroger product first.',
        skippedItems,
      });
      return;
    }

    const byUpc = new Map<string, { upc: string; quantity: number; modality: FulfillmentModality }>();
    for (const item of addedItems) {
      const prev = byUpc.get(item.upc);
      if (prev) {
        prev.quantity += item.quantity;
      } else {
        byUpc.set(item.upc, {
          upc: item.upc,
          quantity: item.quantity,
          modality: item.modality,
        });
      }
    }

    const sent = await addItemsToKrogerCart(Array.from(byUpc.values()), accountId);

    res.json({
      success: true,
      modality,
      accountId: sent.accountId,
      accountLabel: sent.accountLabel,
      addedItems,
      skippedItems,
      cartUrl: 'https://www.kroger.com/cart',
    });
  } catch (err) {
    handleError(res, err);
  }
});

krogerRouter.get('/deals', (_req, res) => {
  res.json(getCachedKrogerDealsPayload());
});

krogerRouter.post('/deals/scan', async (_req, res) => {
  try {
    const store = getSavedStore();
    if (!store) {
      res.status(400).json({
        error: 'Select your preferred Kroger store first so we can check local sales.',
        code: 'STORE_REQUIRED',
      });
      return;
    }
    const payload = await scanKrogerDealsForStore(store.locationId);
    res.json(payload);
  } catch (err) {
    handleError(res, err);
  }
});
