import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import {
  recommendationForScore,
  scoreOpportunity,
  summarizePhases,
} from './state-machine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

const REQUIRED_FILES = [
  'config/career-base.yml',
  'config/voice-profile.yml',
  'config/search-strategy.yml',
  'config/application-profile.yml',
  'config/pipeline-states.yml',
  'data/career-base/experience-inventory.yml',
  'data/feedback/events.yml',
  'data/pipeline/opportunities.yml',
  'data/sourcing/candidates.yml',
  'data/applications/runs.yml',
];

const GENERATED_ARTIFACTS = [
  {
    key: 'career_base_draft',
    title: 'Master experience draft',
    module_key: 'career_base',
    relative_path: path.join('data', 'career-base', 'master-experience.generated.md'),
    description: 'Generated source-of-truth experience document assembled from imported career materials.',
  },
  {
    key: 'career_base_report',
    title: 'Career base build report',
    module_key: 'career_base',
    relative_path: path.join('data', 'career-base', 'career-base-build.yml'),
    description: 'Build metadata for the latest career-base generation pass.',
  },
  {
    key: 'voice_analysis',
    title: 'Voice analysis',
    module_key: 'voice_calibration',
    relative_path: path.join('data', 'voice', 'voice-analysis.yml'),
    description: 'Structured analysis of imported writing samples and style signals.',
  },
  {
    key: 'voice_guide',
    title: 'Voice guide',
    module_key: 'voice_calibration',
    relative_path: path.join('data', 'voice', 'voice-guide.generated.md'),
    description: 'Reusable voice-calibration guide derived from the writing sample set.',
  },
];

function humanizeArtifactTitle(relativePath) {
  const base = path.basename(relativePath, path.extname(relativePath));
  return base
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}

function taskPackArtifacts(workspacePath) {
  const taskDir = path.join(workspacePath, 'data', 'agent-tasks');
  if (!fs.existsSync(taskDir)) return [];

  return fs.readdirSync(taskDir)
    .filter(fileName => fileName.endsWith('.md'))
    .sort()
    .map(fileName => {
      const relativePath = path.join('data', 'agent-tasks', fileName);
      const absolutePath = path.join(workspacePath, relativePath);
      const stats = fs.statSync(absolutePath);

      return {
        key: `agent_task_${path.basename(fileName, '.md')}`,
        title: humanizeArtifactTitle(relativePath),
        module_key: 'agent_tasks',
        relative_path: relativePath,
        description: 'Generated agent task pack for evaluation, drafting, or submission preparation.',
        exists: true,
        byte_size: stats.size,
        updated_at: stats.mtime.toISOString(),
      };
    });
}

function sourcingReviewArtifacts(workspacePath) {
  const reviewDir = path.join(workspacePath, 'data', 'sourcing', 'reviews');
  if (!fs.existsSync(reviewDir)) return [];

  return fs.readdirSync(reviewDir)
    .filter(fileName => fileName.endsWith('.md'))
    .sort()
    .map(fileName => {
      const relativePath = path.join('data', 'sourcing', 'reviews', fileName);
      const absolutePath = path.join(workspacePath, relativePath);
      const stats = fs.statSync(absolutePath);

      return {
        key: `sourcing_review_${path.basename(fileName, '.md')}`,
        title: humanizeArtifactTitle(relativePath),
        module_key: 'sourcing',
        relative_path: relativePath,
        description: 'Human-readable sourcing review created from a search run.',
        exists: true,
        byte_size: stats.size,
        updated_at: stats.mtime.toISOString(),
      };
    });
}

function applicationRunArtifacts(workspacePath) {
  const appsDir = path.join(workspacePath, 'data', 'applications');
  if (!fs.existsSync(appsDir)) return [];

  return fs.readdirSync(appsDir)
    .filter(name => fs.statSync(path.join(appsDir, name)).isDirectory())
    .flatMap(runId => {
      const folder = path.join(appsDir, runId);
      return fs.readdirSync(folder)
        .filter(fileName => fileName.endsWith('.md') || fileName.endsWith('.yml'))
        .map(fileName => {
          const relativePath = path.join('data', 'applications', runId, fileName);
          const absolutePath = path.join(workspacePath, relativePath);
          const stats = fs.statSync(absolutePath);
          return {
            key: `application_run_${runId}_${path.basename(fileName, path.extname(fileName))}`,
            title: humanizeArtifactTitle(relativePath),
            module_key: 'application_runs',
            relative_path: relativePath,
            description: 'Generated application-run packet, checklist, or handoff artifact.',
            exists: true,
            byte_size: stats.size,
            updated_at: stats.mtime.toISOString(),
          };
        });
    });
}

