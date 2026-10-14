import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const app=require('./.compiled/index.js');
const advanced=require('./.compiled/advanced.js');
function env(){const sql=new DatabaseSync(':memory:');for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));return {sql,DB:{prepare(q){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sql.prepare(q).all(...args)}},async first(){return sql.prepare(q).get(...args)??null},async run(){const x=sql.prepare(q).run(...args);return {meta:{changes:x.changes}}}}}},AI:{async run(){return {response:'Fixture response'}}},stop(){sql.close()}}}
async function call(e,path,data,method){const req=new Request('http://localhost:8787'+path,{method:method||(data===undefined?'GET':'POST'),headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const res=await app.api(req,e,new URL(req.url));if(!res.ok)throw new Error(`${path} ${res.status} ${await res.text()}`);return res.json()}
async function rejected(e,path,data,status){const req=new Request('http://localhost:8787'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});await assert.rejects(()=>app.api(req,e,new URL(req.url)),ex=>ex.status===status)}
test('confidence-aware gates block tiny perfect samples and persist Wilson interval',async()=>{const e=env();try{
assert.ok(advanced.wilsonLowerBound(1,1)<0.3);
assert.ok(advanced.wilsonLowerBound(100,100)>0.96);
const suite=await call(e,'/api/suites',{name:'Confidence demo'}),target=await call(e,'/api/targets',{name:'Fixture',mode:'echo_fixture'});
await call(e,'/api/cases',{suite_id:suite.id,title:'One easy test',prompt:'hello',expected_contains:'hello'});
const r=await call(e,`/api/suites/${suite.id}/evaluate`,{target_id:target.id});await call(e,`/api/runs/${r.id}/step`,{});
const gate=await call(e,'/api/gates',{suite_id:suite.id,name:'Confidence guard',min_pass_rate:.95,min_cases:1,confidence_floor:.8});
const checked=await call(e,`/api/gates/${gate.id}/check`,{run_id:r.id});assert.equal(checked.outcome,'block');assert.ok(checked.lower_bound<.3);
const saved=await call(e,'/api/verdicts');assert.ok(saved.items[0].lower_bound<.3);
await rejected(e,'/api/gates',{suite_id:suite.id,name:'Bad',min_pass_rate:1,min_cases:1,confidence_floor:1.2},400);
}finally{e.stop()}});
