# URL shortener

A small Express API that stores long URLs in SQLite and serves a short code for each one. Opening the short code redirects to the original URL and counts the visit. You can also look up a link without counting a click, set an optional custom code, and set an optional expiry.

The app is JavaScript (ESM). The only npm dependency is Express. SQLite comes from Node’s built-in `node:sqlite` module, so there is no separate database to install.

## Run it

Requires Node.js 22.13 or newer (`node:sqlite`). This project was written for the Node 25 runtime.

```bash
npm install
npm run dev
```

`npm run dev` restarts the process when you change a file. `npm start` runs it once.

The server listens on `http://localhost:3000` and creates `data/shortener.db` on startup. That file, plus the SQLite `-wal` and `-shm` sidecars, is gitignored.

| Variable        | Default                   | What it does                                                                    |
| --------------- | ------------------------- | ------------------------------------------------------------------------------- |
| `PORT`          | `3000`                    | Port the HTTP server binds to                                                   |
| `BASE_URL`      | `http://localhost:<PORT>` | Origin used to build `shortUrl` in JSON responses. A trailing slash is removed. |
| `DATABASE_PATH` | `data/shortener.db`       | SQLite file path. The parent directory is created if it is missing.             |

Example:

```bash
PORT=4000 BASE_URL=http://localhost:4000 npm run dev
```

## APIs

Replace `http://localhost:3000` if you changed `PORT` or `BASE_URL`. Send JSON with `Content-Type: application/json`.

| Method | Path               | What it does                 | Counts a click? |
| ------ | ------------------ | ---------------------------- | --------------- |
| `GET`  | `/health`          | Process is up                | No              |
| `POST` | `/api/links`       | Create a short link          | No              |
| `GET`  | `/api/links/:code` | Read one link                | No              |
| `GET`  | `/:code`           | Redirect to the original URL | Yes             |

Errors are JSON: `{ "error": "message" }`.

### `GET /health`

Confirms the process is accepting requests.

```bash
curl http://localhost:3000/health
```

`200`

```json
{ "ok": true }
```

### `POST /api/links`

Creates a link.

| Field       | Required | Rules                                                                                                                                                 |
| ----------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`       | Yes      | `http` or `https` only, 1–2048 characters                                                                                                             |
| `code`      | No       | 3–32 characters: letters, numbers, `_`, `-`. `api` and `health` are reserved (any case). If omitted, the server generates 7 random base62 characters. |
| `expiresIn` | No       | Positive integer, seconds from now, up to 10 years. Omit it and the link does not expire.                                                             |

Random code, no expiry:

```bash
curl -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/docs"}'
```

Custom code that expires in one day (`86400` seconds):

```bash
curl -X POST http://localhost:3000/api/links \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/docs","code":"docs","expiresIn":86400}'
```

`201`

```json
{
  "code": "docs",
  "url": "https://example.com/docs",
  "shortUrl": "http://localhost:3000/docs",
  "clicks": 0,
  "expiresAt": "2026-10-13T12:00:00.000Z",
  "createdAt": "2026-10-12T12:00:00.000Z"
}
```

`expiresAt` is `null` when the link does not expire. `shortUrl` is `BASE_URL` plus `/` plus `code`.

| Status | When                                                                                   |
| ------ | -------------------------------------------------------------------------------------- |
| `400`  | Missing or invalid `url`, invalid `code`, invalid `expiresIn`, or the body is not JSON |
| `409`  | That custom `code` is already stored                                                   |
| `500`  | Five attempts to allocate a random code all collided                                   |

### `GET /api/links/:code`

Returns the same JSON shape as create. Does not increment `clicks`, so you can preview a link or check stats.

```bash
curl http://localhost:3000/api/links/docs
```

| Status | When                                            |
| ------ | ----------------------------------------------- |
| `200`  | Link exists and is not expired                  |
| `404`  | No row for that code                            |
| `410`  | The link existed and `expiresAt` is in the past |

### `GET /:code`

This is the public short URL. On success the response is **302 Found** with a `Location` header set to the stored URL. The browser follows it. `clicks` increases by 1 in the same database statement that checks expiry, so an expired link is not counted and is not redirected.

```bash
curl -i http://localhost:3000/docs
```

Follow the redirect from the command line:

```bash
curl -L http://localhost:3000/docs
```

| Status | When                                                            |
| ------ | --------------------------------------------------------------- |
| `302`  | Link exists and is not expired. `Location` is the original URL. |
| `404`  | No row for that code                                            |
| `410`  | The link has expired                                            |

The redirect is 302, not 301. A 301 can be cached by the browser, which would skip this server on later visits and stop the click count.

`/:code` is one path segment. It does not swallow `/api/links` or `/health`, because those routes are registered first and have more than one segment or an exact path.

## How the code is wired

```text
src/index.js            starts Express, opens SQLite, mounts routes
src/db.js               schema and prepared statements
src/routes/links.js     create, stats, and redirect
src/lib/urls.js         url and expiresIn checks
src/lib/codes.js        random codes and custom-code checks
data/shortener.db       created at startup, not committed
```

Startup in `src/index.js`:

1. Resolve `PORT`, `BASE_URL`, and `DATABASE_PATH`.
2. Call `openDatabase`, which creates the data directory, opens SQLite, and creates the `links` table if it is missing.
3. Parse JSON bodies.
4. Register `GET /health`.
5. Mount the links router at `/api/links` (`POST /` and `GET /:code` on that router).
6. Register `GET /:code` for redirects.
7. Send `{ "error": "invalid JSON" }` with status 400 when the body is not valid JSON, and `{ "error": "internal error" }` with status 500 for anything else.

### Create

`POST /api/links` validates `url`, then `code` if you sent one, then `expiresIn`. `expiresIn` is converted to `expires_at`, a unix timestamp in milliseconds. The row is inserted with `clicks = 0`. If you did not send a code, a 7-character code is generated and the insert is retried up to five times when that code is already taken. A custom-code collision returns 409 immediately.

### Stats

`GET /api/links/:code` loads the row by code. If `expires_at` is set and is less than or equal to now, the handler returns 410 and does not include the URL.

### Redirect

`GET /:code` runs one update:

```sql
UPDATE links
SET clicks = clicks + 1
WHERE code = ?
  AND (expires_at IS NULL OR expires_at > ?)
RETURNING url
```

If that returns a row, the response is a 302 to `url`. If it returns nothing, a second read decides between 404 and 410.

### Database

One table, `links`:

| Column       | Type                | Meaning                                            |
| ------------ | ------------------- | -------------------------------------------------- |
| `id`         | integer primary key | Internal row id                                    |
| `code`       | text, unique        | Short code used in the URL                         |
| `url`        | text                | Original `http` or `https` URL                     |
| `clicks`     | integer, default 0  | Successful redirects                               |
| `expires_at` | integer or null     | Expiry as unix milliseconds. Null means no expiry. |
| `created_at` | integer             | Creation time as unix milliseconds                 |

The API returns `expiresAt` and `createdAt` as ISO-8601 strings. SQLite is opened in WAL mode. Writes use prepared statements. A unique `code` conflict is caught and reported as `{ conflict: true }` instead of crashing the process.
# url-shortner