function countKeys(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  return Object.keys(value).length;
}

function uniq(items = []) {
  return [...new Set(items.filter(Boolean))];
}

function readYamlFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) || null;
}

function readTextFile(filePath) {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8');
}

function summarizeFeedback(events = []) {
  const counts = {};
  for (const event of events) {
    const type = event.type || 'unknown';
    counts[type] = (counts[type] || 0) + 1;
  }
  return counts;
}

function buildModuleStatus({ key, title, complete, details, nextStep }) {
  return {
    key,
    title,
    status: complete ? 'complete' : 'in_progress',
    complete,
    details,
    next_step: nextStep,
  };
}

export function resolveWorkspacePath(workspaceArg = 'demo/workspace') {
  if (path.isAbsolute(workspaceArg)) return workspaceArg;
  return path.resolve(process.cwd(), workspaceArg);
}

export function loadWorkspace(workspaceArg) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const load = relativePath => readYamlFile(path.join(workspacePath, relativePath));

  const workspace = {
    workspacePath,
    careerBaseConfig: load('config/career-base.yml'),
    voiceProfile: load('config/voice-profile.yml'),
    searchStrategy: load('config/search-strategy.yml'),
    applicationProfile: load('config/application-profile.yml'),
    pipelineStates: load('config/pipeline-states.yml'),
    experienceInventory: load('data/career-base/experience-inventory.yml'),
    feedbackEvents: load('data/feedback/events.yml'),
    opportunities: load('data/pipeline/opportunities.yml'),
    sourcingCandidates: load('data/sourcing/candidates.yml'),
    applicationRuns: load('data/applications/runs.yml'),
  };

  return workspace;
}

export function buildOnboardingStatus(workspace) {
  const sourceDocuments = workspace.careerBaseConfig?.source_documents || [];
  const roles = workspace.experienceInventory?.roles || [];
  const voiceSamples = workspace.voiceProfile?.sample_sources || [];
  const voiceTraits = workspace.voiceProfile?.voice_traits || [];
  const lanes = workspace.searchStrategy?.lanes || [];
  const safeAnswers = workspace.applicationProfile?.safe_answers || {};
  const humanGatedFields = workspace.applicationProfile?.human_gated_fields || {};
  const feedbackEvents = workspace.feedbackEvents?.events || [];
  const reviewPolicy = workspace.feedbackEvents?.review_policy || {};

  const modules = [
    buildModuleStatus({
      key: 'career_base',
      title: 'Career Base',
      complete: sourceDocuments.length > 0 && roles.length > 0,
      details: `${sourceDocuments.length} source documents, ${roles.length} role records`,
      nextStep: 'Import resumes and review the normalized experience inventory.',
    }),
    buildModuleStatus({
      key: 'voice_calibration',
      title: 'Voice Calibration',
      complete: voiceSamples.length >= 2 && voiceTraits.length >= 3,
      details: `${voiceSamples.length} writing samples, ${voiceTraits.length} voice traits`,
      nextStep: 'Add 2-5 writing samples and confirm the preferred tone defaults.',
    }),
    buildModuleStatus({
      key: 'search_strategy',
      title: 'Search Strategy',
      complete: lanes.length > 0 && Number(workspace.searchStrategy?.compensation?.target_base_usd || 0) > 0,
      details: `${lanes.length} search lanes, target base $${Number(workspace.searchStrategy?.compensation?.target_base_usd || 0).toLocaleString()}`,
      nextStep: 'Set lane mix, geography rules, and compensation bands.',
    }),
    buildModuleStatus({
      key: 'application_profile',
      title: 'Application Profile',
      complete: countKeys(safeAnswers) >= 3 && countKeys(humanGatedFields) >= 3,
      details: `${countKeys(safeAnswers)} safe answers, ${countKeys(humanGatedFields)} human-gated fields`,
      nextStep: 'Capture reusable safe answers and mark all sensitive fields as human-gated.',
    }),
    buildModuleStatus({
      key: 'feedback_calibration',
      title: 'Feedback Calibration',
      complete: feedbackEvents.length >= 3 && Boolean(reviewPolicy.require_human_review),
      details: `${feedbackEvents.length} logged events, human review ${reviewPolicy.require_human_review ? 'enabled' : 'disabled'}`,
      nextStep: 'Start logging skip, submit, respond, and interview outcomes without auto-retuning from tiny samples.',
    }),
  ];

  return {
    total: modules.length,
    completed: modules.filter(module => module.complete).length,
    modules,
  };
}

