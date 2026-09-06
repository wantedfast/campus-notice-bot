import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Notice } from './types';

const state = globalThis as unknown as { campusDb?: DatabaseSync };
export function db() {
  if (!state.campusDb) {
    const path = resolve(/* turbopackIgnore: true */ process.env.DATABASE_PATH || './data/campus.sqlite');
    mkdirSync(dirname(path), { recursive: true });
    const connection = new DatabaseSync(path);
    connection.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS notices (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
        noticeAt TEXT NOT NULL, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','published'))
      );
      CREATE INDEX IF NOT EXISTS notices_status_time ON notices(status, noticeAt DESC);`);
    state.campusDb = connection;
  }
  return state.campusDb;
}
export function listNotices(admin = false): Notice[] {
  return db().prepare(`SELECT * FROM notices ${admin ? '' : "WHERE status='published'"} ORDER BY noticeAt DESC, updatedAt DESC`).all() as Notice[];
}
export function getNotice(id: string, admin = false): Notice | undefined {
  return db().prepare(`SELECT * FROM notices WHERE id=? ${admin ? '' : "AND status='published'"}`).get(id) as Notice | undefined;
}
export function saveNotice(input: Pick<Notice, 'body' | 'status'> & { title?: string }, id?: string): Notice | undefined {
  const now = new Date().toISOString();
  const previous = id ? getNotice(id, true) : undefined;
  if (id && !previous) return undefined;
  // Every publish action uses server time; draft saves preserve any prior publication time.
  const noticeAt = input.status === 'published' ? now : previous?.noticeAt || now;
  const title = input.title?.trim() || '';
  if (id) {
    const result = db().prepare('UPDATE notices SET title=?, body=?, noticeAt=?, status=?, updatedAt=? WHERE id=?')
      .run(title, input.body, noticeAt, input.status, now, id);
    if (!result.changes) return undefined;
  } else {
    id = randomUUID();
    db().prepare('INSERT INTO notices VALUES (?,?,?,?,?,?,?)').run(id, title, input.body, noticeAt, now, now, input.status);
  }
  return getNotice(id, true);
}
