import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const worker=require('./.compiled/index.js').default;
const domain=require('./.compiled/domain-lab.js');
const rootToken='phase22-test-root-secret';
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const file of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+file,'utf8'));
 const env={ADMIN_TOKEN:rootToken,DB:{prepare(sql){let x=[];return{bind(...args){x=args;return this},async first(){return db.prepare(sql).get(...x)??null},async all(){return{results:db.prepare(sql).all(...x)}},async run(){const result=db.prepare(sql).run(...x);return{meta:{changes:result.changes}}}}}}};
 return{db,env};
}
async function call(env,path,method='GET',data,token=rootToken){
 const req=new Request('https://tests.workers.dev'+path,{method,headers:{Authorization:'Bearer '+token,...(data===undefined?{}:{'Content-Type':'application/json'})},body:data===undefined?undefined:JSON.stringify(data)});
 const result=await worker.fetch(req,env);
 return{status:result.status,body:await result.json()};
}

test('regression matrix tracks case-level failures and recovery in chronological order',()=>{
 const runs=[{id:'r3',passed:2,failed:0},{id:'r2',passed:1,failed:1},{id:'r1',passed:2,failed:0}];
 const rows=[{run_id:'r1',case_id:'c',passed:1},{run_id:'r2',case_id:'c',passed:0},{run_id:'r3',case_id:'c',passed:1}];
 const report=domain.regressionMatrix(runs,rows,[{id:'c',title:'Consistency'}]);
 assert.deepEqual(report.runs.map(x=>x.id),['r1','r2','r3']);assert.equal(report.matrix[0].regressions,1);assert.equal(report.matrix[0].recoveries,1);assert.equal(report.matrix[0].unstable,true);
 assert.equal(report.summary.regressed_cases,1);
});
test('regression lab scopes observations to completed runs in one suite and target',async()=>{
 const {db,env}=fixture();try{
 db.prepare('INSERT INTO suites VALUES(?,?,?,?)').run('s1','Safety suite','', '2026');db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?,?)').run('c1','s1','Safety check','hello','','','2026');
 db.prepare('INSERT INTO targets VALUES(?,?,?,?,?)').run('t1','Fixture','','echo_fixture','2026');
 for(const [id,pass,status] of [['r1',1,'completed'],['r2',0,'completed'],['r3',1,'failed']]){
  db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)').run(id,'s1','t1',status,1,pass,1-pass,id,id);
  db.prepare('INSERT INTO results VALUES(?,?,?,?,?,?,?,?)').run('res-'+id,id,'c1','',pass,'[]',0,'2026');
 }
 const r=await call(env,'/api/lab/regressions?suite_id=s1');assert.equal(r.status,200);assert.equal(r.body.runs.length,2);assert.equal(r.body.matrix[0].regressions,1);
 assert.equal((await call(env,'/api/lab/regressions?suite_id=unknown')).status,404);
 }finally{db.close()}
});
