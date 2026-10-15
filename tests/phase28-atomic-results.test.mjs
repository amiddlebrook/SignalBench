import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {readdirSync,readFileSync} from 'node:fs';
const app=createRequire(import.meta.url)('./.compiled/index.js');
function fixture(){
 const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
 for(const name of readdirSync('migrations').filter(s=>s.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));
 const env={FREE_AI_ENABLED:'false',DB:{prepare(sql){let values=[];return{bind(...v){values=v;return this},async first(){return db.prepare(sql).get(...values)??null},async all(){return{results:db.prepare(sql).all(...values)}},async run(){const x=db.prepare(sql).run(...values);return{meta:{changes:x.changes}}}}}}};
 return{db,env};
}
async function call(env,path,data,method){const url=new URL('https://test.local'+path);const req=new Request(url,{method:method||(data===undefined?'GET':'POST'),headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const res=await app.api(req,env,url);return {status:res.status,data:await res.json()};}
async function prepare(env){
 const suite=(await call(env,'/api/suites',{name:'Atomic evaluation'})).data;
 for(const [title,prompt] of [['First','first prompt'],['Second','second prompt']])await call(env,'/api/cases',{suite_id:suite.id,title,prompt});
 const target=(await call(env,'/api/targets',{name:'Deterministic',mode:'echo_fixture'})).data;
 const run=(await call(env,`/api/suites/${suite.id}/evaluate`,{target_id:target.id})).data;
 return {suite,run};
}
test('each evaluation result and counter transition commits atomically',async()=>{
 const f=fixture();try{
  const {run}=await prepare(f.env);
  const first=await call(f.env,`/api/runs/${run.id}/step`,{});
  assert.equal(first.data.status,'running');assert.equal(first.data.cursor,1);assert.equal(first.data.results.length,1);
  const second=await call(f.env,`/api/runs/${run.id}/step`,{});
  assert.equal(second.data.status,'completed');assert.equal(second.data.cursor,2);assert.equal(second.data.results.length,2);
  const row=f.db.prepare('SELECT cursor,passed,failed FROM runs WHERE id=?').get(run.id);
  assert.equal(row.cursor,2);assert.equal(row.passed+row.failed,2);
  assert.equal((await call(f.env,`/api/runs/${run.id}/step`,{}).catch(e=>({status:e.status}))).status,409);
 }finally{f.db.close()}
});
test('broken counter storage rolls back inserted result and never falsely completes evaluation',async()=>{
 const f=fixture();try{
  const {run}=await prepare(f.env);
  f.db.exec(`CREATE TRIGGER deny_counter_update BEFORE UPDATE OF cursor ON runs
  WHEN NEW.cursor>OLD.cursor BEGIN SELECT RAISE(ABORT,'simulated counter write failure'); END;`);
  await assert.rejects(()=>call(f.env,`/api/runs/${run.id}/step`,{}));
  const count=f.db.prepare('SELECT COUNT(*) n FROM results WHERE run_id=?').get(run.id).n;
  assert.equal(count,0);
  const state=f.db.prepare('SELECT cursor,passed,failed,status FROM runs WHERE id=?').get(run.id);
  assert.equal(state.cursor,0);assert.equal(state.passed,0);assert.equal(state.failed,0);assert.notEqual(state.status,'completed');
 }finally{f.db.close()}
});
test('out of order production result is rejected without advancing the run',async()=>{
 const f=fixture();try{
  const {run,suite}=await prepare(f.env);
  f.db.prepare("UPDATE runs SET status='processing' WHERE id=?").run(run.id);
  const second=f.db.prepare('SELECT id FROM cases WHERE suite_id=? ORDER BY created_at,id LIMIT 1 OFFSET 1').get(suite.id).id;
  assert.throws(()=>f.db.prepare('INSERT INTO results VALUES(?,?,?,?,?,?,?,?)').run('forged',run.id,second,'bad',1,'[]',0,'2026'),/sequence/);
  assert.equal(f.db.prepare('SELECT COUNT(*) n FROM results WHERE run_id=?').get(run.id).n,0);
  assert.equal(f.db.prepare('SELECT cursor FROM runs WHERE id=?').get(run.id).cursor,0);
 }finally{f.db.close()}
});
