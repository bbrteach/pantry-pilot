import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

dotenv.config({ path: path.join(projectRoot, '.env') });

const rawDbPath = process.env.DATABASE_PATH || './server/data/pantrypilot.db';
const resolvedDbPath = path.isAbsolute(rawDbPath)
  ? rawDbPath
  : path.resolve(projectRoot, rawDbPath);

const krogerClientId = (process.env.KROGER_CLIENT_ID || '').trim();
const krogerClientSecret = (process.env.KROGER_CLIENT_SECRET || '').trim();
const appPasscode = (process.env.APP_PASSCODE || '').trim();
const isProd = process.env.NODE_ENV === 'production';

// In production single-server deployments (e.g., Railway), CLIENT_URL can be blank to use same-origin relative URLs.
const rawClientUrl = (process.env.CLIENT_URL ?? (isProd ? '' : 'http://localhost:5173')).trim();

export const config = {
  isProd,
  projectRoot,
  port: Number(process.env.PORT || 3001),
  clientUrl: rawClientUrl.replace(/\/$/, ''),
  databasePath: resolvedDbPath,
  auth: {
    passcode: appPasscode,
    enabled: Boolean(appPasscode),
    sessionSecret: (process.env.SESSION_SECRET || '').trim(),
  },
  kroger: {
    clientId: krogerClientId,
    clientSecret: krogerClientSecret,
    redirectUri:
      (process.env.KROGER_REDIRECT_URI || 'http://localhost:3001/api/kroger/callback').trim(),
    baseUrl: (process.env.KROGER_BASE_URL || 'https://api.kroger.com/v1').replace(/\/$/, ''),
    isConfigured: Boolean(krogerClientId && krogerClientSecret),
  },
};
