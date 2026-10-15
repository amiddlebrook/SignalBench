import test from 'node:test';import assert from 'node:assert/strict';import {scoreRun,compareRuns} from '../public/mission.js';
test('comparison uses observed pass and fail counts',()=>{assert.deepEqual(scoreRun({passed:7,failed:3}),{good:7,bad:3,total:10,pct:70})});
test('comparison preserves no-result semantics',()=>{assert.equal(scoreRun({passed:0,failed:0}).pct,null);assert.equal(compareRuns({passed:0,failed:0},{passed:8,failed:2}).delta,null)});
test('comparison expresses change in percentage points',()=>{assert.equal(compareRuns({passed:5,failed:5},{passed:8,failed:2}).delta,30)});
