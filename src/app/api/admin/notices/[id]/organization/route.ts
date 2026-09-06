import { getNotice, updateOrganization } from '@/lib/db';
import { requireAdmin, rateLimit } from '@/lib/security';
import { json, errorResponse, readJson, organizationSchema } from '@/lib/http';
import { queueAnalysis } from '@/lib/organization-jobs';
export async function PATCH(request:Request, context:{params:Promise<{id:string}>}) {
  try { requireAdmin(request,true); const {id}=await context.params;
    const notice=updateOrganization(id,organizationSchema.parse(await readJson(request,3000)));
    return notice ? json({notice}) : json({error:'通知不存在'},404);
  } catch(error) {return errorResponse(error);}
}
export async function POST(request:Request, context:{params:Promise<{id:string}>}) {
  try { requireAdmin(request,true); rateLimit('organize-single',30,60000); const {id}=await context.params;
    const notice=getNotice(id,true); if(!notice) return json({error:'通知不存在'},404);
    if(notice.status!=='published') return json({error:'请先发布通知'},400);
    const queued=queueAnalysis(id); return json({queued,notice:getNotice(id,true)});
  } catch(error) {return errorResponse(error);}
}