export function buildPipelineSummary(workspace) {
  const searchStrategy = workspace.searchStrategy || {};
  const opportunities = (workspace.opportunities?.opportunities || [])
    .map(opportunity => {
      const priority_score = scoreOpportunity(opportunity, searchStrategy);
      const recommendation = recommendationForScore(priority_score, searchStrategy);

      return {
        ...opportunity,
        priority_score,
        recommendation,
      };
    })
    .sort((left, right) => right.priority_score - left.priority_score);

  return {
    total: opportunities.length,
    phase_counts: summarizePhases(opportunities),
    recommendation_counts: summarizePhases(
      opportunities.map(opportunity => ({ phase: opportunity.recommendation }))
    ),
    human_gate_count: opportunities.filter(opportunity => opportunity.human_gate).length,
    top_opportunities: opportunities.slice(0, 5),
    opportunities,
  };
}

export function buildSourcingSummary(workspace) {
  const candidates = (workspace.sourcingCandidates?.candidates || [])
    .slice()
    .sort((left, right) => Number(right.priority_score_hint || 0) - Number(left.priority_score_hint || 0));
  const byStatus = {
    pending: 0,
    approved: 0,
    dismissed: 0,
  };

  for (const candidate of candidates) {
    const status = candidate.pipeline_status || 'pending';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  return {
    total_candidates: candidates.length,
    pending_count: byStatus.pending || 0,
    approved_count: byStatus.approved || 0,
    dismissed_count: byStatus.dismissed || 0,
    batches: workspace.sourcingCandidates?.batches || [],
    pending_candidates: candidates.filter(candidate => (candidate.pipeline_status || 'pending') === 'pending').slice(0, 12),
    recent_candidates: candidates.slice(0, 12),
  };
}

function browserAssistSessionPath(workspacePath, run) {
  const relative = run?.browser_assist?.output_session || path.join('data', 'applications', run.id || '', 'browser-assist-session.yml');
  return path.join(workspacePath, relative);
}

function browserAssistLogPath(workspacePath, run) {
  const relative = run?.browser_assist?.output_log || path.join('data', 'applications', run.id || '', 'browser-assist-log.md');
  return path.join(workspacePath, relative);
}

function summarizeReviewReadiness(run, session) {
  const unresolved = session?.unresolved_required_fields || [];
  const manual = session?.manual_review_items || [];
  const autoFilled = session?.auto_filled || [];

  if (run.status === 'submitted') {
    return {
      label: 'Submitted',
      tone: 'success',
      summary: 'This application is already marked submitted.',
    };
  }

  if (run.status === 'awaiting_final_confirmation') {
    return {
      label: 'Final Review Ready',
      tone: 'success',
      summary: `The app reached the final review stop with ${autoFilled.length} field${autoFilled.length === 1 ? '' : 's'} prepared.`,
    };
  }

  if (run.status === 'manual_review_required') {
    return {
      label: 'Needs Your Review',
      tone: 'warning',
      summary: `${manual.length} manual item${manual.length === 1 ? '' : 's'} and ${unresolved.length} remaining blocker${unresolved.length === 1 ? '' : 's'} still need a human.`,
    };
  }

  if (run.status === 'browser_assist_error') {
    return {
      label: 'Alternate Path Recommended',
      tone: 'danger',
      summary: 'Browser assist hit an issue, so assistant fill help or a manual pass is safer now.',
    };
  }

  if (run.status === 'browser_assist_in_progress') {
    return {
      label: 'In Progress',
      tone: 'accent',
      summary: 'Browser assist is still working through the live application.',
    };
  }

  if (run.status === 'assistant_in_progress') {
    return {
      label: 'Assistant In Progress',
      tone: 'accent',
      summary: 'An assistant package is already in progress for this run.',
    };
  }

  if (run.status === 'prepared') {
    return {
      label: 'Ready To Launch',
      tone: 'accent',
      summary: 'The run is prepared and ready for browser assist or assistant fill help.',
    };
  }

  return {
    label: 'Needs Setup',
    tone: 'warning',
    summary: run.next_step || 'This application still needs setup before the app can help further.',
  };
}

function enrichApplicationRun(workspacePath, run) {
  const session = readYamlFile(browserAssistSessionPath(workspacePath, run));
  const logContent = readTextFile(browserAssistLogPath(workspacePath, run));

  if (!session) {
    return {
      ...run,
      review_summary: summarizeReviewReadiness(run, null),
      browser_assist_details: null,
    };
  }

  const autoFilled = (session.auto_filled || []).map(item => ({
    field: item.field || '',
    kind: item.kind || '',
    source: item.source || '',
    value_preview: item.value_preview || '',
    file: item.file || '',
  }));
  const manualItems = (session.manual_review_items || []).map(item => ({
    key: item.key || '',
    label: item.label || '',
    reason: item.reason || '',
  }));
  const unresolved = (session.unresolved_required_fields || []).map(item => String(item || '').trim()).filter(Boolean);
  const submitButtons = (session.submit_buttons || []).map(item => String(item || '').trim()).filter(Boolean);

  return {
    ...run,
    review_summary: summarizeReviewReadiness(run, session),
    browser_assist_details: {
      current_url: session.current_url || run.portal?.apply_url || '',
      portal: session.portal || run.browser_assist?.portal || null,
      next_step: session.next_step || run.browser_assist?.next_step || run.next_step || '',
      auto_filled: autoFilled,
      manual_review_items: manualItems,
      unresolved_required_fields: unresolved,
      submit_buttons: submitButtons,
      log_excerpt: logContent ? logContent.split('\n').slice(0, 18).join('\n') : '',
    },
  };
}

export function buildApplicationRunsSummary(workspace) {
  const runs = (workspace.applicationRuns?.runs || [])
    .slice()
    .sort((left, right) => String(right.updated_at || '').localeCompare(String(left.updated_at || '')));
  const enrichedRuns = runs.map(run => enrichApplicationRun(workspace.workspacePath, run));
  const countsByStatus = {};
  for (const run of enrichedRuns) {
    const status = run.status || 'unknown';
    countsByStatus[status] = (countsByStatus[status] || 0) + 1;
  }

  return {
    total_runs: enrichedRuns.length,
    submitted_count: countsByStatus.submitted || 0,
    active_count: enrichedRuns.filter(run => run.status !== 'submitted').length,
    ready_count: countsByStatus.prepared || 0,
    counts_by_status: countsByStatus,
    latest_run: enrichedRuns[0] || null,
    runs: enrichedRuns,
  };
}

export function buildArtifactManifest(workspacePath) {
  const builtIns = GENERATED_ARTIFACTS.map(artifact => {
    const absolutePath = path.join(workspacePath, artifact.relative_path);
    const exists = fs.existsSync(absolutePath);
    const stats = exists ? fs.statSync(absolutePath) : null;

    return {
      ...artifact,
      exists,
      byte_size: stats?.size || 0,
      updated_at: stats ? stats.mtime.toISOString() : null,
    };
  });

  return [
    ...builtIns,
    ...taskPackArtifacts(workspacePath),
    ...sourcingReviewArtifacts(workspacePath),
    ...applicationRunArtifacts(workspacePath),
  ];
}

export function workspaceSnapshot(workspaceArg) {
  const workspace = loadWorkspace(workspaceArg);
  const onboarding = buildOnboardingStatus(workspace);
  const pipeline = buildPipelineSummary(workspace);
  const sourcing = buildSourcingSummary(workspace);
  const applications = buildApplicationRunsSummary(workspace);
  const artifacts = buildArtifactManifest(workspace.workspacePath);
  const feedback = {
    event_count: (workspace.feedbackEvents?.events || []).length,
    counts_by_type: summarizeFeedback(workspace.feedbackEvents?.events || []),
    require_human_review: Boolean(workspace.feedbackEvents?.review_policy?.require_human_review),
    minimum_signal_count: Number(workspace.feedbackEvents?.review_policy?.minimum_signal_count || 0),
  };
  const incompleteModules = onboarding.modules.filter(module => !module.complete);
  const laneOptions = workspace.searchStrategy?.lanes || [];
  const companyStageOptions = Object.keys(workspace.searchStrategy?.company_stage_mix || {});
  const workModeOptions = uniq([
    ...(workspace.searchStrategy?.work_mode_preferences || []),
    ...pipeline.opportunities.map(opportunity => opportunity.strategy?.work_mode).filter(Boolean),
    'remote',
    'hybrid',
    'onsite',
  ]);
  const phaseOptions = workspace.pipelineStates?.canonical_states || [];

  return {
    meta: {
      workspace_path: workspace.workspacePath,
      candidate_name: workspace.careerBaseConfig?.candidate?.full_name || 'Unknown Candidate',
      headline: workspace.careerBaseConfig?.candidate?.headline || '',
      local_first: true,
      human_in_the_loop: true,
    },
    onboarding,
    guidance: {
      current_focus: incompleteModules[0]?.title || 'Pipeline Review',
      next_actions: (incompleteModules.length ? incompleteModules : onboarding.modules)
        .slice(0, 3)
        .map(module => ({
          key: module.key,
          title: module.title,
          next_step: module.next_step,
        })),
    },
    documents: {
      career_sources: workspace.careerBaseConfig?.source_documents || [],
      writing_samples: (workspace.voiceProfile?.sample_sources || []).map(source => ({
        id: path.basename(source, path.extname(source)),
        kind: 'writing_sample',
        relative_path: source,
      })),
    },
    settings: {
      search_strategy: {
        lanes: laneOptions,
        geography: workspace.searchStrategy?.geography || {
          preferred: [],
          acceptable: [],
          blocked: [],
        },
        work_mode_preferences: workspace.searchStrategy?.work_mode_preferences || [],
        compensation: workspace.searchStrategy?.compensation || {
          target_base_usd: 0,
          exception_floor_usd: 0,
        },
        step_down_logic: workspace.searchStrategy?.step_down_logic || [],
        thresholds: workspace.searchStrategy?.thresholds || {},
      },
      application_profile: {
        contact: workspace.applicationProfile?.contact || {},
        safe_answers: workspace.applicationProfile?.safe_answers || {},
        human_gated_fields: workspace.applicationProfile?.human_gated_fields || {},
      },
      options: {
        phases: phaseOptions,
        lanes: laneOptions,
        company_stages: companyStageOptions,
        work_modes: workModeOptions,
      },
    },
    artifacts,
    pipeline,
    sourcing,
    applications,
    feedback,
    human_gates: Object.keys(workspace.applicationProfile?.human_gated_fields || {}),
  };
}

export function workspaceDoctor(workspaceArg) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const missingFiles = REQUIRED_FILES.filter(relativePath => !fs.existsSync(path.join(workspacePath, relativePath)));
  const snapshot = workspaceSnapshot(workspacePath);

  return {
    ok: missingFiles.length === 0,
    workspace_path: workspacePath,
    missing_files: missingFiles,
    onboarding_completed: snapshot.onboarding.completed,
    onboarding_total: snapshot.onboarding.total,
    opportunity_count: snapshot.pipeline.total,
    human_gate_count: snapshot.pipeline.human_gate_count,
  };
}

export function initWorkspace({ workspaceArg, demo = false, force = false }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const sourceRoot = path.join(REPO_ROOT, demo ? 'demo/workspace' : 'templates/workspace');

  if (fs.existsSync(workspacePath) && fs.readdirSync(workspacePath).length > 0 && !force) {
    throw new Error(`Workspace already exists and is not empty: ${workspacePath}`);
  }

  fs.mkdirSync(workspacePath, { recursive: true });
  fs.cpSync(sourceRoot, workspacePath, { recursive: true, force: true });

  return {
    workspace_path: workspacePath,
    source: sourceRoot,
    demo,
  };
}
