export function buildLegalInfo({
  repoRoot = '',
  sourceUrl = process.env.JOB_HUNTER_OS_SOURCE_URL || '',
} = {}) {
  return {
    project_name: 'Job Hunter OS',
    license_id: 'AGPL-3.0-only',
    warranty_notice: 'Provided without warranty. See LICENSE for details.',
    repo_path: repoRoot || null,
    source_url: sourceUrl || null,
    legal_paths: {
      license: '/LICENSE',
      notice: '/NOTICE',
      trademarks: '/TRADEMARKS.md',
      contributing: '/CONTRIBUTING.md',
      readme: '/README.md',
    },
    source_access_message: sourceUrl
      ? 'Source for this deployment is available at the configured public source URL.'
      : 'For local development, the corresponding source is available in this repository working copy.',
  };
}
