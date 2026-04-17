import crypto from 'crypto';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  buildCareerBaseArtifacts,
  buildOnboardingArtifacts,
  buildVoiceCalibrationArtifacts,
} from '../../../packages/core/src/onboarding-builders.mjs';
import {
  importCareerSource,
  importWritingSample,
} from '../../../packages/core/src/importers.mjs';
import {
  buildArtifactManifest,
  resolveWorkspacePath,
  workspaceDoctor,
  workspaceSnapshot,
} from '../../../packages/core/src/workspace.mjs';
import { buildTaskPack } from '../../../packages/core/src/task-packs.mjs';
import {
  addOpportunity,
  saveApplicationProfile,
  saveSearchStrategy,
} from '../../../packages/core/src/workspace-editor.mjs';
import {
  attachApplicationArtifact,
  setApplicationRunBrowserAssist,
  buildApplicationRunPack,
  markApplicationSubmitted,
  setApplicationRunStatus,
  startApplicationRun,
} from '../../../packages/core/src/application-runs.mjs';
import {
  browserAssistArtifactsForRun,
  browserAssistStatus,
} from '../../../packages/core/src/browser-assist.mjs';
import {
  agentBridgeSnapshot,
  queueAgentTask,
  queueApplicationRun,
  queueSourcingRun,
} from '../../../packages/core/src/agent-bridge.mjs';
import {
  approveSourcedCandidate,
  dismissSourcedCandidate,
  sourceOpportunities,
} from '../../../packages/core/src/opportunity-sourcing.mjs';
import { buildAgentSetup } from './agent-setup.mjs';
import { buildLegalInfo } from './legal-info.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(DASHBOARD_ROOT, 'public');
const REPO_ROOT = path.resolve(DASHBOARD_ROOT, '..', '..');
const BROWSER_ASSIST_WORKER = path.join(REPO_ROOT, 'packages', 'core', 'src', 'browser-assist-worker.mjs');
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(payload, null, 2));
}

function sendFile(response, filePath, contentType) {
  if (!fs.existsSync(filePath)) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }
  response.writeHead(200, { 'Content-Type': contentType });
  response.end(fs.readFileSync(filePath));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.md') || path.basename(filePath) === 'LICENSE' || path.basename(filePath) === 'NOTICE') {
    return 'text/plain; charset=utf-8';
  }
  return 'application/octet-stream';
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];

    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });

    request.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON request body.'));
      }
    });

    request.on('error', reject);
  });
}

function normalizeUploadName(filename = '', fallbackBase = 'import') {
  const base = String(filename || '').trim() || fallbackBase;
  return path.basename(base).replace(/[^\w.-]+/g, '-');
}

function extensionForUpload(filename = '') {
  const extension = path.extname(filename).toLowerCase();
  return extension || '.md';
}

