import {body,first,list,execute,uid,now,json,required,fail,limit,type Env} from './core';
type Gate={id:string,suite_id:string,name:string,min_pass_rate:number,min_cases:number,baseline_run_id:string|null;confidence_floor:number};
type Run={id:string,suite_id:string,status:string,passed:number,failed:number};
type Result={case_id:string,passed:number};
export function wilsonLowerBound(passed:number,total:number,z=1.959963984540054){
 if(!Number.isInteger(total)||total<=0||passed<0||passed>total)return 0;
 const phat=passed/total,z2=z*z,denom=1+z2/total;
 return Math.max(0,(phat+z2/(2*total)-z*Math.sqrt(phat*(1-phat)/total+z2/(4*total*total)))/denom);
}
export function calculateGate(gate:Pick<Gate,'min_pass_rate'|'min_cases'|'confidence_floor'>,results:Result[],baseline:Result[]=[]){
 const passed=results.filter(r=>r.passed===1).length,failed=results.length-passed;const pass_rate=results.length?passed/results.length:0;
 const previous=new Map(baseline.map(r=>[r.case_id,r.passed]));const regressions=results.filter(r=>previous.get(r.case_id)===1&&r.passed!==1).length;
 const lower_bound=wilsonLowerBound(passed,results.length);const confidence_floor=Number(gate.confidence_floor||0);
 const accepted=results.length>=gate.min_cases && pass_rate>=gate.min_pass_rate && regressions===0 && (confidence_floor===0||lower_bound>=confidence_floor);
 return {accepted,pass_rate,lower_bound,confidence_floor,passed,failed,regressions,reason:accepted?'Release gate passed':`Gate failed: cases ${results.length}/${gate.min_cases}, pass-rate ${pass_rate.toFixed(3)}/${gate.min_pass_rate.toFixed(3)}, regressions ${regressions}, Wilson95 ${lower_bound.toFixed(3)}/${confidence_floor.toFixed(3)}`};
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
  const confidence_floor=b.confidence_floor===undefined?0:Number(b.confidence_floor);
  if(!Number.isFinite(confidence_floor)||confidence_floor<0||confidence_floor>1)fail(400,'confidence_floor must be from 0 to 1');
  const baseline_run_id=b.baseline_run_id?required(b.baseline_run_id,'baseline_run_id'):null;
  if(baseline_run_id){const base=await first<Run>(env,'SELECT * FROM runs WHERE id=?',baseline_run_id);if(!base||base.suite_id!==suite_id||base.status!=='completed')fail(400,'Baseline must be a completed run of the same suite')}
  const id=uid();await execute(env,'INSERT INTO quality_gates(id,suite_id,name,min_pass_rate,min_cases,baseline_run_id,created_at,confidence_floor) VALUES(?,?,?,?,?,?,?,?)',id,suite_id,required(b.name,'name'),min_pass_rate,min_cases,baseline_run_id,now(),confidence_floor);return json({id,confidence_floor},201);
 }
 if(p==='/api/verdicts'&&m==='GET')return json({items:await list(env,'SELECT v.*,g.name gate FROM gate_verdicts v JOIN quality_gates g ON g.id=v.gate_id ORDER BY v.created_at DESC LIMIT ?',limit(url))});
 const preview=p.match(/^\/api\/gates\/([^/]+)\/preview$/);
 if(preview&&m==='POST'){
  const b=await body(req),gate=await first<Gate>(env,'SELECT * FROM quality_gates WHERE id=?',preview[1]);if(!gate)fail(404,'Gate not found');
  const run=await first<Run>(env,'SELECT * FROM runs WHERE id=?',required(b.run_id,'run_id'));
  if(!run||run.suite_id!==gate.suite_id)fail(400,'Run must belong to gate suite');
  if(run.status!=='completed')fail(409,'Run must be complete before gating');
  const results=await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',run.id);
  const expected=await list<{id:string}>(env,'SELECT id FROM cases WHERE suite_id=?',gate.suite_id);
  const ids=new Set(results.map(x=>x.case_id));
  const complete=expected.length===results.length && expected.every(x=>ids.has(x.id));
  const baseline=gate.baseline_run_id?await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',gate.baseline_run_id):[];
  const baselineComplete=!gate.baseline_run_id || (baseline.length===expected.length&&expected.every(x=>baseline.some(b=>b.case_id===x.id)));
  const outcome=calculateGate(gate,results,baseline);
  return json({gate_id:gate.id,run_id:run.id,outcome:complete&&baselineComplete&&outcome.accepted?'pass':'block',...outcome,accepted:complete&&baselineComplete&&outcome.accepted,case_coverage:results.length,expected_cases:expected.length,complete_case_coverage:complete,complete_baseline_coverage:baselineComplete,read_only:true});
 }
 const test=p.match(/^\/api\/gates\/([^/]+)\/check$/);
 if(test&&m==='POST'){
  const g=await first<Gate>(env,'SELECT * FROM quality_gates WHERE id=?',test[1]);if(!g)fail(404,'Gate not found');
  const b=await body(req),r=await first<Run>(env,'SELECT * FROM runs WHERE id=?',required(b.run_id,'run_id'));
  if(!r||r.suite_id!==g.suite_id)fail(400,'Run must belong to gate suite');if(r.status!=='completed')fail(409,'Evaluation must be completed before release gate decision');
  const results=await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',r.id);
  const expected=await list<{id:string}>(env,'SELECT id FROM cases WHERE suite_id=?',g.suite_id);
  const resultIds=new Set(results.map(v=>v.case_id));
  if(results.length!==expected.length||expected.some(v=>!resultIds.has(v.id)))fail(409,'Evaluation result coverage is incomplete; release cannot be certified');
  const baseline=g.baseline_run_id?await list<Result>(env,'SELECT case_id,passed FROM results WHERE run_id=?',g.baseline_run_id):[];
  if(g.baseline_run_id && (baseline.length!==expected.length||expected.some(v=>!baseline.some(x=>x.case_id===v.id))))fail(409,'Pinned baseline is incomplete; release cannot be certified');
  const decision=calculateGate(g,results,baseline);const id=uid();
  await execute(env,'INSERT INTO gate_verdicts(id,gate_id,run_id,outcome,pass_rate,passed,failed,regressions,detail,created_at,lower_bound) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,g.id,r.id,decision.accepted?'pass':'block',decision.pass_rate,decision.passed,decision.failed,decision.regressions,decision.reason,now(),decision.lower_bound);
  return json({id,gate_id:g.id,run_id:r.id,outcome:decision.accepted?'pass':'block',...decision});
 }
 return null;
}
