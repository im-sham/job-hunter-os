import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dashboardHtml = fs.readFileSync(
  path.resolve(__dirname, '..', 'apps', 'dashboard', 'public', 'index.html'),
  'utf-8'
);
const dashboardJs = fs.readFileSync(
  path.resolve(__dirname, '..', 'apps', 'dashboard', 'public', 'app.js'),
  'utf-8'
);

test('dashboard copy favors plain-language setup labels', () => {
  assert.match(dashboardHtml, /Build your foundation/);
  assert.match(dashboardHtml, /Find and review roles/);
  assert.match(dashboardHtml, /Finish one application/);
  assert.match(dashboardHtml, /Progress and details/);
  assert.match(dashboardHtml, /Setup Journey/);
  assert.match(dashboardHtml, /Choose Your Assistant/);
  assert.match(dashboardHtml, /Tell Us About Your Background/);
  assert.match(dashboardHtml, /Teach Us How You Write/);
  assert.match(dashboardHtml, /Choose Your Job Targets/);
  assert.match(dashboardHtml, /Save Reusable Application Details/);
  assert.match(dashboardHtml, /Find Jobs To Review/);
  assert.match(dashboardHtml, /Jobs Workspace/);
  assert.match(dashboardHtml, /To Review/);
  assert.match(dashboardHtml, /Pipeline/);
  assert.match(dashboardHtml, /Run Search With My Assistant/);
  assert.match(dashboardHtml, /Optional Extra Assistant Help/);
  assert.match(dashboardHtml, /Continue In Apply/);
  assert.match(dashboardHtml, /What we recommend/);
  assert.match(dashboardHtml, /Finish The Application/);
  assert.match(dashboardHtml, /Recommended Next Step/);
  assert.match(dashboardHtml, /If Search Pauses/);
  assert.match(dashboardHtml, /If You Feel Stuck/);
  assert.match(dashboardHtml, /Recovery Message/);
  assert.match(dashboardHtml, /Exactly What To Upload/);
  assert.match(dashboardHtml, /Message To Paste/);
  assert.match(dashboardHtml, /Why The App Paused/);
  assert.match(dashboardHtml, /Other Ways To Continue/);
  assert.match(dashboardHtml, /Local Browser Assist/);
  assert.match(dashboardHtml, /Use Local Browser Assist/);
  assert.match(dashboardHtml, /Ready For Final Review/);
  assert.match(dashboardHtml, /Direct apply link/);
  assert.doesNotMatch(dashboardHtml, />Add A Job To Pursue</);
  assert.doesNotMatch(dashboardHtml, />Prepare An Assistant Package</);
  assert.doesNotMatch(dashboardHtml, />Search Strategy</);
  assert.doesNotMatch(dashboardHtml, />Application Profile</);
  assert.doesNotMatch(dashboardHtml, />Agent Bridge</);
});

test('assistant setup appears before sourcing in the main flow markup', () => {
  const assistantIndex = dashboardHtml.indexOf('Choose Your Assistant');
  const sourcingIndex = dashboardHtml.indexOf('Find Jobs To Review');

  assert.notEqual(assistantIndex, -1);
  assert.notEqual(sourcingIndex, -1);
  assert.ok(assistantIndex < sourcingIndex);
});

test('dashboard recovery copy explains blocked states in plain language', () => {
  assert.match(dashboardJs, /The search package is ready, but no jobs have been loaded back into Job Hunter OS yet/);
  assert.match(dashboardJs, /The remaining work is outside the app in your chat assistant/);
  assert.match(dashboardJs, /The app paused on purpose at the final-review boundary/);
  assert.match(dashboardJs, /Use Ready For Final Review after the helper stops/);
  assert.match(dashboardJs, /Sensitive answers like/);
});
