import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLegalInfo } from '../apps/dashboard/lib/legal-info.mjs';

test('legal info defaults to AGPL-3.0-only and local source guidance', () => {
  const info = buildLegalInfo({ repoRoot: '/tmp/job-hunter-os' });

  assert.equal(info.license_id, 'AGPL-3.0-only');
  assert.equal(info.repo_path, '/tmp/job-hunter-os');
  assert.equal(info.source_url, null);
  assert.match(info.source_access_message, /local development/i);
});

test('legal info prefers configured public source URL when present', () => {
  const info = buildLegalInfo({
    repoRoot: '/tmp/job-hunter-os',
    sourceUrl: 'https://example.com/job-hunter-os',
  });

  assert.equal(info.source_url, 'https://example.com/job-hunter-os');
  assert.match(info.source_access_message, /public source url/i);
});
