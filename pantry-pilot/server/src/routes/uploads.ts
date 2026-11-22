import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { config } from '../config.js';

export const uploadsRouter = Router();

const uploadsDir = path.join(path.dirname(config.databasePath), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded limit

uploadsRouter.use('/', express.static(uploadsDir, { maxAge: '7d' }));

uploadsRouter.post('/meal-photo', (req, res) => {
  const dataUrl = typeof req.body?.dataUrl === 'string' ? req.body.dataUrl.trim() : '';
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/);

  if (!match) {
    res.status(400).json({ error: 'Invalid image upload payload.' });
    return;
  }

  const mime = match[1].toLowerCase();
  const ext = MIME_TO_EXT[mime];
  if (!ext) {
    res.status(400).json({ error: 'Unsupported image type. Please upload JPEG, PNG, WebP, or GIF.' });
    return;
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    res.status(400).json({ error: 'Image must be smaller than 4 MB.' });
    return;
  }

  const filename = `meal-${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
  const targetPath = path.join(uploadsDir, filename);
  fs.writeFileSync(targetPath, buffer);

  res.status(201).json({ imageUrl: `/api/uploads/${filename}` });
});
