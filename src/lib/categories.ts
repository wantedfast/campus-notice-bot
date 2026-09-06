export const CATEGORY_IDS = ['teaching', 'assignments', 'activities', 'careers', 'campus', 'other'] as const;
export type NoticeCategory = typeof CATEGORY_IDS[number];
export const CATEGORIES: { id: NoticeCategory; label: string; short: string; description: string }[] = [
  { id: 'teaching', label: '教学安排', short: '教学', description: '调课、课程、上课地点与教学安排' },
  { id: 'assignments', label: '作业考试', short: '作业考试', description: '作业、考试、补考与成绩' },
  { id: 'activities', label: '活动报名', short: '活动', description: '讲座、竞赛、社团与活动报名' },
  { id: 'careers', label: '实习就业', short: '实习就业', description: '实习、招聘与就业材料' },
  { id: 'campus', label: '校园事务', short: '校园事务', description: '缴费、信息采集、宿舍与证件' },
  { id: 'other', label: '其他通知', short: '其他', description: '不能明确归类的通知' }
];
export function categoryLabel(id: string) { return CATEGORIES.find(c => c.id === id)?.label || '其他通知'; }
export type AnalysisState = 'idle' | 'pending' | 'running' | 'ready' | 'failed' | 'needs_review';
export const ORGANIZATION_DEFAULTS = {
  category: 'other' as NoticeCategory, generatedTitle: '', summary: '',
  categoryLocked: false, summaryLocked: false, analysisState: 'idle' as AnalysisState,
  analysisVersion: 1, analysisAttempts: 0, analysisNextAt: 0, analysisStartedAt: 0,
  analysisError: '', organizedAt: ''
};
export function analysisLabel(state: AnalysisState, configured = true) {
  if (!configured && (state === 'pending' || state === 'running')) return '等待配置 AI';
  return { idle: '发布后自动整理', pending: '等待整理', running: '正在整理', ready: '已整理', failed: '整理失败', needs_review: '待确认' }[state];
}
