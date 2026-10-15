import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {studioApi}=require('./.compiled/studio.js');
import {renderStudio} from '../public/studio.js';
function environment(){const db=new DatabaseSync(':memory:');for(const name of readdirSync('migrations').filter(x=>x.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+name,'utf8'));return {db,env:{DB:{prepare(q){let args=[];return {bind(...a){args=a;return this},async all(){return {results:db.prepare(q).all(...args)}},async first(){return db.prepare(q).get(...args)||null},async run(){const x=db.prepare(q).run(...args);return {meta:{changes:x.changes}}}}}}}}}
async function call(env,route,method='GET'){const req=new Request('http://localhost:8787'+route,{method});return studioApi(req,env,new URL(req.url))}

test('specialized SignalBench studio reads actual SQLite state',async()=>{
 const {db,env}=environment();try{db.exec(`INSERT INTO suites VALUES('s','Reliability','desc','2026-01-01'); INSERT INTO targets VALUES('t','Fixture','system','echo_fixture','2026-01-01'); INSERT INTO cases VALUES('c','s','Case A','prompt','ok','','2026-01-01'); INSERT INTO runs VALUES('r1','s','t','completed',1,1,0,'2026-01-01','2026-01-01'); INSERT INTO runs VALUES('r2','s','t','completed',1,0,1,'2026-01-01','2026-01-01'); INSERT INTO results VALUES('a','r1','c','ok',1,'[]',10,'2026-01-01'); INSERT INTO results VALUES('b','r2','c','bad',0,'[]',20,'2026-01-01');`);
 const response=await call(env,'/api/studio/run-comparison');assert.equal(response.status,200);const body=await response.json();assert.equal(body.runs.length,2);assert.equal(body.results.length,2);
 const denied=await call(env,'/api/studio/run-comparison','POST');assert.equal(denied.status,405);
 }finally{db.close()}
});
test('studio endpoints require a dedicated protected route and a working JS module',async()=>{const {db,env}=environment();try{assert.equal(await call(env,'/api/studio/missing'),null);assert.equal(typeof renderStudio,'function');}finally{db.close()}});
import {compareRuns} from '../public/studio.js';
test('case-aligned run diff counts regressed cases',()=>{const d=compareRuns({id:'a'},{id:'b'},[{run_id:'a',case_id:'1',title:'A',passed:1},{run_id:'b',case_id:'1',title:'A',passed:0}]);assert.equal(d.regressed,1);assert.equal(d.matched.length,1)});
