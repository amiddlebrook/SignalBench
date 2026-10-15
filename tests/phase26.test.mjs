import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const app=require('./.compiled/index.js');
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const name of readdirSync('migrations').filter(s=>s.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 let aiCalls=0;
 const env={ADMIN_TOKEN:'phase26-fixture-root-secret',FREE_AI_ENABLED:'false',DB:{prepare(sql){let args=[];return{bind(...v){args=v;return this},async first(){return db.prepare(sql).get(...args)??null},async all(){return{results:db.prepare(sql).all(...args)}},async run(){const x=db.prepare(sql).run(...args);return{meta:{changes:x.changes}}}}}},AI:{async run(){aiCalls++;return{response:'AI should not be invoked'}}}};
 return {db,env,get aiCalls(){return aiCalls},close(){db.close()}};
}
async function call(f,path,payload,method){const url=new URL('http://localhost:8787'+path);const req=new Request(url,{method:method||(payload===undefined?'GET':'POST'),headers:payload===undefined?{}:{'Content-Type':'application/json'},body:payload===undefined?undefined:JSON.stringify(payload)});return app.api(req,f.env,url).then(async res=>({status:res.status,data:await res.json()}));}
async function rejects(f,path,payload,status,method){await assert.rejects(()=>call(f,path,payload,method),e=>e.status===status)}
test('release preview is read-only and complete runs are certified',async()=>{
 const f=fixture();try{
 const suite=(await call(f,'/api/suites',{name:'Critical benchmark'})).data;
 await call(f,'/api/cases',{suite_id:suite.id,title:'Invoice',prompt:'invoice',expected_contains:'invoice'});
 const target=(await call(f,'/api/targets',{name:'Free deterministic fixture',mode:'echo_fixture'})).data;
 const run=(await call(f,`/api/suites/${suite.id}/evaluate`,{target_id:target.id})).data;
 const gate=(await call(f,'/api/gates',{suite_id:suite.id,name:'Release gate',min_pass_rate:1,min_cases:1})).data;
 await rejects(f,`/api/gates/${gate.id}/preview`,{run_id:run.id},409);
 await call(f,`/api/runs/${run.id}/step`,{});
 const preview=(await call(f,`/api/gates/${gate.id}/preview`,{run_id:run.id})).data;
 assert.equal(preview.accepted,true);assert.equal(preview.complete_case_coverage,true);assert.equal(preview.read_only,true);
 assert.equal(f.db.prepare('SELECT COUNT(*) n FROM gate_verdicts').get().n,0);
 const verified=await call(f,`/api/gates/${gate.id}/check`,{run_id:run.id});assert.equal(verified.data.outcome,'pass');
 }finally{f.close()}
});
test('corrupted completed run cannot pass a release gate',async()=>{
 const f=fixture();try{
 const suite=(await call(f,'/api/suites',{name:'Never silently skip cases'})).data;
 await call(f,'/api/cases',{suite_id:suite.id,title:'A',prompt:'one'});
 await call(f,'/api/cases',{suite_id:suite.id,title:'B',prompt:'two'});
 const target=(await call(f,'/api/targets',{name:'Deterministic',mode:'echo_fixture'})).data;
 const run=(await call(f,`/api/suites/${suite.id}/evaluate`,{target_id:target.id})).data;
 f.db.prepare("UPDATE runs SET status='completed' WHERE id=?").run(run.id);
 const gate=(await call(f,'/api/gates',{suite_id:suite.id,name:'Immutable release',min_pass_rate:0,min_cases:1})).data;
 const preview=(await call(f,`/api/gates/${gate.id}/preview`,{run_id:run.id})).data;
 assert.equal(preview.outcome,'block');assert.equal(preview.complete_case_coverage,false);
 await rejects(f,`/api/gates/${gate.id}/check`,{run_id:run.id},409);
 }finally{f.close()}
});
