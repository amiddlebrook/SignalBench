import {body,first,list,execute,json,required,oneOf,fail,now,uid,type Env} from './core';
export async function decisionApi(req:Request,env:Env,url:URL):Promise<Response|null>{
 const p=url.pathname;
 if(p==='/api/decision/triage'&&req.method==='GET'){
  const [failures,history]=await Promise.all([list(env,'SELECT r.id,r.run_id,r.case_id,c.title case_title,r.reasons,r.output,r.created_at FROM results r JOIN cases c ON c.id=r.case_id WHERE r.passed=0 ORDER BY r.created_at DESC LIMIT 100'),list<{result_id:string;status:string;severity:string;owner:string;note:string;created_at:string}>(env,'SELECT result_id,status,severity,owner,note,created_at FROM failure_triage ORDER BY created_at DESC, rowid DESC LIMIT 500')]);
  const latest=new Map<string,typeof history[number]>();for(const row of history)if(!latest.has(row.result_id))latest.set(row.result_id,row);
  return json({items:(failures as {id:string}[]).map(f=>({...f,triage:latest.get(f.id)||null})),limits:{failures:100,triage_events:500},note:'Only recorded failed evaluation results appear here; triage history is append-only.'});
 }
 if(p==='/api/decision/triage'&&req.method==='POST'){
  const b=await body(req,10000);const resultId=required(b.result_id,'result_id',100);
  if(!await first(env,'SELECT id FROM results WHERE id=? AND passed=0',resultId))fail(404,'Failed evaluation result not found');
  const status=oneOf(b.status,['open','investigating','resolved','accepted_risk'],'status');const severity=oneOf(b.severity,['low','medium','high','critical'],'severity');const owner=required(b.owner,'owner',80);const note=required(b.note,'note',1800);
  const id=uid();await execute(env,'INSERT INTO failure_triage VALUES(?,?,?,?,?,?,?)',id,resultId,status,severity,owner,note,now());return json({id,result_id:resultId,status},201);
 }
 if(p.startsWith('/api/decision/'))fail(404,'Unknown triage endpoint');return null;
}
