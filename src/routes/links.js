import { Router } from 'express';
import { findLink, insertLink, recordClick } from '../db.js';
import { randomCode, validateCustomCode } from '../lib/codes.js';
import { validateExpiresIn, validateUrl } from '../lib/urls.js';

const MAX_RANDOM_ATTEMPTS = 5;

export function createLinksRouter({ baseUrl }) {
  const router = Router();

  router.post('/', (req, res) => {
    const body = req.body ?? {};
    const urlError = validateUrl(body.url);
    if (urlError) return res.status(400).json({ error: urlError });

    const hasCustomCode = body.code !== undefined;
    if (hasCustomCode) {
      const codeError = validateCustomCode(body.code);
      if (codeError) return res.status(400).json({ error: codeError });
    }

    const expiry = validateExpiresIn(body.expiresIn);
    if (expiry.error) return res.status(400).json({ error: expiry.error });

    const createdAt = Date.now();
    const attempts = hasCustomCode ? 1 : MAX_RANDOM_ATTEMPTS;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const code = hasCustomCode ? body.code : randomCode();
      const result = insertLink({
        code,
        url: body.url,
        expiresAt: expiry.expiresAt,
        createdAt,
      });

      if (result.conflict) {
        if (hasCustomCode) return res.status(409).json({ error: 'code is already in use' });
        continue;
      }

      return res.status(201).json(toResponse({
        code,
        url: body.url,
        clicks: 0,
        expires_at: expiry.expiresAt,
        created_at: createdAt,
      }, baseUrl));
    }

    return res.status(500).json({ error: 'could not allocate a code' });
  });

  router.get('/:code', (req, res) => {
    const row = findLink(req.params.code);
    if (!row) return res.status(404).json({ error: 'link not found' });
    if (isExpired(row)) return res.status(410).json({ error: 'link has expired' });
    return res.json(toResponse(row, baseUrl));
  });

  return router;
}

export function redirectHandler(req, res) {
  const now = Date.now();
  const updated = recordClick(req.params.code, now);
  if (updated) return res.redirect(302, updated.url);

  const row = findLink(req.params.code);
  if (!row) return res.status(404).json({ error: 'link not found' });
  if (isExpired(row, now)) return res.status(410).json({ error: 'link has expired' });
  return res.status(404).json({ error: 'link not found' });
}

function toResponse(row, baseUrl) {
  return {
    code: row.code,
    url: row.url,
    shortUrl: `${baseUrl}/${row.code}`,
    clicks: row.clicks,
    expiresAt: row.expires_at == null ? null : new Date(row.expires_at).toISOString(),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function isExpired(row, now = Date.now()) {
  return row.expires_at != null && row.expires_at <= now;
}
