import { requireAdmin, rateLimit } from '@/lib/security';
import { json, errorResponse } from '@/lib/http';
import { queueAnalysis } from '@/lib/organization-jobs';
export function POST(request:Request) {
  try { requireAdmin(request,true); rateLimit('organize-batch',3,60000); return json({queued:queueAnalysis()}); }
  catch(error) {return errorResponse(error);}
}
