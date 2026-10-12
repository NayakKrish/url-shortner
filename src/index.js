import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDatabase } from './db.js';
import { createLinksRouter, redirectHandler } from './routes/links.js';

const port = Number(process.env.PORT) || 3000;
const baseUrl = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const databasePath = process.env.DATABASE_PATH
  || fileURLToPath(new URL('../data/shortener.db', import.meta.url));

openDatabase(databasePath);

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/links', createLinksRouter({ baseUrl }));
app.get('/:code', redirectHandler);

app.use((err, _req, res, _next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid JSON' });
  }
  console.error(err);
  return res.status(500).json({ error: 'internal error' });
});

app.listen(port, () => {
  console.log(`listening on ${baseUrl}`);
});
