import {first,list,fail,json,required,type Env} from './core';
type Run={id:string;suite_id:string;target_id:string;created_at:string;passed:number;failed:number};
type Result={run_id:string;case_id:string;passed:number};
export function regressionMatrix(runs:Run[],results:Result[],cases:{id:string;title:string}[]){
 const byRun=new Map<string,Map<string,boolean>>();
 for(const run of runs)byRun.set(run.id,new Map());
 for(const row of results)byRun.get(row.run_id)?.set(row.case_id,row.passed===1);
 const chronological=[...runs].reverse();
 const matrix=cases.map(c=>{
  const observations=chronological.map(r=>({run_id:r.id,result:byRun.get(r.id)?.get(c.id)??null}));
  const measured=observations.filter(o=>o.result!==null);
  let regressions=0,recoveries=0;
  for(let i=1;i<measured.length;i++){
   if(measured[i-1].result===true&&measured[i].result===false)regressions++;
   if(measured[i-1].result===false&&measured[i].result===true)recoveries++;
  }
  return {case_id:c.id,title:c.title,observations,regressions,recoveries,unstable:regressions>0&&recoveries>0};
 });
 const latest=runs[0];
 return {runs:chronological.map(r=>({...r,pass_rate:r.passed+r.failed?Number((r.passed/(r.passed+r.failed)).toFixed(4)):null})),matrix,summary:{runs:runs.length,cases:cases.length,regressed_cases:matrix.filter(m=>m.regressions>0).length,unstable_cases:matrix.filter(m=>m.unstable).length,latest_run:latest?.id??null},notes:'Comparisons cover completed runs for one suite and one target; results indicate observed changes, not statistical significance'};
}
export async function domainLabApi(req:Request,env:Env,url:URL):Promise<Response|null>{
 if(url.pathname!=='/api/lab/regressions'||req.method!=='GET')return null;
 const suite=required(url.searchParams.get('suite_id'),'suite_id',100);
 const exists=await first<{id:string}>(env,'SELECT id FROM suites WHERE id=?',suite);if(!exists)fail(404,'Suite not found');
 let target=url.searchParams.get('target_id');
 if(!target){const latest=await first<{target_id:string}>(env,"SELECT target_id FROM runs WHERE suite_id=? AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 1",suite);target=latest?.target_id??null;}
 const runs=target?await list<Run>(env,"SELECT id,suite_id,target_id,created_at,passed,failed FROM runs WHERE suite_id=? AND target_id=? AND status='completed' ORDER BY created_at DESC,id DESC LIMIT 8",suite,target):[];
 const cases=await list<{id:string;title:string}>(env,'SELECT id,title FROM cases WHERE suite_id=? ORDER BY created_at,id LIMIT 200',suite);
 const results:Result[]=[];
 for(const run of runs)results.push(...await list<Result>(env,'SELECT run_id,case_id,passed FROM results WHERE run_id=?',run.id));
 return json({suite_id:suite,target_id:target,...regressionMatrix(runs,results,cases)});
}
