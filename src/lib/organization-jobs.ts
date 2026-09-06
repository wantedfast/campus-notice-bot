import { db, asNotice } from './db';
import type { Notice } from './types';
import type { NoticeCategory } from './categories';

export const ANALYSIS_LEASE_MS = 90000;
export type OrganizationResult = { category: NoticeCategory; title: string; summary: string; needsReview: boolean };
export function claimAnalysisJob(now = Date.now()): Notice | undefined {
  const connection = db(); connection.exec('BEGIN IMMEDIATE');
  try {
    connection.prepare(`UPDATE notices SET analysisState='failed', analysisError='整理中断，请重试'
      WHERE analysisState='running' AND analysisStartedAt<? AND analysisAttempts>=3`).run(now - ANALYSIS_LEASE_MS);
    const row = connection.prepare(`SELECT * FROM notices WHERE status='published' AND analysisAttempts<3 AND
      ((analysisState='pending' AND analysisNextAt<=?) OR (analysisState='running' AND analysisStartedAt<?))
      ORDER BY analysisNextAt, noticeAt DESC LIMIT 1`).get(now,now-ANALYSIS_LEASE_MS);
    if (!row) { connection.exec('COMMIT'); return undefined; }
    const notice = asNotice(row);
    connection.prepare(`UPDATE notices SET analysisState='running', analysisAttempts=analysisAttempts+1, analysisStartedAt=? WHERE id=?`).run(now,notice.id);
    connection.exec('COMMIT');
    return { ...notice, analysisState: 'running', analysisAttempts: notice.analysisAttempts+1, analysisStartedAt: now };
  } catch (error) { connection.exec('ROLLBACK'); throw error; }
}
export function completeAnalysisJob(job: Notice, result: OrganizationResult) {
  return db().prepare(`UPDATE notices SET
    category=CASE WHEN categoryLocked=1 THEN category ELSE ? END,
    summary=CASE WHEN summaryLocked=1 THEN summary ELSE ? END,
    generatedTitle=?, analysisState=?, analysisError=?, organizedAt=?, analysisStartedAt=0
    WHERE id=? AND status='published' AND analysisVersion=? AND analysisState='running' AND analysisStartedAt=?`)
    .run(result.category, result.summary, result.title, result.needsReview ? 'needs_review' : 'ready',
      result.needsReview ? '分类依据未能核对，请手动确认' : '', new Date().toISOString(),job.id,job.analysisVersion,job.analysisStartedAt).changes > 0;
}
export function failAnalysisJob(job: Notice, message: string, now = Date.now()) {
  const retry = job.analysisAttempts < 3;
  const delay = job.analysisAttempts === 1 ? 15000 : 60000;
  db().prepare(`UPDATE notices SET analysisState=?, analysisError=?, analysisNextAt=?, analysisStartedAt=0
    WHERE id=? AND analysisVersion=? AND status='published' AND analysisState='running' AND analysisStartedAt=?`)
    .run(retry ? 'pending' : 'failed', message, retry ? now+delay : 0,job.id,job.analysisVersion,job.analysisStartedAt);
}
export function queueAnalysis(id?: string) {
  // No change to publication time or locked fields. Running work is left alone.
  return db().prepare(`UPDATE notices SET analysisState='pending', analysisVersion=analysisVersion+1,
    analysisAttempts=0, analysisNextAt=0, analysisStartedAt=0, analysisError=''
    WHERE status='published' AND analysisState NOT IN ('pending','running')
    ${id ? 'AND id=?' : "AND analysisState IN ('idle','failed','needs_review')"}`)
    .run(...(id ? [id] : [])).changes;
}
