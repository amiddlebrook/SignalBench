import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readdirSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const app=require('./.compiled/index.js');
const advanced=require('./.compiled/advanced.js');
function env(){
 const sql=new DatabaseSync(':memory:');
 for(const f of readdirSync('migrations').filter(f=>f.endsWith('.sql')).sort())sql.exec(readFileSync('migrations/'+f,'utf8'));
 return { sql,DB:{prepare(query){let args=[];return {bind(...x){args=x;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)??null},async run(){const r=sql.prepare(query).run(...args);return {meta:{changes:r.changes}}}}}},FREE_AI_ENABLED:'true',AI:{async run(){return {response:'Fixture test response'}}},stop(){sql.close()}};
}
async function call(e,path,data,method){const request=new Request('http://localhost:8787'+path,{method:method||(data===undefined?'GET':'POST'),headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const response=await app.api(request,e,new URL(request.url));assert.ok(response.ok,`${path}: HTTP ${response.status}`);return response.json()}
async function rejection(e,path,data,status=400){const request=new Request('http://localhost:8787'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});await assert.rejects(()=>app.api(request,e,new URL(request.url)),err=>err.status===status)}
test('quality gate blocks regressions and low sample sizes',async()=>{
 const e=env();try{const suite=await call(e,'/api/suites',{name:'Ship safely'});const target=await call(e,'/api/targets',{name:'Fixture',mode:'echo_fixture'});
 await call(e,'/api/cases',{suite_id:suite.id,title:'hello',prompt:'say hello',expected_contains:'hello',forbidden_contains:'secret'});
 const run=await call(e,`/api/suites/${suite.id}/evaluate`,{target_id:target.id});
 const gate=await call(e,'/api/gates',{suite_id:suite.id,name:'95% guard',min_pass_rate:.95,min_cases:1});
 await rejection(e,`/api/gates/${gate.id}/check`,{run_id:run.id},409);
 const completed=await call(e,`/api/runs/${run.id}/step`,{});assert.equal(completed.status,'completed');
 const verdict=await call(e,`/api/gates/${gate.id}/check`,{run_id:run.id});assert.equal(verdict.outcome,'pass');
 const strict=await call(e,'/api/gates',{suite_id:suite.id,name:'Require more data',min_pass_rate:.95,min_cases:5});
 const blocked=await call(e,`/api/gates/${strict.id}/check`,{run_id:run.id});assert.equal(blocked.outcome,'block');
 const score=advanced.calculateGate({min_pass_rate:.8,min_cases:2},[{case_id:'x',passed:0},{case_id:'y',passed:1}],[{case_id:'x',passed:1},{case_id:'y',passed:1}]);assert.equal(score.regressions,1);assert.equal(score.accepted,false);
 }finally{e.stop()}
});
