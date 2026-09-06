import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Notice } from './types';
import type { NoticeCategory } from './categories';

export function migrateOrganization(connection: DatabaseSync) {
  connection.exec('BEGIN IMMEDIATE');
  try {
    const existing = new Set((connection.prepare('PRAGMA table_info(notices)').all() as { name: string }[]).map(c => c.name));
    const columns: Record<string, string> = {
      category: "TEXT NOT NULL DEFAULT 'other'", generatedTitle: "TEXT NOT NULL DEFAULT ''", summary: "TEXT NOT NULL DEFAULT ''",
      categoryLocked: 'INTEGER NOT NULL DEFAULT 0', summaryLocked: 'INTEGER NOT NULL DEFAULT 0',
      analysisState: "TEXT NOT NULL DEFAULT 'idle'", analysisVersion: 'INTEGER NOT NULL DEFAULT 1',
      analysisAttempts: 'INTEGER NOT NULL DEFAULT 0', analysisNextAt: 'INTEGER NOT NULL DEFAULT 0',
      analysisStartedAt: 'INTEGER NOT NULL DEFAULT 0', analysisError: "TEXT NOT NULL DEFAULT ''", organizedAt: "TEXT NOT NULL DEFAULT ''"
    };
    for (const [name, definition] of Object.entries(columns)) if (!existing.has(name)) connection.exec(`ALTER TABLE notices ADD COLUMN ${name} ${definition}`);
    if (!existing.has('analysisState')) connection.exec("UPDATE notices SET analysisState='pending' WHERE status='published'");
    connection.exec('CREATE INDEX IF NOT EXISTS notices_analysis_queue ON notices(analysisState, analysisNextAt); COMMIT');
  } catch (error) { connection.exec('ROLLBACK'); throw error; }
}
export function asNotice(row: unknown): Notice {
  const notice = row as Notice;
  return { ...notice, categoryLocked: !!notice.categoryLocked, summaryLocked: !!notice.summaryLocked };
}

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
    migrateOrganization(connection);
    state.campusDb = connection;
  }
  return state.campusDb;
}
export function listNotices(admin = false): Notice[] {
  return db().prepare(`SELECT * FROM notices ${admin ? '' : "WHERE status='published'"} ORDER BY noticeAt DESC, updatedAt DESC`).all().map(asNotice);
}
export function getNotice(id: string, admin = false): Notice | undefined {
  const row = db().prepare(`SELECT * FROM notices WHERE id=? ${admin ? '' : "AND status='published'"}`).get(id);
  return row ? asNotice(row) : undefined;
}
export type OrganizationOverrides = { categoryOverride?: NoticeCategory | null; summaryOverride?: string | null };
export function saveNotice(input: Pick<Notice, 'body' | 'status'> & { title?: string } & OrganizationOverrides, id?: string): Notice | undefined {
  const now = new Date().toISOString();
  const previous = id ? getNotice(id, true) : undefined;
  if (id && !previous) return undefined;
  // Every publish action uses server time; draft saves preserve any prior publication time.
  const noticeAt = input.status === 'published' ? now : previous?.noticeAt || now;
  const title = input.title?.trim() || '';
  const changed = !previous || previous.body !== input.body || previous.title !== title;
  const needsAnalysis = changed || previous?.status !== input.status;
  db().exec('BEGIN IMMEDIATE');
  try {
  if (id) {
    const result = db().prepare('UPDATE notices SET title=?, body=?, noticeAt=?, status=?, updatedAt=? WHERE id=?')
      .run(title, input.body, noticeAt, input.status, now, id);
    if (!result.changes) { db().exec('ROLLBACK'); return undefined; }
  } else {
    id = randomUUID();
    db().prepare('INSERT INTO notices (id,title,body,noticeAt,createdAt,updatedAt,status) VALUES (?,?,?,?,?,?,?)').run(id, title, input.body, noticeAt, now, now, input.status);
  }
  if (needsAnalysis) {
    db().prepare(`UPDATE notices SET analysisVersion=analysisVersion+1, analysisState=?, analysisAttempts=0,
      analysisNextAt=0, analysisStartedAt=0, analysisError='',
      generatedTitle=CASE WHEN ? THEN '' ELSE generatedTitle END,
      summary=CASE WHEN ? AND summaryLocked=0 THEN '' ELSE summary END,
      category=CASE WHEN ? AND categoryLocked=0 THEN 'other' ELSE category END,
      organizedAt=CASE WHEN ? THEN '' ELSE organizedAt END WHERE id=?`)
      .run(input.status === 'published' ? 'pending' : 'idle', +changed, +changed, +changed, +changed, id);
  }
  applyOverrides(id, input);
  db().exec('COMMIT');
  } catch (error) { db().exec('ROLLBACK'); throw error; }
  return getNotice(id, true);
}
function applyOverrides(id: string, input: OrganizationOverrides) {
  if (input.categoryOverride !== undefined) {
    db().prepare('UPDATE notices SET categoryLocked=?, category=? WHERE id=?').run(input.categoryOverride === null ? 0 : 1, input.categoryOverride || 'other', id);
  }
  if (input.summaryOverride !== undefined) {
    db().prepare('UPDATE notices SET summaryLocked=?, summary=? WHERE id=?').run(input.summaryOverride === null ? 0 : 1, input.summaryOverride || '', id);
  }
  if (input.categoryOverride === null || input.summaryOverride === null) {
    db().prepare(`UPDATE notices SET analysisVersion=analysisVersion+1, analysisState=CASE WHEN status='published' THEN 'pending' ELSE 'idle' END,
      analysisAttempts=0, analysisNextAt=0, analysisStartedAt=0, analysisError='' WHERE id=?`).run(id);
  }
}
export function updateOrganization(id: string, input: OrganizationOverrides) {
  if (!getNotice(id, true)) return undefined;
  db().exec('BEGIN IMMEDIATE');
  try { applyOverrides(id, input); db().prepare('UPDATE notices SET updatedAt=? WHERE id=?').run(new Date().toISOString(),id); db().exec('COMMIT'); }
  catch (error) { db().exec('ROLLBACK'); throw error; }
  return getNotice(id, true);
}
