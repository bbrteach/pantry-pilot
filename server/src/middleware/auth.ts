import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { config } from '../config.js';

const COOKIE_NAME = 'pp_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function getSigningKey(): string {
  return config.auth.sessionSecret || `pantrypilot-v1:${config.auth.passcode}`;
}

function signPayload(payloadB64: string): string {
  return crypto.createHmac('sha256', getSigningKey()).update(payloadB64).digest('base64url');
}

function createSessionToken(): string {
  const payload = JSON.stringify({
    exp: Date.now() + SESSION_TTL_MS,
    v: 1,
  });
  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url');
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

function verifySessionToken(token: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payloadB64, providedSig] = parts;
  const expectedSig = signPayload(payloadB64);

  const a = Buffer.from(providedSig, 'utf8');
  const b = Buffer.from(expectedSig, 'utf8');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return false;
  }

  try {
    const parsed = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as {
      exp?: number;
    };
    return typeof parsed.exp === 'number' && Date.now() < parsed.exp;
  } catch {
    return false;
  }
}

function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie || '';
  const result: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) result[key] = decodeURIComponent(val);
  }
  return result;
}

function isPasscodeMatch(candidate: string): boolean {
  const expected = config.auth.passcode;
  if (!expected) return true;
  const hashA = crypto.createHash('sha256').update(candidate).digest();
  const hashB = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

export function isRequestAuthenticated(req: Request): boolean {
  if (!config.auth.enabled) return true;
  const cookies = parseCookies(req);
  const token = cookies[COOKIE_NAME];
  if (!token) return false;
  return verifySessionToken(token);
}

function buildCookieHeader(req: Request, value: string, maxAgeSeconds: number): string {
  const isHttps =
    req.secure ||
    (typeof req.headers['x-forwarded-proto'] === 'string' &&
      req.headers['x-forwarded-proto'].includes('https'));

  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (isHttps) {
    parts.push('Secure');
  }
  return parts.join('; ');
}

export function requireHouseholdAuth(req: Request, res: Response, next: NextFunction): void {
  if (!config.auth.enabled) {
    next();
    return;
  }

  // Always allow health checks, auth endpoints, and Kroger OAuth callback (protected by CSRF state)
  if (
    req.path === '/health' ||
    req.path.startsWith('/auth/') ||
    req.path === '/kroger/callback'
  ) {
    next();
    return;
  }

  if (!isRequestAuthenticated(req)) {
    res.status(401).json({
      error: 'Household passcode required.',
      code: 'PASSCODE_REQUIRED',
    });
    return;
  }

  next();
}

export const authRouter = Router();

authRouter.get('/status', (req, res) => {
  res.json({
    passcodeEnabled: config.auth.enabled,
    authenticated: isRequestAuthenticated(req),
  });
});

authRouter.post('/login', (req, res) => {
  if (!config.auth.enabled) {
    res.json({ passcodeEnabled: false, authenticated: true });
    return;
  }

  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode.trim() : '';
  if (!passcode || !isPasscodeMatch(passcode)) {
    res.status(401).json({ error: 'Incorrect household passcode.' });
    return;
  }

  const token = createSessionToken();
  res.setHeader('Set-Cookie', buildCookieHeader(req, token, Math.floor(SESSION_TTL_MS / 1000)));
  res.json({ passcodeEnabled: true, authenticated: true });
});

authRouter.post('/logout', (req, res) => {
  res.setHeader('Set-Cookie', buildCookieHeader(req, '', 0));
  res.json({ passcodeEnabled: config.auth.enabled, authenticated: !config.auth.enabled });
});