async function withTempUploadFile(payload, run) {
  const filename = normalizeUploadName(payload.filename, payload.label || 'import');
  const extension = extensionForUpload(filename);
  const tempPath = path.join(os.tmpdir(), `job-hunter-os-${crypto.randomUUID()}${extension}`);

  if (payload.content_base64) {
    fs.writeFileSync(tempPath, Buffer.from(payload.content_base64, 'base64'));
  } else if (payload.text) {
    fs.writeFileSync(tempPath, String(payload.text), 'utf-8');
  } else {
    throw new Error('Provide either uploaded file content or pasted text.');
  }

  try {
    return await run(tempPath);
  } finally {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
}

export function createDashboardServer({ workspaceArg = 'demo/workspace', repoRoot = REPO_ROOT } = {}) {
  function currentSnapshot() {
    return workspaceSnapshot(workspaceArg);
  }

  function currentArtifactManifest() {
    const workspacePath = resolveWorkspacePath(workspaceArg);
    return buildArtifactManifest(workspacePath);
  }

  function currentBridgeSnapshot() {
    return agentBridgeSnapshot(workspaceArg);
  }

  function actionResponse(action, result) {
    return {
      ok: true,
      action,
      result,
      snapshot: currentSnapshot(),
      bridge: currentBridgeSnapshot(),
    };
  }

  function resolvePreviewPath(relativePath) {
    const artifact = currentArtifactManifest().find(candidate => candidate.relative_path === relativePath);
    if (!artifact || !artifact.exists) {
      throw new Error('Artifact not found or not generated yet.');
    }

    const workspacePath = resolveWorkspacePath(workspaceArg);
    const absolutePath = path.resolve(workspacePath, artifact.relative_path);
    if (absolutePath !== workspacePath && !absolutePath.startsWith(`${workspacePath}${path.sep}`)) {
      throw new Error('Artifact path is outside the workspace.');
    }

    return {
      artifact,
      absolutePath,
    };
  }

  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url || '/', `http://${request.headers.host}`);

    try {
      if (request.method === 'GET' && url.pathname === '/api/workspace') {
        sendJson(response, 200, currentSnapshot());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/doctor') {
        sendJson(response, 200, workspaceDoctor(workspaceArg));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/agent-setup') {
        const mode = url.searchParams.get('mode') || undefined;
        const assistantId = url.searchParams.get('assistant_id') || undefined;
        sendJson(response, 200, buildAgentSetup(currentSnapshot(), {
          mode,
          assistantId,
        }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/legal') {
        sendJson(response, 200, buildLegalInfo({ repoRoot }));
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/agent-bridge') {
        sendJson(response, 200, currentBridgeSnapshot());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/browser-assist') {
        sendJson(response, 200, browserAssistStatus());
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/artifact') {
        const relativePath = url.searchParams.get('path') || '';
        const { artifact, absolutePath } = resolvePreviewPath(relativePath);
        sendJson(response, 200, {
          ok: true,
          artifact,
          content: fs.readFileSync(absolutePath, 'utf-8'),
        });
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/import-career-source') {
        const payload = await readJsonBody(request);
        const result = await withTempUploadFile(payload, tempPath => importCareerSource({
          workspaceArg,
          inputPath: tempPath,
          kind: payload.kind || 'resume',
          label: payload.label || payload.filename || 'career-import',
        }));
        sendJson(response, 200, actionResponse('import-career-source', result));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/import-writing-sample') {
        const payload = await readJsonBody(request);
        const result = await withTempUploadFile(payload, tempPath => importWritingSample({
          workspaceArg,
          inputPath: tempPath,
          label: payload.label || payload.filename || 'writing-sample',
        }));
        sendJson(response, 200, actionResponse('import-writing-sample', result));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/build-career-base') {
        sendJson(response, 200, actionResponse('build-career-base', buildCareerBaseArtifacts(workspaceArg)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/build-voice-profile') {
        sendJson(response, 200, actionResponse('build-voice-profile', buildVoiceCalibrationArtifacts(workspaceArg)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/build-onboarding') {
        sendJson(response, 200, actionResponse('build-onboarding', buildOnboardingArtifacts(workspaceArg)));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/save-search-strategy') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('save-search-strategy', saveSearchStrategy({
          workspaceArg,
          payload,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/save-application-profile') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('save-application-profile', saveApplicationProfile({
          workspaceArg,
          payload,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/add-opportunity') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('add-opportunity', addOpportunity({
          workspaceArg,
          payload,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/source-opportunities') {
        const payload = await readJsonBody(request);
        const text = payload.content_base64
          ? Buffer.from(payload.content_base64, 'base64').toString('utf-8')
          : String(payload.text || '');
        sendJson(response, 200, actionResponse('source-opportunities', sourceOpportunities({
          workspaceArg,
          payload: {
            text,
            source_label: payload.source_label || payload.label || payload.filename || 'imported-search-results',
            source_url: payload.source_url || '',
          },
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/approve-sourced-candidate') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('approve-sourced-candidate', approveSourcedCandidate({
          workspaceArg,
          candidateId: payload.candidate_id,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/dismiss-sourced-candidate') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('dismiss-sourced-candidate', dismissSourcedCandidate({
          workspaceArg,
          candidateId: payload.candidate_id,
          reason: payload.reason || '',
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/build-task-pack') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('build-task-pack', buildTaskPack({
          workspaceArg,
          opportunityId: payload.opportunity_id,
          taskType: payload.task_type,
          mode: payload.mode || 'folder_access',
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/start-application-run') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('start-application-run', startApplicationRun({
          workspaceArg,
          opportunityId: payload.opportunity_id,
          payload,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/upload-application-artifact') {
        const payload = await readJsonBody(request);
        const result = await withTempUploadFile(payload, tempPath => attachApplicationArtifact({
          workspaceArg,
          runId: payload.run_id,
          artifactKind: payload.artifact_kind,
          inputPath: tempPath,
          filename: payload.filename || '',
        }));
        sendJson(response, 200, actionResponse('upload-application-artifact', result));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/build-application-run-pack') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('build-application-run-pack', buildApplicationRunPack({
          workspaceArg,
          runId: payload.run_id,
          mode: payload.mode || 'folder_access',
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/set-application-run-status') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('set-application-run-status', setApplicationRunStatus({
          workspaceArg,
          runId: payload.run_id,
          status: payload.status,
          nextStep: payload.next_step || '',
          handoffId: payload.handoff_id || '',
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/mark-application-submitted') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('mark-application-submitted', markApplicationSubmitted({
          workspaceArg,
          runId: payload.run_id,
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/start-browser-assist') {
        const payload = await readJsonBody(request);
        const capability = browserAssistStatus();
        if (!capability.available) {
          throw new Error(capability.summary);
        }

        const workspacePath = resolveWorkspacePath(workspaceArg);
        const artifacts = browserAssistArtifactsForRun(payload.run_id);
        const now = new Date().toISOString();
        setApplicationRunBrowserAssist({
          workspaceArg,
          runId: payload.run_id,
          browserAssist: {
            status: 'launching',
            launched_at: now,
            updated_at: now,
            browser: capability.browser,
            output_session: artifacts.session,
            output_log: artifacts.log,
            next_step: 'Launching the local browser assist flow.',
          },
          status: 'browser_assist_in_progress',
          nextStep: 'Browser assist is launching local Chrome and will fill known safe fields.',
        });

        const args = [
          BROWSER_ASSIST_WORKER,
          '--workspace',
          workspacePath,
          '--run',
          payload.run_id,
        ];
        if (payload.headless) {
          args.push('--headless');
          args.push('--close-when-done');
        }

        const worker = spawn(process.execPath, args, {
          cwd: repoRoot,
          detached: true,
          stdio: 'ignore',
        });
        worker.unref();

        sendJson(response, 200, actionResponse('start-browser-assist', {
          worker_pid: worker.pid,
          browser_assist: {
            available: capability.available,
            browser: capability.browser,
            output_session: artifacts.session,
            output_log: artifacts.log,
          },
        }));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/queue-agent-task') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('queue-agent-task', queueAgentTask({
          workspaceArg,
          opportunityId: payload.opportunity_id,
          taskType: payload.task_type,
          assistantId: payload.assistant_id,
          adapter: payload.adapter || payload.mode || 'folder_access',
        })));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/queue-application-run') {
        const payload = await readJsonBody(request);
        const result = queueApplicationRun({
          workspaceArg,
          runId: payload.run_id,
          assistantId: payload.assistant_id,
          adapter: payload.adapter || payload.mode || 'folder_access',
        });
        setApplicationRunStatus({
          workspaceArg,
          runId: payload.run_id,
          status: 'assistant_in_progress',
          nextStep: 'Use the assistant package to work through the application and stop before final submit.',
          handoffId: result.handoff.id,
        });
        sendJson(response, 200, actionResponse('queue-application-run', result));
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/actions/queue-sourcing-run') {
        const payload = await readJsonBody(request);
        sendJson(response, 200, actionResponse('queue-sourcing-run', queueSourcingRun({
          workspaceArg,
          assistantId: payload.assistant_id,
          adapter: payload.adapter || payload.mode || 'folder_access',
        })));
        return;
      }

      if (url.pathname === '/app.js') {
        sendFile(response, path.join(PUBLIC_DIR, 'app.js'), 'application/javascript; charset=utf-8');
        return;
      }

      if (url.pathname === '/styles.css') {
        sendFile(response, path.join(PUBLIC_DIR, 'styles.css'), 'text/css; charset=utf-8');
        return;
      }

      if (['/LICENSE', '/NOTICE', '/TRADEMARKS.md', '/CONTRIBUTING.md', '/README.md'].includes(url.pathname)) {
        sendFile(response, path.join(repoRoot, url.pathname.slice(1)), contentTypeFor(url.pathname));
        return;
      }

      sendFile(response, path.join(PUBLIC_DIR, 'index.html'), 'text/html; charset=utf-8');
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error.message,
      });
    }
  });

  return server;
}

export function startDashboardServer({ workspaceArg = 'demo/workspace', port = 4173, repoRoot = REPO_ROOT } = {}) {
  const server = createDashboardServer({ workspaceArg, repoRoot });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      const address = server.address();
      resolve({
        server,
        port: typeof address === 'object' && address ? address.port : port,
        workspaceArg,
      });
    });
  });
}
