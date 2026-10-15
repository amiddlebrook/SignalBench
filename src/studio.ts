import {list,json,type Env} from './core';
export async function studioApi(req:Request,env:Env,url:URL):Promise<Response|null>{
 if(url.pathname!=='/api/studio/run-comparison')return null;
 if(req.method!=='GET')return Response.json({error:'Method not allowed'},{status:405});
 const [runs,results]=await Promise.all([
  list<{id:string;suite_id:string;suite:string;target:string;status:string;passed:number;failed:number;created_at:string}>(env,'SELECT r.id,r.suite_id,s.name suite,t.name target,r.status,r.passed,r.failed,r.created_at FROM runs r JOIN suites s ON r.suite_id=s.id JOIN targets t ON r.target_id=t.id ORDER BY r.created_at DESC LIMIT 80'),
  list<{run_id:string;case_id:string;title:string;passed:number;latency_ms:number;reasons:string}>(env,'SELECT r.run_id,r.case_id,c.title,r.passed,r.latency_ms,r.reasons FROM results r JOIN cases c ON c.id=r.case_id ORDER BY r.created_at DESC LIMIT 1600')
 ]);
 const allowed=new Set(runs.map(r=>r.id));return json({runs,results:results.filter(r=>allowed.has(r.run_id)),limits:{runs:80,results:1600},note:'Only compare runs of the same suite. A result is comparable only when its case IDs match; fixture targets are not real model benchmarks.'});
}
