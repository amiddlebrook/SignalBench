import {body,first,list,execute,uid,now,json,required,fail,limit,type Env} from './core';
type Gate={id:string,suite_id:string,name:string,min_pass_rate:number,min_cases:number,baseline_run_id:string|null};
type Run={id:string,suite_id:string,status:string,passed:number,failed:number};
type Result={case_id:string,passed:number};
export function calculateGate(gate:Pick<Gate,'min_pass_rate'|'min_cases'>,results:Result[],baseline:Result[]=[]){
 const passed=results.filter(r=>r.passed===1).length,failed=results.length-passed;const pass_rate=results.length?passed/results.length:0;
 const previous=new Map(baseline.map(r=>[r.case_id,r.passed]));const regressions=results.filter(r=>previous.get(r.case_id)===1&&r.passed!==1).length;
 const accepted=results.length>=gate.min_cases && pass_rate>=gate.min_pass_rate && regressions===0;
 return {accepted,pass_rate,passed,failed,regressions,reason:accepted?'Release gate passed':`Gate failed: cases ${results.length}/${gate.min_cases}, pass-rate ${pass_rate.toFixed(3)}/${gate.min_pass_rate.toFixed(3)}, regressions ${regressions}`};
}
export async function advancedApi(req:Request,env:Env,url:URL):Promise<Response|null>{
 const p=url.pathname,m=req.method;
 if(p==='/api/gates'&&m==='GET')return json({items:await list(env,'SELECT g.*,s.name suite FROM quality_gates g JOIN suites s ON s.id=g.suite_id ORDER BY g.created_at DESC LIMIT ?',limit(url))});
 if(p==='/api/gates'&&m==='POST'){
  const b=await body(req),suite_id=required(b.suite_id,'suite_id');
  const suite=await first<{id:string}>(env,'SELECT id FROM suites WHERE id=?',suite_id);if(!suite)fail(404,'Suite not found');
  const min_pass_rate=Number(b.min_pass_rate),min_cases=Number(b.min_cases);
  if(!Number.isFinite(min_pass_rate)||min_pass_rate<0||min_pass_rate>1)fail(400,'min_pass_rate must be from 0 to 1');
  if(!Number.isSafeInteger(min_cases)||min_cases<1||min_cases>200)fail(400,'min_cases must be 1-200');
  const baseline_run_id=b.baseline_run_id?required(b.baseline_run_id,'baseline_run_id'):null;
  if(baseline_run_id){const base=await first<Run>(env,'SELECT * FROM runs WHERE id=?',baseline_run_id);if(!base||base.suite_id!==suite_id||base.status!=='completed')fail(400,'Baseline must be a completed run of the same suite')}
  const id=uid();await execute(env,'INSERT INTO quality_gates VALUES(?,?,?,?,?,?,?)',id,suite_id,required(b.name,'name'),min_pass_rate,min_cases,baseline_run_id,now());return json({id},201);
 }
 if(p==='/api/verdicts'&&m==='GET')return json({items:await list(env,'SELECT v.*,g.name gate FROM gate_verdicts v JOIN quality_gates g ON g.id=v.gate_id ORDER BY v.created_at DESC LIMIT ?',limit(url))});
 const test=p.match(/^\/api\/gates\/([^/]+)\/check$/);
 if(test&&m==='POST'){
  const g=await first<Gate>(env,'SELECT * FROM quality_gates WHERE id=?',test[1]);if(!g)fail(404,'Gate not found');
  const b=await body(req),r=await first<Run>(env,'SELECT * FROM runs WHERE id=?',required(b.run_id,'run_id'));
  if(!r||r.suite_id!==g.suite_id)fail(400,'Run must belong to gate suite');if(r.status!=='completed')fail(409,'Evaluation must be completed before release gate decision');
  const results=await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',r.id);
  const baseline=g.baseline_run_id?await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',g.baseline_run_id):[];
  const decision=calculateGate(g,results,baseline);const id=uid();
  await execute(env,'INSERT INTO gate_verdicts VALUES(?,?,?,?,?,?,?,?,?,?)',id,g.id,r.id,decision.accepted?'pass':'block',decision.pass_rate,decision.passed,decision.failed,decision.regressions,decision.reason,now());
  return json({id,gate_id:g.id,run_id:r.id,outcome:decision.accepted?'pass':'block',...decision});
 }
 return null;
}
