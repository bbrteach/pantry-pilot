import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { initializeDatabase } from './db/database.js';
import { seedDatabaseIfEmpty } from './db/seed.js';
import { authRouter, requireHouseholdAuth } from './middleware/auth.js';
import { mealsRouter } from './routes/meals.js';
import { staplesRouter } from './routes/staples.js';
import { planRouter } from './routes/plan.js';
import { scheduleRouter } from './routes/schedule.js';
import { groceryListRouter } from './routes/groceryList.js';
import { uploadsRouter } from './routes/uploads.js';
import { krogerRouter } from './routes/kroger.js';

initializeDatabase();
seedDatabaseIfEmpty();

const app = express();
app.set('trust proxy', 1);

if (!config.isProd) {
  app.use(
    cors({
      origin: [config.clientUrl, 'http://localhost:5173', 'http://127.0.0.1:5173'].filter(Boolean),
      credentials: true,
    })
  );
} else if (config.clientUrl) {
  app.use(
    cors({
      origin: config.clientUrl,
      credentials: true,
    })
  );
}

app.use(express.json({ limit: '6mb' }));

// Household passcode middleware for /api/* (no-op when APP_PASSCODE is unset)
app.use('/api', requireHouseholdAuth);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    krogerConfigured: config.kroger.isConfigured,
    passcodeEnabled: config.auth.enabled,
  });
});

app.use('/api/auth', authRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/kroger', krogerRouter);
app.use('/api/meals', mealsRouter);
app.use('/api/staples', staplesRouter);
app.use('/api/plan', planRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/grocery-list', groceryListRouter);

// Single-server production mode: serve built Vite client from client/dist
const clientDistDir = path.join(config.projectRoot, 'client', 'dist');
const clientIndexHtml = path.join(clientDistDir, 'index.html');
if (config.isProd && fs.existsSync(clientIndexHtml)) {
  app.use(express.static(clientDistDir, { maxAge: '1d' }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(clientIndexHtml);
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled API error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(config.port, '0.0.0.0', () => {
  console.log(`PantryPilot server listening on http://0.0.0.0:${config.port}`);
  console.log(`SQLite database: ${config.databasePath}`);
  console.log(
    `Household passcode: ${config.auth.enabled ? 'enabled' : 'disabled (set APP_PASSCODE in .env to enable)'}`
  );
  console.log(
    `Kroger API credentials: ${config.kroger.isConfigured ? 'configured' : 'not configured (gracefully disabled)'}`
  );
  if (config.isProd && fs.existsSync(clientIndexHtml)) {
    console.log(`Serving production frontend from ${clientDistDir}`);
  }
});
