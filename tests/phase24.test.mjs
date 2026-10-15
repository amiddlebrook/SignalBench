import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
const worker=createRequire(import.meta.url)('./.compiled/index.js').default;
const token='phase24-root-private-secret';
const origin='https://portfolio-test.workers.dev';
function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const f of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort())db.exec(readFileSync('migrations/'+f,'utf8'));
 const env={ADMIN_TOKEN:token,DB:{prepare(sql){let params=[];return{bind(...args){params=args;return this},async first(){return db.prepare(sql).get(...params)??null},async all(){return{results:db.prepare(sql).all(...params)}},async run(){const r=db.prepare(sql).run(...params);return{meta:{changes:r.changes}}}}}}};
 return {db,env};
}
async function call(env,path,method='GET',data,auth=token){const headers=auth?{Authorization:'Bearer '+auth}:{};
 if(data!==undefined)headers['Content-Type']='application/json';
 const res=await worker.fetch(new Request(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)}),env);
 return {status:res.status,headers:res.headers,data:await res.json()};}
test('Phase 24: public health, protected product API, scoped read key and revoked key',async()=>{
 const {db,env}=fixture();try{
 const health=await call(env,'/api/health','GET',undefined,'');assert.equal(health.status,200);
 assert.equal((await call(env,'/api/overview','GET',undefined,'')).status,401);
 const created=await call(env,'/api/access/keys','POST',{label:'restricted audit reader',role:'viewer',route_prefix:'/api/lab/',expires_in_days:1});
 assert.equal(created.status,201);const viewer=created.data.token;
 assert.equal((await call(env,'/api/overview','GET',undefined,viewer)).status,403);
 assert.notEqual((await call(env,"/api/lab/regressions?suite_id=missing",'GET',undefined,viewer)).status,403,'valid lab-scoped reader must pass scope check');
 assert.equal((await call(env,'/api/access/keys','POST',{label:'should fail',role:'viewer'},viewer)).status,403);
 assert.equal((await call(env,"/api/lab/regressions?suite_id=missing",'POST',{},viewer)).status,403,'view-only tokens cannot mutate');
 assert.equal((await call(env,'/api/access/keys/'+created.data.id+'/revoke','POST',{})).status,200);
 assert.equal((await call(env,"/api/lab/regressions?suite_id=missing",'GET',undefined,viewer)).status,401,'revoked credentials are denied');
 const invalid=await call(env,'/api/overview','GET',undefined,'bad-token-12345');assert.equal(invalid.status,401);
 const authorized=await call(env,'/api/overview');assert.equal(authorized.status,200);
 for(const response of [authorized,invalid]){assert.equal(response.headers.get('x-content-type-options'),'nosniff');assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(response.headers.get('x-frame-options'),'DENY');assert.ok(response.headers.get('x-request-id'))}
 }finally{db.close()}
});

test('Phase 24: evaluated suite is immutable, preserving historical case coverage',async()=>{
 const {db,env}=fixture();try{
 const suite=await call(env,'/api/suites','POST',{name:'Baseline suite'});assert.equal(suite.status,201);
 const first=await call(env,'/api/cases','POST',{suite_id:suite.data.id,title:'Invariant',prompt:'echo ok'});assert.equal(first.status,201);
 const target=await call(env,'/api/targets','POST',{name:'Deterministic fixture',mode:'echo_fixture'});assert.equal(target.status,201);
 const run=await call(env,`/api/suites/${suite.data.id}/evaluate`,'POST',{target_id:target.data.id});assert.equal(run.status,201);
 const changed=await call(env,'/api/cases','POST',{suite_id:suite.data.id,title:'Late mutation',prompt:'new test'});assert.equal(changed.status,409);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM cases WHERE suite_id=?').get(suite.data.id).n,1);
 }finally{db.close()}
});
