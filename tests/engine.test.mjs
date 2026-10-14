import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const moduleUnderTest=require(resolve('tests/.compiled/index.js'));
test('SignalBench: required and forbidden assertions',()=>{
  assert.equal(moduleUnderTest.grade('Hello team','hello','password').passed,true);
  assert.equal(moduleUnderTest.grade('Password is secret','hello','password').passed,false);
  assert.equal(moduleUnderTest.grade('x','hello|goodbye','').reasons.length,2);
});