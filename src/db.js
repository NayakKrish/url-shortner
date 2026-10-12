import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SQLITE_CONSTRAINT = 19;

let insertStmt;
let findStmt;
let clickStmt;

export function openDatabase(filePath) {
  mkdirSync(dirname(filePath), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      url TEXT NOT NULL,
      clicks INTEGER NOT NULL DEFAULT 0,
      expires_at INTEGER,
      created_at INTEGER NOT NULL
    );
  `);

  insertStmt = db.prepare(`
    INSERT INTO links (code, url, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);
  findStmt = db.prepare(`
    SELECT code, url, clicks, expires_at, created_at
    FROM links
    WHERE code = ?
  `);
  clickStmt = db.prepare(`
    UPDATE links
    SET clicks = clicks + 1
    WHERE code = ?
      AND (expires_at IS NULL OR expires_at > ?)
    RETURNING code, url, clicks, expires_at, created_at
  `);
}

export function insertLink({ code, url, expiresAt, createdAt }) {
  try {
    insertStmt.run(code, url, expiresAt, createdAt);
    return { ok: true };
  } catch (err) {
    if (isUniqueConstraint(err)) return { ok: false, conflict: true };
    throw err;
  }
}

export function findLink(code) {
  return findStmt.get(code) ?? null;
}

export function recordClick(code, now) {
  return clickStmt.get(code, now) ?? null;
}

function isUniqueConstraint(err) {
  return err?.errcode === SQLITE_CONSTRAINT || /UNIQUE constraint failed/i.test(err?.message ?? '');
}
