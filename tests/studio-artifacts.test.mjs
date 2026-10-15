import test from 'node:test';
import assert from 'node:assert/strict';
import {benchmarkReportFor} from '../public/studio.js';
import {downloadArtifact} from '../public/studio-export.js';
test('studio supports explicit domain-specific artifact export',()=>{assert.equal(typeof benchmarkReportFor,'function');assert.equal(typeof downloadArtifact,'function');});
test('domain report derives truthful, bounded artifacts from selected records',()=>{  const report=benchmarkReportFor({id:'a',status:'completed'},{id:'b',status:'completed'},{matched:[{title:'test',from:1,to:0}],improved:0,regressed:1,unmatched:0});assert.equal(report.regressions,1);assert.match(report.disclaimer,/not a significance test/); });
