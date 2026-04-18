const state = {
  snapshot: null,
  doctor: null,
  agentSetup: null,
  bridge: null,
  browserAssist: null,
  legalInfo: null,
  applicationGuidance: null,
  jobsBoardFilter: 'review',
  jobsSelection: {
    type: '',
    id: '',
  },
  selectedPipelineOpportunityId: '',
  desktop: {
    available: Boolean(globalThis.jobHunterDesktop?.isDesktop),
    context: null,
  },
  assistantId: 'chatgpt_desktop',
  agentMode: 'chat_upload',
  taskPack: null,
  currentView: 'setup',
  activeSetupPanel: 'agent-panel',
  artifactPreview: {
    path: '',
    title: '',
    content: 'Choose a generated artifact to preview it here.',
  },
  activity: [],
  busy: false,
};

const MODULE_TARGETS = {
  career_base: 'import-career-panel',
  voice_calibration: 'import-writing-panel',
  search_strategy: 'search-strategy-panel',
  application_profile: 'application-profile-panel',
  feedback_calibration: 'workspace-details-panel',
};

const MODULE_COPY = {
  career_base: {
    shortTitle: 'Your background',
  },
  voice_calibration: {
    shortTitle: 'How you write',
  },
  search_strategy: {
    shortTitle: 'Job targets',
  },
  application_profile: {
    shortTitle: 'Reusable details',
  },
  feedback_calibration: {
    shortTitle: 'Review and improve',
  },
};

const TASK_TYPES = {
  evaluate_opportunity: 'Review This Job',
  draft_application_package: 'Draft Application Materials',
  prepare_submission: 'Prepare Submission Help',
};

const SETUP_STEP_KEYS = new Set([
  'assistant_setup',
  'background',
  'writing',
  'starter_materials',
  'job_targets',
  'reusable_details',
]);

const SETUP_PANEL_IDS = new Set([
  'agent-panel',
  'import-career-panel',
  'import-writing-panel',
  'build-panel',
  'search-strategy-panel',
  'application-profile-panel',
]);

const PANEL_VIEWS = {
  'agent-panel': 'setup',
  'import-career-panel': 'setup',
  'import-writing-panel': 'setup',
  'build-panel': 'setup',
  'search-strategy-panel': 'setup',
  'application-profile-panel': 'setup',
  'sourcing-panel': 'jobs',
  'application-run-panel': 'apply',
  'workspace-details-panel': 'workspace',
};

const JOURNEY_FLOW = [
  {
    key: 'assistant_setup',
    title: 'Choose your assistant',
    summary: 'Pick the assistant you already use so later steps can adapt to it.',
    target: 'agent-panel',
    complete() {
      return Boolean(state.agentSetup?.assistant?.id);
    },
    details() {
      return state.agentSetup?.assistant?.title
        ? `Using ${state.agentSetup.assistant.title}`
        : 'Choose the assistant you already use';
    },
  },
  {
    key: 'background',
    title: 'Tell us about your background',
    summary: 'Import at least one resume, LinkedIn export, or bio.',
    target: 'import-career-panel',
    complete(snapshot) {
      return (snapshot.documents?.career_sources || []).length > 0;
    },
    details(snapshot) {
      const count = (snapshot.documents?.career_sources || []).length;
      return count
        ? `${count} background ${count === 1 ? 'item' : 'items'} added`
        : 'No background files added yet';
    },
  },
  {
    key: 'writing',
    title: 'Teach us how you write',
    summary: 'Add a couple of real writing samples.',
    target: 'import-writing-panel',
    complete(snapshot) {
      return (snapshot.documents?.writing_samples || []).length >= 2;
    },
    details(snapshot) {
      const count = (snapshot.documents?.writing_samples || []).length;
      return count
        ? `${count} writing ${count === 1 ? 'sample' : 'samples'} added`
        : 'No writing samples added yet';
    },
  },
  {
    key: 'starter_materials',
    title: 'Build your starter materials',
    summary: 'Generate the background draft and writing guide.',
    target: 'build-panel',
    complete(snapshot) {
      return hasArtifact(snapshot, 'career_base_draft') && hasArtifact(snapshot, 'voice_guide');
    },
    details(snapshot) {
      const ready = [
        hasArtifact(snapshot, 'career_base_draft') ? 'background draft' : '',
        hasArtifact(snapshot, 'voice_guide') ? 'writing guide' : '',
      ].filter(Boolean);
      return ready.length
        ? `Ready: ${ready.join(' and ')}`
        : 'Build your first generated materials';
    },
  },
  {
    key: 'job_targets',
    title: 'Choose your job targets',
    summary: 'Describe roles, locations, work setup, and pay range.',
    target: 'search-strategy-panel',
    complete(snapshot) {
      const lanes = snapshot.settings?.search_strategy?.lanes || [];
      const targetBase = Number(snapshot.settings?.search_strategy?.compensation?.target_base_usd || 0);
      return lanes.length > 0 && targetBase > 0;
    },
    details(snapshot) {
      const lanes = snapshot.settings?.search_strategy?.lanes || [];
      return lanes.length
        ? `${lanes.length} target ${lanes.length === 1 ? 'path' : 'paths'} saved`
        : 'No job targets saved yet';
    },
  },
  {
    key: 'reusable_details',
    title: 'Save reusable application details',
    summary: 'Keep reusable answers handy and sensitive ones manual.',
    target: 'application-profile-panel',
    complete(snapshot) {
      const safeAnswers = Object.keys(snapshot.settings?.application_profile?.safe_answers || {}).length;
      const humanGates = Object.keys(snapshot.settings?.application_profile?.human_gated_fields || {}).length;
      return safeAnswers >= 3 && humanGates >= 3;
    },
    details(snapshot) {
      const safeAnswers = Object.keys(snapshot.settings?.application_profile?.safe_answers || {}).length;
      const humanGates = Object.keys(snapshot.settings?.application_profile?.human_gated_fields || {}).length;
      return `${safeAnswers} reusable answers and ${humanGates} manual-review fields saved`;
    },
  },
  {
    key: 'sourcing',
    title: 'Find jobs to review',
    summary: 'Run a sourcing pass, then approve the strongest roles into your pipeline.',
    target: 'sourcing-panel',
    complete(snapshot) {
      return Number(snapshot.sourcing?.total_candidates || 0) > 0 || Number(snapshot.pipeline?.total || 0) > 0;
    },
    details(snapshot) {
      const sourced = Number(snapshot.sourcing?.total_candidates || 0);
      const pending = Number(snapshot.sourcing?.pending_count || 0);
      const pipeline = Number(snapshot.pipeline?.total || 0);
      if (sourced) {
        return `${pending} waiting in review and ${pipeline} ${pipeline === 1 ? 'job' : 'jobs'} in your pipeline`;
      }
      return pipeline
        ? `${pipeline} ${pipeline === 1 ? 'job' : 'jobs'} already in your pipeline`
        : 'No sourced roles or pipeline jobs yet';
    },
  },
  {
    key: 'assistant_package',
    title: 'Optional extra assistant help',
    summary: 'Only use this if you want extra review, drafting, or a separate assistant package.',
    target: 'agent-panel',
    complete() {
      return generalTaskHandoffs().length > 0;
    },
    details() {
      const count = generalTaskHandoffs().length;
      return count
        ? `${count} assistant ${count === 1 ? 'package' : 'packages'} prepared`
        : 'Skip unless you want extra help before the final application step';
    },
  },
  {
    key: 'application_finish',
    title: 'Finish the application',
    summary: 'Attach final files, work through the live form, and stop at final review.',
    target: 'application-run-panel',
    complete(snapshot) {
      return Number(snapshot.applications?.total_runs || 0) > 0;
    },
    details(snapshot) {
      const total = Number(snapshot.applications?.total_runs || 0);
      const submitted = Number(snapshot.applications?.submitted_count || 0);
      const active = Number(snapshot.applications?.active_count || 0);
      if (!total) {
        return 'No application-prep run started yet';
      }
      return `${active} active ${active === 1 ? 'run' : 'runs'} and ${submitted} submitted`;
    },
  },
];

function hasArtifact(snapshot, key) {
  return Boolean((snapshot.artifacts || []).find(artifact => artifact.key === key && artifact.exists));
}

function displayModuleTitle(key, fallback = '') {
  return MODULE_COPY[key]?.shortTitle || fallback;
}

function badgeClass(status) {
  if (status === 'complete') return 'pill success';
  return 'pill warning';
}

function titleCase(value) {
  return String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatTimestamp(value) {
  return new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function buildJourneySteps(snapshot) {
  return JOURNEY_FLOW.filter(step => SETUP_STEP_KEYS.has(step.key)).map((step, index) => ({
    ...step,
    stepNumber: index + 1,
    complete: step.complete(snapshot),
    details: step.details(snapshot),
  }));
}

function addActivity(message, tone = 'neutral') {
  state.activity.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    tone,
    createdAt: new Date().toISOString(),
  });
  state.activity = state.activity.slice(0, 10);
  renderActivity();
}

function currentSetupStep(steps = buildJourneySteps(state.snapshot || {})) {
  return steps.find(step => !step.complete) || steps[steps.length - 1] || null;
}

function ensureLayoutState(snapshot = state.snapshot) {
  const steps = buildJourneySteps(snapshot || {});
  const fallbackPanel = currentSetupStep(steps)?.target || 'agent-panel';

  if (!state.currentView || !['setup', 'jobs', 'apply', 'workspace'].includes(state.currentView)) {
    state.currentView = 'setup';
  }

  if (!state.activeSetupPanel || !SETUP_PANEL_IDS.has(state.activeSetupPanel)) {
    state.activeSetupPanel = fallbackPanel;
  }

  ensureJobsBoardState(snapshot);
}

function viewForPanel(panelId) {
  return PANEL_VIEWS[panelId] || 'setup';
}

function renderViewTabs(snapshot) {
  const setupSteps = buildJourneySteps(snapshot);
  const setupCompleted = setupSteps.filter(step => step.complete).length;
  const setupTotal = setupSteps.length;
  const pendingJobs = Number(snapshot.sourcing?.pending_count || 0);
  const pipelineJobs = Number(snapshot.pipeline?.total || 0);
  const activeRuns = Number(snapshot.applications?.active_count || 0);
  const submittedRuns = Number(snapshot.applications?.submitted_count || 0);

  document.getElementById('view-tab-copy-setup').textContent = `${setupCompleted}/${setupTotal} ready`;
  document.getElementById('view-tab-copy-jobs').textContent = pendingJobs
    ? `${pendingJobs} to review · ${pipelineJobs} in pipeline`
    : pipelineJobs
      ? `${pipelineJobs} in pipeline`
      : 'No jobs yet';
  document.getElementById('view-tab-copy-apply').textContent = activeRuns
    ? `${activeRuns} active · ${submittedRuns} submitted`
    : submittedRuns
      ? `${submittedRuns} submitted`
      : 'No active runs';
  document.getElementById('view-tab-copy-workspace').textContent = `${snapshot.feedback?.event_count || 0} feedback signals · local workspace`;

  document.querySelectorAll('.view-tab').forEach(button => {
    const isActive = button.dataset.viewTarget === state.currentView;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function renderViewContext(snapshot) {
  const config = {
    setup: {
      label: 'Setup',
      title: 'Build your foundation once',
      copy: 'Complete the basics here. We show one setup step at a time so it feels guided instead of overwhelming.',
    },
    jobs: {
      label: 'Jobs',
      title: 'Find, review, and choose roles',
      copy: snapshot.sourcing?.pending_count
        ? `You have ${snapshot.sourcing.pending_count} role${snapshot.sourcing.pending_count === 1 ? '' : 's'} waiting for review. Use the left list to pick a role, then act on it in the detail pane.`
        : 'Run a search, review the strongest jobs, and use the selected-role pane to package help or continue to Apply.',
    },
    apply: {
      label: 'Apply',
      title: 'Finish one application at a time',
      copy: 'Attach final files, use browser or assistant help when appropriate, and always stop for final human review before submit.',
    },
    workspace: {
      label: 'Workspace',
      title: 'Review your progress and supporting details',
      copy: 'This is the operator-style view for onboarding status, sensitive fields, feedback signals, and recent activity in your local workspace.',
    },
  }[state.currentView];

  document.getElementById('view-context-label').textContent = config.label;
  document.getElementById('view-context-title').textContent = config.title;
  document.getElementById('view-context-copy').textContent = config.copy;
}

function renderLayoutState() {
  ensureLayoutState(state.snapshot);

  document.querySelectorAll('[data-view-section]').forEach(element => {
    element.hidden = element.dataset.viewSection !== state.currentView;
  });

  document.querySelectorAll('.setup-step-panel').forEach(panel => {
    panel.hidden = state.currentView !== 'setup' || panel.id !== state.activeSetupPanel;
  });

  const workspaceDetails = document.getElementById('workspace-details-panel');
  if (workspaceDetails && state.currentView === 'workspace') {
    workspaceDetails.open = true;
  }

  document.querySelectorAll('.view-tab').forEach(button => {
    const isActive = button.dataset.viewTarget === state.currentView;
    button.classList.toggle('active', isActive);
    button.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

function activateView(viewId, options = {}) {
  const { panelId = '', scroll = false } = options;
  state.currentView = viewId;
  if (panelId && SETUP_PANEL_IDS.has(panelId)) {
    state.activeSetupPanel = panelId;
  }
  renderLayoutState();

  if (!scroll) return;
  const targetId = panelId || (viewId === 'setup' ? state.activeSetupPanel : '');
  const targetElement = targetId
    ? document.getElementById(targetId)
    : document.querySelector(`[data-view-target="${viewId}"]`);
  if (!targetElement) return;

  requestAnimationFrame(() => {
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

function setStatus(message, tone = 'neutral') {
  const banner = document.getElementById('status-banner');
  if (!message) {
    banner.textContent = '';
    banner.className = 'status-banner hidden';
    return;
  }

  banner.textContent = message;
  banner.className = `status-banner ${tone}`;
}

function setBusy(isBusy, message = '') {
  state.busy = isBusy;
  document.querySelectorAll('button, input, textarea, select').forEach(element => {
    if (isBusy) {
      element.dataset.wasDisabled = element.disabled ? 'true' : 'false';
      element.disabled = true;
      return;
    }
    element.disabled = element.dataset.wasDisabled === 'true';
    delete element.dataset.wasDisabled;
  });
  if (isBusy && message) {
    setStatus(message, 'working');
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function agentSetupUrl() {
  const params = new URLSearchParams({
    assistant_id: state.assistantId,
    mode: state.agentMode,
  });
  return `/api/agent-setup?${params.toString()}`;
}

async function loadDesktopContext() {
  if (!state.desktop.available) return null;
  try {
    state.desktop.context = await globalThis.jobHunterDesktop.getContext();
  } catch (error) {
    state.desktop.context = null;
    state.desktop.available = false;
  }
  return state.desktop.context;
}

function generalTaskHandoffs() {
  return (state.bridge?.recent_handoffs || []).filter(handoff => !['source_opportunities', 'application_fill_help'].includes(handoff.task_type));
}

function applicationHandoffs() {
  return (state.bridge?.recent_handoffs || []).filter(handoff => handoff.task_type === 'application_fill_help');
}

function pendingCandidates(snapshot = state.snapshot) {
  return snapshot?.sourcing?.pending_candidates || [];
}

function pipelineOpportunities(snapshot = state.snapshot) {
  return snapshot?.pipeline?.opportunities || [];
}

function findPipelineOpportunity(snapshot, opportunityId) {
  return pipelineOpportunities(snapshot).find(opportunity => opportunity.id === opportunityId) || null;
}

function setSelectedPipelineOpportunityId(opportunityId = '') {
  state.selectedPipelineOpportunityId = opportunityId || '';
}

function ensureJobsBoardState(snapshot = state.snapshot) {
  const pending = pendingCandidates(snapshot);
  const pipeline = pipelineOpportunities(snapshot);

  if (!['review', 'pipeline'].includes(state.jobsBoardFilter)) {
    state.jobsBoardFilter = pending.length ? 'review' : 'pipeline';
  }

  if (state.selectedPipelineOpportunityId && !findPipelineOpportunity(snapshot, state.selectedPipelineOpportunityId)) {
    state.selectedPipelineOpportunityId = '';
  }

  const currentSelection = state.jobsSelection || { type: '', id: '' };
  const selectionExists = currentSelection.type === 'candidate'
    ? pending.some(candidate => candidate.id === currentSelection.id)
    : currentSelection.type === 'pipeline'
      ? pipeline.some(opportunity => opportunity.id === currentSelection.id)
      : false;

  if (selectionExists) {
    if (currentSelection.type === 'pipeline') {
      setSelectedPipelineOpportunityId(currentSelection.id);
    }
    return;
  }

  if (state.jobsBoardFilter === 'review' && pending.length) {
    state.jobsSelection = { type: 'candidate', id: pending[0].id };
    return;
  }

  if (pipeline.length) {
    const preferredId = state.selectedPipelineOpportunityId && findPipelineOpportunity(snapshot, state.selectedPipelineOpportunityId)
      ? state.selectedPipelineOpportunityId
      : pipeline[0].id;
    state.jobsBoardFilter = 'pipeline';
    state.jobsSelection = { type: 'pipeline', id: preferredId };
    setSelectedPipelineOpportunityId(preferredId);
    return;
  }

  if (pending.length) {
    state.jobsBoardFilter = 'review';
    state.jobsSelection = { type: 'candidate', id: pending[0].id };
    return;
  }

  state.jobsSelection = { type: '', id: '' };
}

function selectJobsRecord(type, id, options = {}) {
  state.jobsSelection = { type, id };
  if (options.filter) {
    state.jobsBoardFilter = options.filter;
  } else if (type === 'candidate') {
    state.jobsBoardFilter = 'review';
  } else if (type === 'pipeline') {
    state.jobsBoardFilter = 'pipeline';
  }

  if (type === 'pipeline') {
    setSelectedPipelineOpportunityId(id);
    if (state.taskPack?.opportunity?.id && state.taskPack.opportunity.id !== id) {
      state.taskPack = null;
    }
  } else {
    state.taskPack = null;
  }
}

function selectedJobsRecord(snapshot = state.snapshot) {
  ensureJobsBoardState(snapshot);
  if (state.jobsSelection.type === 'candidate') {
    const candidate = pendingCandidates(snapshot).find(item => item.id === state.jobsSelection.id) || null;
    return candidate ? { type: 'candidate', record: candidate } : null;
  }
  if (state.jobsSelection.type === 'pipeline') {
    const opportunity = findPipelineOpportunity(snapshot, state.jobsSelection.id);
    return opportunity ? { type: 'pipeline', record: opportunity } : null;
  }
  return null;
}

function selectedOpportunity(snapshot = state.snapshot) {
  const selected = selectedJobsRecord(snapshot);
  if (selected?.type === 'pipeline') {
    return selected.record;
  }
  return null;
}

function ensureTaskOpportunitySelection(snapshot) {
  const select = document.getElementById('task-opportunity');
  const opportunities = pipelineOpportunities(snapshot);
  if (!select || !opportunities.length) return;

  const currentValue = state.selectedPipelineOpportunityId || select.value;
  select.innerHTML = opportunities.map(opportunity => `
    <option value="${escapeHtml(opportunity.id)}">${escapeHtml(opportunity.company)} - ${escapeHtml(opportunity.role)}</option>
  `).join('');

  const exists = opportunities.some(opportunity => opportunity.id === currentValue);
  const selectedId = exists ? currentValue : opportunities[0].id;
  select.value = selectedId;
  setSelectedPipelineOpportunityId(selectedId);
}

function selectedApplicationOpportunity(snapshot = state.snapshot) {
  const opportunities = pipelineOpportunities(snapshot);
  if (!opportunities.length) return null;
  const select = document.getElementById('application-opportunity');
  const selectedId = state.selectedPipelineOpportunityId || select?.value || opportunities[0].id;
  return findPipelineOpportunity(snapshot, selectedId) || opportunities[0];
}

function ensureApplicationOpportunitySelection(snapshot) {
  const select = document.getElementById('application-opportunity');
  const opportunities = pipelineOpportunities(snapshot);
  if (!select || !opportunities.length) return;

  const currentValue = state.selectedPipelineOpportunityId || select.value;
  select.innerHTML = opportunities.map(opportunity => `
    <option value="${escapeHtml(opportunity.id)}">${escapeHtml(opportunity.company)} - ${escapeHtml(opportunity.role)}</option>
  `).join('');

  const exists = opportunities.some(opportunity => opportunity.id === currentValue);
  const selectedId = exists ? currentValue : opportunities[0].id;
  select.value = selectedId;
  setSelectedPipelineOpportunityId(selectedId);
}

function applicationRunForOpportunity(snapshot, opportunityId) {
  return (snapshot?.applications?.runs || []).find(run => run.opportunity_id === opportunityId) || null;
}

function selectedApplicationRun(snapshot = state.snapshot) {
  const opportunity = selectedApplicationOpportunity(snapshot);
  return opportunity ? applicationRunForOpportunity(snapshot, opportunity.id) : null;
}

function latestApplicationHandoff(opportunityId = '') {
  return applicationHandoffs().find(handoff => !opportunityId || handoff.opportunity_id === opportunityId) || null;
}

async function loadDashboard() {
  const [snapshot, doctor, agentSetup, bridge, browserAssist, legalInfo] = await Promise.all([
    fetchJson('/api/workspace'),
    fetchJson('/api/doctor'),
    fetchJson(agentSetupUrl()),
    fetchJson('/api/agent-bridge'),
    fetchJson('/api/browser-assist'),
    fetchJson('/api/legal'),
  ]);

  await loadDesktopContext();

  state.snapshot = snapshot;
  state.doctor = doctor;
  state.agentSetup = agentSetup;
  state.assistantId = agentSetup.assistant.id;
  state.agentMode = agentSetup.mode;
  state.bridge = bridge;
  state.browserAssist = browserAssist;
  state.legalInfo = legalInfo;
  ensureLayoutState(snapshot);
  render();
}

function progressPercent(steps = []) {
  if (!steps.length) return 0;
  const completed = steps.filter(step => step.complete).length;
  return Math.round((completed / steps.length) * 100);
}

function renderWizard(snapshot) {
  const steps = buildJourneySteps(snapshot);
  const wizardGrid = document.getElementById('wizard-grid');
  const completed = steps.filter(step => step.complete).length;
  const total = steps.length;
  const currentStep = currentSetupStep(steps);

  document.getElementById('wizard-count').textContent = `${completed}/${total} steps complete`;
  document.getElementById('onboarding-progress').textContent = `${completed}/${total} steps complete`;
  document.getElementById('current-focus').textContent = currentStep
    ? `Current focus: ${currentStep.title}`
    : 'Your setup is ready';
  document.getElementById('progress-fill').style.width = `${progressPercent(steps)}%`;

  wizardGrid.innerHTML = steps.map(step => `
    <article class="wizard-card ${step.complete ? 'complete' : ''} ${currentStep?.key === step.key ? 'current' : ''} ${state.activeSetupPanel === step.target ? 'selected' : ''}">
      <div class="module-top">
        <div>
          <p class="mini-label">Step ${step.stepNumber}</p>
          <h3>${escapeHtml(step.title)}</h3>
        </div>
        <span class="${step.complete ? 'pill success' : currentStep?.key === step.key ? 'pill accent' : 'pill warning'}">${step.complete ? 'Done' : currentStep?.key === step.key ? 'Start here' : 'Review'}</span>
      </div>
      <p>${escapeHtml(step.details)}</p>
      <small>${escapeHtml(step.summary)}</small>
      <button
        class="ghost-button wizard-button"
        type="button"
        data-scroll-target="${escapeHtml(step.target)}"
      >
        Open Step
      </button>
    </article>
  `).join('');
}

function renderHealth() {
  const doctor = state.doctor;
  const steps = buildJourneySteps(state.snapshot);
  const currentStep = currentSetupStep(steps);
  const jumpButton = document.getElementById('jump-to-current-step');

  document.getElementById('doctor-pill').textContent = doctor.ok ? 'Ready' : 'Needs setup';
  document.getElementById('doctor-pill').className = doctor.ok ? 'pill success' : 'pill danger';

  if (doctor.ok) {
    document.getElementById('doctor-summary').textContent = currentStep
      ? `Your local workspace is ready. Start with "${currentStep.title}" in Setup, then move to Jobs and Apply when you are ready.`
      : 'Your local workspace is ready.';
  } else {
    document.getElementById('doctor-summary').textContent = `Missing files: ${doctor.missing_files.join(', ')}`;
  }

  const nextActions = document.getElementById('next-actions-list');
  const items = steps.filter(step => !step.complete).slice(0, 3);
  nextActions.innerHTML = items.length ? items.map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.summary)}</span>
    </div>
  `).join('') : '<p class="empty-state">All key setup steps are complete. You can review jobs or prepare another assistant package.</p>';

  if (currentStep && jumpButton) {
    jumpButton.dataset.scrollTarget = currentStep.target;
    jumpButton.textContent = `Open ${currentStep.title}`;
  }
}

function renderSourceLists(snapshot) {
  const careerSources = snapshot.documents.career_sources || [];
  const writingSamples = snapshot.documents.writing_samples || [];

  document.getElementById('career-source-count').textContent = `${careerSources.length} imported`;
  document.getElementById('writing-source-count').textContent = `${writingSamples.length} samples`;

  document.getElementById('career-source-list').innerHTML = careerSources.length ? careerSources.map(source => `
    <div class="source-card">
      <strong>${escapeHtml(source.filename || source.id || 'Imported source')}</strong>
      <span>${titleCase(source.kind || 'document')}</span>
      <small>${escapeHtml(source.normalized_text || '')}</small>
    </div>
  `).join('') : '<p class="empty-state">No career materials imported yet.</p>';

  document.getElementById('writing-source-list').innerHTML = writingSamples.length ? writingSamples.map(sample => `
    <div class="source-card">
      <strong>${escapeHtml(sample.id || 'Writing sample')}</strong>
      <span>Writing sample</span>
      <small>${escapeHtml(sample.relative_path || '')}</small>
    </div>
  `).join('') : '<p class="empty-state">No writing samples imported yet.</p>';
}

function formatLines(items = []) {
  return (items || []).join('\n');
}

function formatKeyValueLines(entries = {}) {
  return Object.entries(entries || {})
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function renderSettings(snapshot) {
  const settings = snapshot.settings || {};
  const strategy = settings.search_strategy || {};
  const profile = settings.application_profile || {};
  const options = settings.options || {};

  document.getElementById('strategy-lanes').value = formatLines((strategy.lanes || []).map(lane => lane.name || lane.slug));
  document.getElementById('strategy-preferred-locations').value = formatLines(strategy.geography?.preferred || []);
  document.getElementById('strategy-acceptable-locations').value = formatLines(strategy.geography?.acceptable || []);
  document.getElementById('strategy-blocked-locations').value = formatLines(strategy.geography?.blocked || []);
  document.getElementById('strategy-work-modes').value = formatLines(strategy.work_mode_preferences || []);
  document.getElementById('strategy-target-base').value = Number(strategy.compensation?.target_base_usd || 0) || '';
  document.getElementById('strategy-exception-floor').value = Number(strategy.compensation?.exception_floor_usd || 0) || '';
  document.getElementById('strategy-step-down').value = formatLines(strategy.step_down_logic || []);

  document.getElementById('profile-email').value = profile.contact?.email || '';
  document.getElementById('profile-phone').value = profile.contact?.phone || '';
  document.getElementById('profile-linkedin').value = profile.contact?.linkedin_url || '';
  document.getElementById('profile-portfolio').value = profile.contact?.portfolio_url || '';
  document.getElementById('profile-safe-answers').value = formatKeyValueLines(profile.safe_answers || {});
  document.getElementById('profile-human-gates').value = formatLines(Object.keys(profile.human_gated_fields || {}));

  const phaseSelect = document.getElementById('opportunity-phase');
  const laneSelect = document.getElementById('opportunity-lane');
  const stageSelect = document.getElementById('opportunity-company-stage');
  const workModeSelect = document.getElementById('opportunity-work-mode');

  phaseSelect.innerHTML = (options.phases || []).map(phase => `
    <option value="${escapeHtml(phase)}">${escapeHtml(titleCase(phase))}</option>
  `).join('');
  phaseSelect.value = phaseSelect.value || 'researching';

  laneSelect.innerHTML = (options.lanes || []).map(lane => `
    <option value="${escapeHtml(lane.slug)}">${escapeHtml(lane.name || lane.slug)}</option>
  `).join('');
  if (laneSelect.options.length) laneSelect.value = laneSelect.value || laneSelect.options[0].value;

  stageSelect.innerHTML = (options.company_stages || []).map(stage => `
    <option value="${escapeHtml(stage)}">${escapeHtml(titleCase(stage))}</option>
  `).join('');
  if (stageSelect.options.length) stageSelect.value = stageSelect.value || stageSelect.options[0].value;

  workModeSelect.innerHTML = (options.work_modes || []).map(mode => `
    <option value="${escapeHtml(mode)}">${escapeHtml(titleCase(mode))}</option>
  `).join('');
  if (workModeSelect.options.length) workModeSelect.value = workModeSelect.value || workModeSelect.options[0].value;
}

function latestSourcingHandoff() {
  return (state.bridge?.recent_handoffs || []).find(handoff => handoff.task_type === 'source_opportunities') || null;
}

function renderJobsWorkspace(snapshot) {
  ensureJobsBoardState(snapshot);

  const pending = pendingCandidates(snapshot);
  const pipeline = pipelineOpportunities(snapshot);
  const list = document.getElementById('jobs-board-list');
  const boardPill = document.getElementById('jobs-board-pill');
  const filterCopy = document.getElementById('jobs-filter-copy');
  const reviewButton = document.getElementById('jobs-filter-review');
  const pipelineButton = document.getElementById('jobs-filter-pipeline');

  boardPill.textContent = `${pending.length} to review · ${pipeline.length} pipeline`;
  reviewButton.classList.toggle('active', state.jobsBoardFilter === 'review');
  pipelineButton.classList.toggle('active', state.jobsBoardFilter === 'pipeline');

  filterCopy.textContent = state.jobsBoardFilter === 'review'
    ? 'Review queue roles stay here until you approve or dismiss them.'
    : 'Pipeline roles are the ones you have already decided to actively pursue.';

  const items = state.jobsBoardFilter === 'review' ? pending : pipeline;
  list.innerHTML = items.length ? items.map(item => {
    const isCandidate = state.jobsBoardFilter === 'review';
    const isSelected = state.jobsSelection.type === (isCandidate ? 'candidate' : 'pipeline') && state.jobsSelection.id === item.id;
    const status = isCandidate
      ? titleCase(item.review_band || 'review')
      : titleCase(item.phase || 'pipeline');
    const meta = isCandidate
      ? `${item.location || 'Location not listed'} · ${item.source_site || item.source_label || 'Unknown source'}`
      : `${titleCase(item.recommendation || 'active')} · ${item.location || 'Location not listed'}`;
    const subcopy = isCandidate
      ? item.review_reason || item.summary || 'Review whether this belongs in your pipeline.'
      : item.next_step || 'Choose the next move for this role.';
    return `
      <button
        class="jobs-list-item ${isSelected ? 'selected' : ''}"
        type="button"
        data-jobs-select-type="${isCandidate ? 'candidate' : 'pipeline'}"
        data-jobs-select-id="${escapeHtml(item.id)}"
      >
        <div class="jobs-list-top">
          <strong>${escapeHtml(item.company)}</strong>
          <span class="pill ${isCandidate ? 'accent' : 'success'}">${escapeHtml(status)}</span>
        </div>
        <span class="jobs-list-role">${escapeHtml(item.role)}</span>
        <small>${escapeHtml(meta)}</small>
        <small>${escapeHtml(subcopy)}</small>
      </button>
    `;
  }).join('') : `<p class="empty-state">${state.jobsBoardFilter === 'review' ? 'No roles are waiting for review yet. Run a search or import results to populate the queue.' : 'No roles are in your active pipeline yet. Approve a reviewed role or add one manually.'}</p>`;

  renderJobsDetail(snapshot);
}

function renderJobsDetail(snapshot) {
  const selected = selectedJobsRecord(snapshot);
  const empty = document.getElementById('jobs-detail-empty');
  const body = document.getElementById('jobs-detail-body');
  const heading = document.getElementById('jobs-detail-heading');
  const statusPill = document.getElementById('jobs-detail-status-pill');
  const kicker = document.getElementById('jobs-detail-kicker');
  const title = document.getElementById('jobs-detail-title');
  const meta = document.getElementById('jobs-detail-meta');
  const summary = document.getElementById('jobs-detail-summary');
  const tags = document.getElementById('jobs-detail-tags');
  const actions = document.getElementById('jobs-detail-primary-actions');
  const link = document.getElementById('jobs-detail-link');
  const applyButton = document.getElementById('jobs-open-apply');

  if (!selected) {
    empty.hidden = false;
    body.hidden = true;
    heading.textContent = 'Selected Role';
    statusPill.textContent = 'Awaiting roles';
    statusPill.className = 'pill warning';
    applyButton.disabled = true;
    return;
  }

  empty.hidden = true;
  body.hidden = false;

  if (selected.type === 'candidate') {
    const candidate = selected.record;
    heading.textContent = 'Review This Role';
    statusPill.textContent = titleCase(candidate.review_band || 'review');
    statusPill.className = 'pill accent';
    kicker.textContent = 'Review queue';
    title.textContent = `${candidate.company} - ${candidate.role}`;
    meta.textContent = `${candidate.location || 'Location not listed'} · ${candidate.source_site || candidate.source_label || 'Unknown source'}${candidate.priority_score_hint ? ` · Score ${candidate.priority_score_hint}` : ''}`;
    summary.textContent = candidate.review_reason || candidate.summary || 'Decide whether this role is strong enough to move into your active pipeline.';
    tags.innerHTML = [
      candidate.compensation ? `Compensation: ${candidate.compensation}` : '',
      candidate.strategy?.lane ? `Target path: ${titleCase(candidate.strategy.lane)}` : '',
      candidate.source_label ? `Source: ${candidate.source_label}` : '',
    ].filter(Boolean).map(item => `<span class="pill">${escapeHtml(item)}</span>`).join('');
    actions.innerHTML = `
      <button class="primary-button" type="button" data-jobs-action="approve-selected">Approve Into Pipeline</button>
      <button class="ghost-button" type="button" data-jobs-action="dismiss-selected">Dismiss</button>
    `;
    if (candidate.source_url) {
      link.hidden = false;
      link.href = candidate.source_url;
      link.textContent = 'Open source listing';
    } else {
      link.hidden = true;
      link.removeAttribute('href');
    }
    applyButton.disabled = true;
    return;
  }

  const opportunity = selected.record;
  heading.textContent = 'Pipeline Role';
  statusPill.textContent = titleCase(opportunity.phase || 'pipeline');
  statusPill.className = 'pill success';
  kicker.textContent = 'Active pipeline';
  title.textContent = `${opportunity.company} - ${opportunity.role}`;
  meta.textContent = `${opportunity.location || 'Location not listed'}${opportunity.compensation ? ` · ${opportunity.compensation}` : ''}${opportunity.priority_score ? ` · Score ${opportunity.priority_score}` : ''}`;
  summary.textContent = opportunity.next_step || 'Choose the next move for this role.';
  tags.innerHTML = [
    opportunity.recommendation ? `Recommendation: ${titleCase(opportunity.recommendation)}` : '',
    opportunity.strategy?.lane ? `Target path: ${titleCase(opportunity.strategy.lane)}` : '',
    opportunity.strategy?.company_stage ? `Stage: ${titleCase(opportunity.strategy.company_stage)}` : '',
    opportunity.strategy?.work_mode ? `Work setup: ${titleCase(opportunity.strategy.work_mode)}` : '',
  ].filter(Boolean).map(item => `<span class="pill">${escapeHtml(item)}</span>`).join('');
  actions.innerHTML = `
    <button class="secondary-button" type="button" data-jobs-action="focus-apply">Continue In Apply</button>
    ${opportunity.source_url ? '<button class="ghost-button" type="button" data-jobs-action="open-source">Open Source Listing</button>' : ''}
  `;
  if (opportunity.source_url) {
    link.hidden = false;
    link.href = opportunity.source_url;
    link.textContent = 'Open source listing';
  } else {
    link.hidden = true;
    link.removeAttribute('href');
  }
  applyButton.disabled = false;
}

function renderSourcing(snapshot) {
  const sourcing = snapshot.sourcing || {};
  const latest = latestSourcingHandoff();
  const sourcingGuidance = deriveSourcingGuidance(snapshot, latest);

  document.getElementById('sourcing-count').textContent = `${Number(sourcing.total_candidates || 0)} found`;
  document.getElementById('sourcing-helper-copy').textContent = `Using ${state.agentSetup?.assistant?.title || 'your chosen assistant'} via ${state.agentSetup?.mode_meta?.title || 'the recommended setup'}. If you want a different assistant for search, change it in Setup first.`;

  document.getElementById('sourcing-summary-list').innerHTML = [
    ['Waiting for review', Number(sourcing.pending_count || 0)],
    ['Approved into pipeline', Number(sourcing.approved_count || 0)],
    ['Dismissed', Number(sourcing.dismissed_count || 0)],
  ].map(([label, count]) => `
    <div class="stat-row">
      <span>${escapeHtml(label)}</span>
      <strong>${count}</strong>
    </div>
  `).join('');

  const handoffPill = document.getElementById('sourcing-handoff-pill');
  const handoffList = document.getElementById('sourcing-handoff-list');
  if (!latest) {
    handoffPill.textContent = 'Not prepared';
    handoffPill.className = 'pill warning';
    handoffList.innerHTML = '<p class="empty-state">No search package has been prepared yet. Click Run Search With My Assistant first, then refresh after your assistant finishes the search.</p>';
  } else {
    handoffPill.textContent = `${titleCase(latest.status)} · ${latest.adapter_title}`;
    handoffPill.className = 'pill success';
    handoffList.innerHTML = [
      `Package folder: ${latest.absolute_bundle_dir}`,
      `Prompt file: ${latest.absolute_prompt_file}`,
      `Next step: ${latest.next_user_action}`,
      ...latest.launch_notes,
    ].map(item => `
      <div class="checklist-item">
        <strong>${escapeHtml(item)}</strong>
      </div>
    `).join('');
  }

  const guidancePill = document.getElementById('sourcing-guidance-pill');
  const guidanceSummary = document.getElementById('sourcing-guidance-summary');
  const guidanceList = document.getElementById('sourcing-guidance-list');
  const guidanceFootnote = document.getElementById('sourcing-guidance-footnote');
  guidancePill.textContent = sourcingGuidance.pill;
  guidancePill.className = sourcingGuidance.pillClass;
  guidanceSummary.textContent = sourcingGuidance.summary;
  guidanceList.innerHTML = renderGuidanceItems(sourcingGuidance.steps);
  guidanceFootnote.textContent = sourcingGuidance.footnote;

  renderJobsWorkspace(snapshot);
}

function renderArtifacts(snapshot) {
  const artifactGrid = document.getElementById('artifact-grid');
  artifactGrid.innerHTML = snapshot.artifacts.map(artifact => `
    <article class="artifact-card ${artifact.exists ? 'ready' : 'pending'}">
      <div class="module-top">
        <h3>${escapeHtml(artifact.title)}</h3>
        <span class="${artifact.exists ? 'pill success' : 'pill warning'}">${artifact.exists ? 'Ready' : 'Missing'}</span>
      </div>
      <p>${escapeHtml(artifact.description)}</p>
      <small>${artifact.exists ? `Updated ${escapeHtml(formatTimestamp(artifact.updated_at))}` : 'Generate this artifact from the buttons above.'}</small>
      <button
        class="ghost-button"
        type="button"
        data-artifact-path="${escapeHtml(artifact.relative_path)}"
        ${artifact.exists ? '' : 'disabled'}
      >
        Preview
      </button>
    </article>
  `).join('');

  document.getElementById('artifact-preview-pill').textContent = state.artifactPreview.title || 'Preview';
  document.getElementById('artifact-preview').textContent = state.artifactPreview.content;
}

function renderDesktopShell() {
  const banner = document.getElementById('desktop-banner');
  if (!banner) return;

  if (!state.desktop.available || !state.desktop.context) {
    banner.classList.add('hidden');
    return;
  }

  banner.classList.remove('hidden');
  document.getElementById('desktop-storage-copy').textContent = state.desktop.context.storageLabel || 'Stored locally on this computer.';
  document.getElementById('desktop-workspace-copy').textContent = state.desktop.context.workspacePath || state.snapshot?.meta?.workspace_path || '';
}

function renderAgentSetup() {
  const agentSetup = state.agentSetup;
  const assistantSelect = document.getElementById('assistant-id');
  assistantSelect.innerHTML = (agentSetup.assistant_options || []).map(option => `
    <option value="${escapeHtml(option.id)}">${escapeHtml(option.title)}</option>
  `).join('');
  assistantSelect.value = agentSetup.assistant.id;

  const modeSelect = document.getElementById('agent-mode');
  modeSelect.innerHTML = (agentSetup.available_modes || []).map(mode => `
    <option value="${escapeHtml(mode.id)}">${escapeHtml(mode.title)}</option>
  `).join('');
  modeSelect.value = agentSetup.mode;
  modeSelect.disabled = (agentSetup.available_modes || []).length <= 1;

  document.getElementById('assistant-summary').textContent = `${agentSetup.assistant.summary} ${agentSetup.assistant.audience}`;
  document.getElementById('assistant-badges').innerHTML = (agentSetup.assistant.badges || []).map(badge => `
    <span class="pill accent">${escapeHtml(badge)}</span>
  `).join('');
  document.getElementById('agent-mode-note').textContent = agentSetup.mode_meta?.description || '';
  document.getElementById('agent-summary').textContent = `Current setup: ${agentSetup.summary}`;
  document.getElementById('agent-examples').innerHTML = (agentSetup.examples || []).map(example => `
    <span class="pill accent">${escapeHtml(example)}</span>
  `).join('');
  document.getElementById('assistant-path-pill').textContent = agentSetup.mode_meta?.title || 'Setup';
  document.getElementById('assistant-guidance').innerHTML = [agentSetup.assistant.why_this_path, agentSetup.mode_meta?.description || '']
    .filter(Boolean)
    .map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');
  document.getElementById('agent-steps').innerHTML = (agentSetup.steps || []).map(step => `
    <div class="checklist-item">
      <strong>${escapeHtml(step)}</strong>
    </div>
  `).join('');
  document.getElementById('assistant-advanced').innerHTML = [agentSetup.assistant.advanced_note].map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');
  document.getElementById('agent-controls').innerHTML = (agentSetup.user_controls || []).map(control => `
    <div class="checklist-item">
      <strong>${escapeHtml(control)}</strong>
    </div>
  `).join('');
  document.getElementById('agent-prompt').value = agentSetup.prompt || '';
}

function renderTaskPack(snapshot) {
  ensureTaskOpportunitySelection(snapshot);

  const opportunity = selectedOpportunity(snapshot);
  const summaryList = document.getElementById('task-summary-list');
  const filesList = document.getElementById('task-files-list');
  const checklist = document.getElementById('task-checklist');
  const typePill = document.getElementById('task-type-pill');
  const outputPill = document.getElementById('task-output-pill');
  const promptBox = document.getElementById('task-prompt');

  if (!opportunity) {
    typePill.textContent = 'Approve first';
    outputPill.textContent = 'Awaiting message';
    summaryList.innerHTML = '<p class="empty-state">Approve a role into the pipeline before preparing assistant help for it.</p>';
    filesList.innerHTML = '<p class="empty-state">Once a pipeline role is selected, the app will suggest the best files to include.</p>';
    checklist.innerHTML = '<p class="empty-state">Assistant guidance appears after you select a pipeline role and choose a task.</p>';
    promptBox.value = 'Select a pipeline role in the Jobs workspace to preview the message that will go to your assistant.';
    return;
  }

  const pack = state.taskPack && state.taskPack.opportunity?.id === opportunity.id ? state.taskPack : null;
  const summaryItems = [
    `Company: ${opportunity.company}`,
    `Job title: ${opportunity.role}`,
    `Current stage: ${titleCase(opportunity.phase)}`,
    `Recommendation: ${titleCase(opportunity.recommendation || 'pending review')}`,
    `Priority score: ${opportunity.priority_score ?? 'TBD'}`,
    opportunity.human_gate ? 'Manual checkpoint: This job already has a manual-review checkpoint.' : 'Manual checkpoint: No job-level block is currently flagged.',
    `Suggested next move: ${opportunity.next_step || 'Review the next action'}`,
  ];

  summaryList.innerHTML = summaryItems.map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');

  if (!pack) {
    typePill.textContent = 'Choose a task';
    outputPill.textContent = 'Awaiting message';
    filesList.innerHTML = '<p class="empty-state">Generate a task to see which files should go to your assistant.</p>';
    checklist.innerHTML = '<p class="empty-state">Generate a task to get a role-specific checklist.</p>';
    promptBox.value = `Selected role: ${opportunity.company} - ${opportunity.role}\n\nChoose one of the task buttons above to package a copyable brief for your current agent mode.`;
    return;
  }

  typePill.textContent = pack.task_title;
  outputPill.textContent = pack.output_task_pack || 'Ready';
  filesList.innerHTML = pack.recommended_files.length ? pack.recommended_files.map(file => `
    <div class="source-card">
      <strong>${escapeHtml(file.split('/').slice(-1)[0])}</strong>
      <span>Workspace file</span>
      <small>${escapeHtml(file)}</small>
    </div>
  `).join('') : '<p class="empty-state">No recommended files listed for this task.</p>';
  checklist.innerHTML = pack.checklist.map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');
  promptBox.value = pack.prompt || '';
}

function applicationStatusMeta(status = '') {
  if (status === 'submitted') return { label: 'Submitted', className: 'pill success' };
  if (status === 'prepared') return { label: 'Ready', className: 'pill success' };
  if (status === 'awaiting_final_confirmation') return { label: 'Final Review', className: 'pill accent' };
  if (status === 'assistant_in_progress') return { label: 'Assistant Working', className: 'pill accent' };
  if (status === 'browser_assist_in_progress') return { label: 'Browser Assist', className: 'pill accent' };
  if (status === 'manual_review_required') return { label: 'Needs Manual Review', className: 'pill warning' };
  if (status === 'browser_assist_error') return { label: 'Browser Assist Error', className: 'pill danger' };
  if (status.startsWith('needs_')) return { label: titleCase(status), className: 'pill warning' };
  return { label: titleCase(status || 'Not started'), className: 'pill warning' };
}

function pillClassForTone(tone = '') {
  if (tone === 'success') return 'pill success';
  if (tone === 'warning') return 'pill warning';
  if (tone === 'danger') return 'pill danger';
  if (tone === 'accent') return 'pill accent';
  return 'pill';
}

function fileNameFromPath(value = '') {
  return String(value || '').split('/').filter(Boolean).slice(-1)[0] || value || '';
}

function renderBoundedChecklist(items = [], limit = 6, renderItem, emptyMessage = 'Nothing to show yet.') {
  if (!items.length) {
    return `<p class="empty-state">${escapeHtml(emptyMessage)}</p>`;
  }

  const visible = items.slice(0, limit);
  const moreCount = Math.max(0, items.length - visible.length);

  return [
    ...visible.map(renderItem),
    moreCount ? `
      <div class="checklist-item">
        <strong>Plus ${moreCount} more item${moreCount === 1 ? '' : 's'} in the full session log.</strong>
      </div>
    ` : '',
  ].filter(Boolean).join('');
}

function renderApplicationReview(run) {
  const review = run?.review_summary || {
    label: 'Awaiting Review',
    tone: 'warning',
    summary: run?.next_step || 'This run has not been reviewed yet.',
  };
  const details = run?.browser_assist_details || null;
  const autoFilled = details?.auto_filled || [];
  const manualItems = details?.manual_review_items || [];
  const blockers = details?.unresolved_required_fields || [];
  const nextStep = details?.next_step || run?.next_step || 'The app will explain the next safe move here.';

  return {
    review,
    nextStep,
    metrics: [
      {
        label: 'Auto-filled',
        value: autoFilled.length,
        note: autoFilled.length ? 'Handled automatically' : 'Nothing auto-filled yet',
      },
      {
        label: 'Manual review',
        value: manualItems.length,
        note: manualItems.length ? 'Needs your approval' : 'No flagged manual items',
      },
      {
        label: 'Blockers',
        value: blockers.length,
        note: blockers.length ? 'Still blocking submit' : 'No unresolved blockers',
      },
    ],
    autoFilledHtml: renderBoundedChecklist(
      autoFilled,
      6,
      item => `
        <div class="checklist-item">
          <strong>${escapeHtml(item.field || 'Filled field')}</strong>
          <span>${escapeHtml(
            item.kind === 'upload'
              ? `Attached ${fileNameFromPath(item.file)}`
              : `${item.value_preview || 'Saved answer used'}${item.source ? ` · ${item.source}` : ''}`
          )}</span>
        </div>
      `,
      run
        ? 'The app has not auto-filled any fields on this run yet.'
        : 'Start an application run first and the app will summarize its work here.'
    ),
    manualHtml: renderBoundedChecklist(
      manualItems,
      6,
      item => `
        <div class="checklist-item">
          <strong>${escapeHtml(item.label || 'Manual review item')}</strong>
          <span>${escapeHtml(item.reason || 'This answer still needs your approval.')}</span>
        </div>
      `,
      run?.status === 'awaiting_final_confirmation'
        ? 'No flagged manual-review items remain from the last browser-assist pass. You should still do a careful final check yourself.'
        : 'No flagged manual-review items in the last pass yet.'
    ),
    blockersHtml: renderBoundedChecklist(
      blockers,
      6,
      item => `
        <div class="checklist-item">
          <strong>${escapeHtml(item)}</strong>
          <span>Clear this in the live application before you submit.</span>
        </div>
      `,
      run?.status === 'awaiting_final_confirmation'
        ? 'No unresolved blockers were left by the last pass.'
        : 'No unresolved blockers have been recorded yet.'
    ),
  };
}

function humanBoundarySummary(snapshot, run) {
  const labels = (run?.manual_checkpoints?.map(item => item.label) || [])
    .concat((snapshot?.human_gates || []).map(item => titleCase(item)))
    .filter(Boolean);
  const unique = [...new Set(labels)];
  if (!unique.length) {
    return 'Sensitive answers and the final submit step always stay with you.';
  }
  const visible = unique.slice(0, 3);
  const more = unique.length - visible.length;
  const joined = visible.join(', ');
  return `Sensitive answers like ${joined}${more > 0 ? ', and others' : ''} always stay with you, and final submit is always manual.`;
}

function renderGuidanceItems(items = []) {
  return items.map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');
}

function deriveSourcingGuidance(snapshot, latest) {
  const sourcing = snapshot.sourcing || {};
  const pending = Number(sourcing.pending_count || 0);
  const approved = Number(sourcing.approved_count || 0);
  const dismissed = Number(sourcing.dismissed_count || 0);
  const total = Number(sourcing.total_candidates || 0);

  if (!latest) {
    return {
      pill: 'Start the search',
      pillClass: 'pill warning',
      summary: 'No assistant search package has been prepared yet, so the system has nothing to review.',
      steps: [
        'Click Run Search With My Assistant to create the search package.',
        'Use that package with the assistant you chose in Setup.',
        'Refresh Search Results after the assistant has written results back or after you import them manually.',
      ],
      footnote: 'If your assistant gives you a markdown or YAML report instead of writing into the workspace, use the manual import panel below.',
    };
  }

  if (!total) {
    return {
      pill: 'Waiting on results',
      pillClass: 'pill warning',
      summary: 'The search package is ready, but no jobs have been loaded back into Job Hunter OS yet.',
      steps: latest.adapter === 'chat_upload'
        ? [
            'Open the package folder and upload the prepared files to your assistant.',
            'Paste the message from the prompt file and ask it to return search results in the package format.',
            'Then refresh here or import the assistant output manually if it came back in chat.',
          ]
        : [
            'Open your connected assistant in this workspace and point it at the latest search package.',
            'Let it run the search and write the results back into the workspace files.',
            'Then click Refresh Search Results to load the new queue.',
          ],
      footnote: 'If nothing shows up after a run, the easiest fallback is the manual import panel below this workspace.',
    };
  }

  if (pending > 0) {
    return {
      pill: 'Review queue ready',
      pillClass: 'pill success',
      summary: `You have ${pending} role${pending === 1 ? '' : 's'} waiting for review, so the fastest move is to work through the queue on the left.`,
      steps: [
        'Open the strongest role in To Review.',
        'Approve the good matches into your pipeline or dismiss the weak ones.',
        'Use Continue In Apply only after a role is clearly worth pursuing.',
      ],
      footnote: approved
        ? `${approved} role${approved === 1 ? '' : 's'} already made it into your active pipeline.`
        : 'You can run another search later, but the highest-value work now is reviewing the current queue.',
    };
  }

  if (approved > 0) {
    return {
      pill: 'Queue is clear',
      pillClass: 'pill accent',
      summary: 'There are no more roles waiting for review right now. The best next move is to work your approved pipeline roles.',
      steps: [
        'Switch to Pipeline on the left.',
        'Select a role and either prepare an assistant package or continue in Apply.',
        'Run another search only after you want more options in the queue.',
      ],
      footnote: dismissed
        ? `${dismissed} role${dismissed === 1 ? '' : 's'} were dismissed in this batch, so the review loop is complete.`
        : 'Your latest search batch has already been processed.',
    };
  }

  return {
    pill: 'Run another search',
    pillClass: 'pill accent',
    summary: 'This search batch no longer has anything actionable in it.',
    steps: [
      'Run a fresh search with your assistant.',
      'Or import another search report manually.',
      'Then review the new queue when it appears.',
    ],
    footnote: 'A cleared search queue is normal once everything has been approved or dismissed.',
  };
}

function deriveHandoffGuidance({ snapshot, opportunity, pack, latest, agentSetup }) {
  const assistantTitle = agentSetup?.assistant?.title || 'your assistant';

  if (!opportunity) {
    return {
      pill: 'Choose a role',
      pillClass: 'pill warning',
      summary: 'There is no pipeline role selected yet, so the app cannot package assistant help.',
      steps: [
        'Approve a role into the pipeline from the Jobs review queue.',
        'Select that role in the Jobs workspace.',
        'Then choose the task you want help with.',
      ],
      footnote: 'The assistant package always follows the currently selected pipeline role.',
    };
  }

  if (!pack) {
    return {
      pill: 'Choose the task',
      pillClass: 'pill warning',
      summary: 'The role is selected, but the task-specific message has not been generated yet.',
      steps: [
        'Pick Review This Job, Draft Application Materials, or Prepare Submission Help.',
        'Read the generated message and checklist first.',
        'Then click Prepare Assistant Package.',
      ],
      footnote: 'The package is easier to use once the task-specific message already looks right to you.',
    };
  }

  if (!latest) {
    return {
      pill: 'Package not built',
      pillClass: 'pill warning',
      summary: `The task message is ready, but ${assistantTitle} does not have a packaged handoff yet.`,
      steps: [
        'Click Prepare Assistant Package.',
        'Open the package folder or copy the assistant instructions.',
        'Refresh the dashboard after the assistant finishes the safe portion of the work.',
      ],
      footnote: 'This turns the message into a cleaner bundle so you do not have to assemble context by hand.',
    };
  }

  if ((latest.missing_files || []).length) {
    return {
      pill: 'Rebuild package',
      pillClass: 'pill warning',
      summary: 'The latest package was created, but some referenced files were missing when it was built.',
      steps: [
        `Generate or attach the missing files: ${(latest.missing_files || []).slice(0, 3).join(', ')}`,
        'Prepare the assistant package again after those files exist.',
        'Then continue with the refreshed bundle instead of the older one.',
      ],
      footnote: 'Using an incomplete package can make the assistant miss important context.',
    };
  }

  if (latest.adapter === 'chat_upload') {
    return {
      pill: 'Upload package ready',
      pillClass: 'pill success',
      summary: `The package is ready for ${assistantTitle}. The remaining work is outside the app in your chat assistant.`,
      steps: [
        'Open the package folder and upload the prepared files from the uploads directory.',
        'Paste the message from the prompt file.',
        'Stop for sensitive answers and before final submit, then come back here and refresh.',
      ],
      footnote: 'If the assistant responds in a separate chat, use Copy Assistant Instructions so you do not have to interpret the handoff yourself.',
    };
  }

  return {
    pill: 'Connected package ready',
    pillClass: 'pill success',
    summary: `The package is ready for ${assistantTitle} with direct workspace access.`,
    steps: [
      'Open the connected assistant in this workspace.',
      'Point it to the task pack or prompt file shown above.',
      'Refresh the dashboard after it reaches a meaningful checkpoint or final review stop.',
    ],
    footnote: 'The package still expects the assistant to stop for sensitive answers and before final submit.',
  };
}

function deriveApplicationPauseGuidance({ snapshot, run, browserAssistMeta, latestHandoff }) {
  const browserSession = run?.browser_assist || null;
  const details = run?.browser_assist_details || null;
  const nextStep = details?.next_step || browserSession?.next_step || run?.next_step || '';
  const nextStepLower = String(nextStep || '').toLowerCase();
  const manualItems = details?.manual_review_items || [];
  const blockers = details?.unresolved_required_fields || [];
  const boundarySummary = humanBoundarySummary(snapshot, run);
  const finalBoundaryNote = `${boundarySummary} Use Ready For Final Review after the helper stops. Use Mark Submitted only after you personally submit the live application.`;

  if (!run) {
    return {
      pill: 'Nothing paused yet',
      pillClass: 'pill warning',
      summary: 'There is no live application run yet, so the app has nothing to pause or recover from.',
      steps: [
        'Select a pipeline role.',
        'Start Application Prep to create the packet and checklist.',
        'Then choose browser assist or assistant fill help.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (run.status === 'submitted') {
    return {
      pill: 'Finished',
      pillClass: 'pill success',
      summary: 'This run is already marked submitted, so there is nothing left to recover here.',
      steps: [
        'Wait for recruiter response.',
        'Log any outcome or feedback when it arrives.',
      ],
      footnote: 'You can still review the packet and log if you want to revisit what happened.',
    };
  }

  if (run.status === 'awaiting_final_confirmation') {
    return {
      pill: 'Intentional stop point',
      pillClass: 'pill success',
      summary: 'The app paused on purpose at the final-review boundary. This is the last safe stop before a human submits.',
      steps: [
        'Open the live application and verify every field, attachment, and portal-specific answer manually.',
        'Use Ready For Final Review only when the helper has done everything safe to do.',
        'After you personally click submit in the live form, come back and click Mark Submitted.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (run.status === 'manual_review_required') {
    if (/captcha|verification|sign in|login|required before the application can continue|account|password/.test(nextStepLower)) {
      return {
        pill: 'Human portal step',
        pillClass: 'pill warning',
        summary: nextStep || 'The portal asked for a login, account, or verification step that automation should not try to push through.',
        steps: [
          'Open the live application and clear that login or verification step yourself.',
          'Then either continue manually or use assistant fill help for the remaining safe work.',
          'Return here once the form is back at a normal review state.',
        ],
        footnote: finalBoundaryNote,
      };
    }

    if (manualItems.length) {
      return {
        pill: 'Needs your answer',
        pillClass: 'pill warning',
        summary: nextStep || 'The app stopped at one or more questions it should not answer without you.',
        steps: [
          'Review the manual-review items listed above and answer those in the live application yourself.',
          'Let the helper handle only the safe fields around them.',
          'Then use Ready For Final Review when the safe work is finished.',
        ],
        footnote: finalBoundaryNote,
      };
    }

    if (blockers.length) {
      return {
        pill: 'Missing required answer',
        pillClass: 'pill warning',
        summary: nextStep || 'The app found required fields it could not answer confidently enough to continue.',
        steps: [
          'Open the live application and clear the remaining required fields manually.',
          latestHandoff
            ? 'If you still want help, continue with the prepared assistant package for the safe surrounding fields.'
            : 'If you want extra help, prepare assistant fill help before returning to the live form.',
          'Then come back here and move the run to final review when the form is ready.',
        ],
        footnote: finalBoundaryNote,
      };
    }

    return {
      pill: 'Human checkpoint',
      pillClass: 'pill warning',
      summary: nextStep || 'The app hit a checkpoint that needs a human before it should continue.',
      steps: [
        'Open the live application and review the current step yourself.',
        'Continue manually or switch to assistant fill help if that is easier.',
        'Come back here once the application is ready for final review.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (run.status === 'browser_assist_error') {
    return {
      pill: 'Use the fallback path',
      pillClass: 'pill danger',
      summary: browserSession?.error
        ? `Browser assist hit an issue: ${browserSession.error}`
        : 'Browser assist ran into a portal problem, so the safer next move is assistant fill help or a manual pass.',
      steps: [
        latestHandoff ? 'Use the already prepared assistant package to continue from the live application.' : 'Prepare assistant fill help for this run.',
        'Stop again before final submit.',
        'Then come back here for the final human review step.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (run.status === 'assistant_in_progress') {
    return {
      pill: 'Waiting on assistant',
      pillClass: 'pill accent',
      summary: 'The assistant package is already in progress or ready to use outside the app.',
      steps: [
        'Continue the safe work in your assistant using the latest package.',
        'Refresh the dashboard when the assistant reaches a clear stopping point.',
        'Use Ready For Final Review only after the assistant has stopped and you have checked the live form.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (run.status === 'browser_assist_in_progress') {
    return {
      pill: 'Waiting on browser assist',
      pillClass: 'pill accent',
      summary: nextStep || 'Local browser assist is still working through the safe part of the form.',
      steps: [
        'Watch the browser until it reaches a clear pause or final review stop.',
        'Refresh the dashboard after that checkpoint.',
        'If the browser path feels unreliable, switch to assistant fill help instead.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  if (!browserAssistMeta.available) {
    return {
      pill: 'Assistant path recommended',
      pillClass: 'pill warning',
      summary: 'Local browser assist is unavailable on this computer, so assistant fill help is the simpler recovery path.',
      steps: [
        'Prepare assistant fill help instead of launching browser assist.',
        'Use the packet, checklist, and attached files with your assistant.',
        'Stop again before final submit and come back here for final review.',
      ],
      footnote: finalBoundaryNote,
    };
  }

  return {
    pill: 'Ready to continue',
    pillClass: 'pill accent',
    summary: 'Nothing is blocked right now. The run is waiting for you to choose the next safe helper path.',
    steps: [
      'Launch browser assist if you want the app to handle the easy fields locally.',
      'Or use assistant fill help if you prefer your assistant to guide the live form.',
      'In both cases, stop before final submit and return here for review.',
    ],
    footnote: finalBoundaryNote,
  };
}

function deriveApplicationGuidance({ opportunity, run, browserAssistMeta, latestHandoff }) {
  if (!opportunity) {
    return {
      pill: 'Add a job first',
      pillClass: 'pill warning',
      summary: 'Approve or add a job before the app can guide the application flow.',
      steps: [
        'Add a job in Find Jobs To Review or approve one from the review queue.',
        'Then come back here to prepare the application.',
      ],
      footnote: 'The app will recommend a concrete next move once a job is selected.',
      action: {
        type: 'none',
        label: 'No Job Selected',
        disabled: true,
      },
    };
  }

  const applyUrl = run?.portal?.apply_url || opportunity.application_url || opportunity.source_url || '';
  const hasResume = Boolean(run?.artifacts?.resume);
  const browserAvailable = Boolean(browserAssistMeta?.available);

  if (!run) {
    return {
      pill: 'Start here',
      pillClass: 'pill accent',
      summary: 'Create the application-prep run first so the app can gather safe reusable fields, manual checkpoints, and the live application packet.',
      steps: [
        'Confirm the apply link for this job.',
        'Create the local submission packet and checklist.',
        'Then attach the final resume you want to use.',
      ],
      footnote: 'Nothing gets submitted automatically when you start prep.',
      action: {
        type: 'start_prep',
        label: 'Start Application Prep',
        disabled: false,
      },
    };
  }

  if (!applyUrl) {
    return {
      pill: 'Needs apply link',
      pillClass: 'pill warning',
      summary: 'The app needs the direct application URL before it can launch browser assist or assistant fill help.',
      steps: [
        'Paste the live application URL into the apply-link field above.',
        'Refresh the prep run so the packet uses the correct portal.',
      ],
      footnote: 'Use the direct apply page, not just the listing page if both exist.',
      action: {
        type: 'focus_apply_url',
        label: 'Add The Apply Link',
        disabled: false,
      },
    };
  }

  if (!hasResume) {
    return {
      pill: 'Attach files',
      pillClass: 'pill warning',
      summary: 'Attach the final resume before the app tries to help with the live form.',
      steps: [
        'Upload the final resume you want used for this job.',
        'Optionally attach a cover letter if the role needs one.',
        'Then continue with browser assist or assistant fill help.',
      ],
      footnote: 'The attached files become the source of truth for this application run.',
      action: {
        type: 'focus_resume',
        label: 'Attach Final Resume',
        disabled: false,
      },
    };
  }

  if (run.status === 'submitted') {
    return {
      pill: 'Complete',
      pillClass: 'pill success',
      summary: 'This application is already marked submitted.',
      steps: [
        'Watch for recruiter response.',
        'Log any outcome or feedback when it arrives.',
      ],
      footnote: 'You can still review the packet and logs below if you want to revisit the run.',
      action: {
        type: 'none',
        label: 'Application Complete',
        disabled: true,
      },
    };
  }

  if (run.status === 'awaiting_final_confirmation') {
    return {
      pill: 'Final human review',
      pillClass: 'pill success',
      summary: 'The app has reached the handoff point. Review the live application, submit it yourself, then mark it submitted here.',
      steps: [
        'Open the live application page.',
        'Verify every sensitive answer and attachment manually.',
        'After you actually submit, click Mark Submitted in Other Ways To Continue.',
      ],
      footnote: 'The app never clicks final submit for you.',
      action: {
        type: 'open_live_application',
        label: 'Open Live Application',
        disabled: false,
      },
    };
  }

  if (run.status === 'manual_review_required') {
    return {
      pill: 'Needs your input',
      pillClass: 'pill warning',
      summary: 'The system paused because the live form hit a question or step that still needs a human answer.',
      steps: [
        'Open the live application.',
        'Answer the flagged fields or clear the blocker manually.',
        'Then return here and choose Ready For Final Review when appropriate.',
      ],
      footnote: 'This is expected for authorization, compensation, EEO, login, CAPTCHA, and similar checkpoints.',
      action: {
        type: 'open_live_application',
        label: 'Open Live Application',
        disabled: false,
      },
    };
  }

  if (run.status === 'browser_assist_in_progress') {
    return {
      pill: 'Browser assist running',
      pillClass: 'pill accent',
      summary: 'The local browser-assist path has already been launched. Refresh after it reaches a new stop point or final review.',
      steps: [
        'Check the browser assist status and log below.',
        'Refresh this page after the browser stops at a checkpoint.',
      ],
      footnote: 'If you prefer not to use browser assist, assistant fill help is still available below.',
      action: {
        type: 'refresh_dashboard',
        label: 'Refresh Status',
        disabled: false,
      },
    };
  }

  if (run.status === 'assistant_in_progress') {
    return {
      pill: 'Assistant package ready',
      pillClass: 'pill accent',
      summary: 'Assistant fill help has already been prepared for this application.',
      steps: [
        'Use the assistant package or uploaded bundle outside the app.',
        'Come back here when the assistant reaches the final-review stop point.',
      ],
      footnote: 'Use Ready For Final Review after the assistant has done everything safe to do.',
      action: {
        type: 'refresh_dashboard',
        label: 'Refresh Status',
        disabled: false,
      },
    };
  }

  if (run.status === 'browser_assist_error') {
    return {
      pill: 'Alternate path recommended',
      pillClass: 'pill danger',
      summary: 'Browser assist hit an issue, so the clearest next move is to use assistant fill help instead.',
      steps: [
        'Prepare the application fill-help package.',
        'Use the live packet, checklist, and attached files with your assistant.',
        'Stop before final submit and return here for review.',
      ],
      footnote: latestHandoff
        ? 'You can also continue manually in the live application if you already have enough context.'
        : 'You can still retry browser assist later from Other Ways To Continue.',
      action: {
        type: latestHandoff ? 'open_live_application' : 'queue_assistant_fill_help',
        label: latestHandoff ? 'Open Live Application' : 'Use Assistant Fill Help',
        disabled: false,
      },
    };
  }

  if (browserAvailable) {
    return {
      pill: 'Recommended',
      pillClass: 'pill accent',
      summary: 'Local browser assist is the simplest path from here because it can open the live application and safely prefill the easy fields for you.',
      steps: [
        'Open the live application in local Chrome.',
        'Upload the attached files and fill high-confidence safe fields.',
        'Stop before any sensitive answer or final submit.',
      ],
      footnote: 'If you would rather use your desktop assistant instead, that option is still available below.',
      action: {
        type: 'launch_browser_assist',
        label: 'Use Local Browser Assist',
        disabled: false,
      },
    };
  }

  return {
    pill: 'Recommended',
    pillClass: 'pill accent',
    summary: 'Assistant fill help is the best next path on this machine because local browser assist is not available.',
    steps: [
      'Prepare the application fill-help package.',
      'Use the live packet, checklist, and attached files with your assistant.',
      'Stop at final review and return here before submit.',
    ],
    footnote: 'You can still continue manually in the browser at any point.',
    action: {
      type: 'queue_assistant_fill_help',
      label: 'Use Assistant Fill Help',
      disabled: false,
    },
  };
}

function renderApplicationRuns(snapshot) {
  ensureApplicationOpportunitySelection(snapshot);

  const opportunity = selectedApplicationOpportunity(snapshot);
  const run = selectedApplicationRun(snapshot);
  const latest = latestApplicationHandoff(opportunity?.id || '');
  const runCount = Number(snapshot.applications?.total_runs || 0);
  const startButton = document.getElementById('start-application-run');
  const queueButton = document.getElementById('queue-application-run');
  const readyButton = document.getElementById('ready-for-final-review');
  const submittedButton = document.getElementById('mark-application-submitted');
  const applyUrlInput = document.getElementById('application-apply-url');
  const runPill = document.getElementById('application-run-pill');
  const statusPill = document.getElementById('application-status-pill');
  const handoffPill = document.getElementById('application-handoff-pill');
  const filesPill = document.getElementById('application-files-pill');
  const safePill = document.getElementById('application-safe-pill');
  const manualPill = document.getElementById('application-manual-pill');
  const reviewPill = document.getElementById('application-review-pill');
  const reviewSummary = document.getElementById('application-review-summary');
  const reviewMetrics = document.getElementById('application-review-metrics');
  const reviewAutoPill = document.getElementById('application-review-autofilled-pill');
  const reviewAutoList = document.getElementById('application-review-autofilled');
  const reviewManualPill = document.getElementById('application-review-manual-pill');
  const reviewManualList = document.getElementById('application-review-manual');
  const reviewBlockersPill = document.getElementById('application-review-blockers-pill');
  const reviewBlockersList = document.getElementById('application-review-blockers');
  const previewBrowserAssistLogButton = document.getElementById('preview-browser-assist-log');
  const browserAssistPill = document.getElementById('browser-assist-pill');
  const browserAssistSummary = document.getElementById('browser-assist-summary');
  const browserAssistList = document.getElementById('browser-assist-list');
  const browserAssistButton = document.getElementById('launch-browser-assist');
  const pausePill = document.getElementById('application-pause-pill');
  const pauseSummary = document.getElementById('application-pause-summary');
  const pauseList = document.getElementById('application-pause-list');
  const pauseFootnote = document.getElementById('application-pause-footnote');
  const browserAssistMeta = state.browserAssist || {
    available: false,
    summary: 'Browser assist status unavailable.',
    browser: null,
  };
  const guidancePill = document.getElementById('application-guidance-pill');
  const guidanceSummary = document.getElementById('application-guidance-summary');
  const guidanceList = document.getElementById('application-guidance-list');
  const guidanceFootnote = document.getElementById('application-guidance-footnote');
  const guidanceButton = document.getElementById('application-primary-action');

  runPill.textContent = runCount ? `${runCount} started` : 'Not started';
  runPill.className = runCount ? 'pill accent' : 'pill warning';

  if (!opportunity) {
    state.applicationGuidance = deriveApplicationGuidance({
      opportunity: null,
      run: null,
      browserAssistMeta,
      latestHandoff: null,
    });
    const pauseGuidance = deriveApplicationPauseGuidance({
      snapshot: state.snapshot,
      run: null,
      browserAssistMeta,
      latestHandoff: null,
    });
    startButton.disabled = true;
    queueButton.disabled = true;
    readyButton.disabled = true;
    submittedButton.disabled = true;
    applyUrlInput.value = '';
    statusPill.textContent = 'No jobs yet';
    statusPill.className = 'pill warning';
    handoffPill.textContent = 'Awaiting setup';
    handoffPill.className = 'pill warning';
    filesPill.textContent = '0 attached';
    safePill.textContent = '0 saved';
    manualPill.textContent = '0 manual';
    document.getElementById('application-helper-copy').textContent = 'Approve or add a job in Find Jobs To Review before you start application prep.';
    document.getElementById('application-run-summary-list').innerHTML = '<p class="empty-state">No active pipeline jobs yet.</p>';
    document.getElementById('application-safe-list').innerHTML = '<p class="empty-state">Safe reusable fields will appear here after you start application prep.</p>';
    document.getElementById('application-manual-list').innerHTML = '<p class="empty-state">Manual-review checkpoints will appear here after you start application prep.</p>';
    reviewPill.textContent = 'Awaiting run';
    reviewPill.className = 'pill warning';
    reviewSummary.textContent = 'Start application prep to see a plain-language review summary of what the app handled and what still needs you.';
    reviewMetrics.innerHTML = '';
    reviewAutoPill.textContent = '0';
    reviewManualPill.textContent = '0';
    reviewBlockersPill.textContent = '0';
    reviewAutoList.innerHTML = '<p class="empty-state">Once the app works through a live application, the fields it filled will appear here.</p>';
    reviewManualList.innerHTML = '<p class="empty-state">Any answers that still need your approval will appear here.</p>';
    reviewBlockersList.innerHTML = '<p class="empty-state">Any remaining blockers before submit will appear here.</p>';
    previewBrowserAssistLogButton.disabled = true;
    delete previewBrowserAssistLogButton.dataset.artifactPath;
    document.getElementById('application-files-list').innerHTML = '<p class="empty-state">Attach a final resume and optional cover letter once you have a job selected.</p>';
    browserAssistPill.textContent = 'Unavailable';
    browserAssistPill.className = 'pill warning';
    browserAssistSummary.textContent = browserAssistMeta.summary;
    browserAssistList.innerHTML = '<p class="empty-state">Choose a job and start application prep before you launch browser assist.</p>';
    browserAssistButton.disabled = true;
    guidancePill.textContent = state.applicationGuidance.pill;
    guidancePill.className = state.applicationGuidance.pillClass || 'pill warning';
    guidanceSummary.textContent = state.applicationGuidance.summary;
    guidanceList.innerHTML = renderGuidanceItems(state.applicationGuidance.steps);
    guidanceFootnote.textContent = state.applicationGuidance.footnote;
    guidanceButton.textContent = state.applicationGuidance.action.label;
    guidanceButton.disabled = true;
    guidanceButton.dataset.actionType = state.applicationGuidance.action.type;
    pausePill.textContent = pauseGuidance.pill;
    pausePill.className = pauseGuidance.pillClass;
    pauseSummary.textContent = pauseGuidance.summary;
    pauseList.innerHTML = renderGuidanceItems(pauseGuidance.steps);
    pauseFootnote.textContent = pauseGuidance.footnote;
    document.getElementById('application-handoff-list').innerHTML = '<p class="empty-state">Launch assistant fill help after your application prep run is ready.</p>';
    return;
  }

  const applyUrl = run?.portal?.apply_url || opportunity.application_url || opportunity.source_url || '';
  applyUrlInput.value = applyUrl;

  const statusMeta = applicationStatusMeta(run?.status || 'not_started');
  statusPill.textContent = statusMeta.label;
  statusPill.className = statusMeta.className;
  startButton.textContent = run ? 'Refresh Application Prep' : 'Start Application Prep';

  const attachedFiles = [
    run?.packet_path ? { label: 'Submission packet', value: run.packet_path } : null,
    run?.checklist_path ? { label: 'Checklist', value: run.checklist_path } : null,
    run?.artifacts?.resume ? { label: 'Resume', value: run.artifacts.resume } : { label: 'Resume', value: 'Missing' },
    run?.artifacts?.cover_letter ? { label: 'Cover letter', value: run.artifacts.cover_letter } : { label: 'Cover letter', value: 'Optional / not attached' },
  ].filter(Boolean);

  const safeFields = run?.safe_prefill || [];
  const manualFields = run?.manual_checkpoints || [];
  const browserSession = run?.browser_assist || null;
  const reviewState = renderApplicationReview(run || null);
  const pauseGuidance = deriveApplicationPauseGuidance({
    snapshot: state.snapshot,
    run,
    browserAssistMeta,
    latestHandoff: latest,
  });
  const canLaunchFillHelp = Boolean(run?.portal?.apply_url && run?.artifacts?.resume && run?.status !== 'submitted');

  queueButton.disabled = !canLaunchFillHelp;
  readyButton.disabled = !run || run.status === 'submitted';
  submittedButton.disabled = !run || run.status === 'submitted' || run.status !== 'awaiting_final_confirmation';
  browserAssistButton.disabled = !run || !canLaunchFillHelp || !browserAssistMeta.available;
  filesPill.textContent = `${attachedFiles.filter(file => !['Missing', 'Optional / not attached'].includes(file.value)).length} attached`;
  safePill.textContent = `${safeFields.length} saved`;
  manualPill.textContent = `${manualFields.length} manual`;
  reviewPill.textContent = reviewState.review.label;
  reviewPill.className = pillClassForTone(reviewState.review.tone);
  reviewSummary.textContent = reviewState.review.summary || reviewState.nextStep;
  reviewMetrics.innerHTML = reviewState.metrics.map(metric => `
    <div class="review-metric-card">
      <span>${escapeHtml(metric.label)}</span>
      <strong>${escapeHtml(String(metric.value))}</strong>
      <small>${escapeHtml(metric.note)}</small>
    </div>
  `).join('');
  reviewAutoPill.textContent = `${reviewState.metrics[0]?.value || 0}`;
  reviewAutoPill.className = (reviewState.metrics[0]?.value || 0) ? 'pill success' : 'pill';
  reviewManualPill.textContent = `${reviewState.metrics[1]?.value || 0}`;
  reviewManualPill.className = (reviewState.metrics[1]?.value || 0) ? 'pill warning' : 'pill';
  reviewBlockersPill.textContent = `${reviewState.metrics[2]?.value || 0}`;
  reviewBlockersPill.className = (reviewState.metrics[2]?.value || 0) ? 'pill warning' : 'pill';
  reviewAutoList.innerHTML = reviewState.autoFilledHtml;
  reviewManualList.innerHTML = reviewState.manualHtml;
  reviewBlockersList.innerHTML = reviewState.blockersHtml;
  previewBrowserAssistLogButton.disabled = !browserSession?.output_log;
  if (browserSession?.output_log) {
    previewBrowserAssistLogButton.dataset.artifactPath = browserSession.output_log;
  } else {
    delete previewBrowserAssistLogButton.dataset.artifactPath;
  }

  document.getElementById('application-helper-copy').textContent = run
    ? 'This run tracks the live application. Upload the final files, let your assistant help with browser-fill, then stop for final human review before you submit.'
    : 'Pick a role, confirm the apply link, and start application prep. The app will gather safe answers, manual-review checkpoints, and a browser-fill packet.';

  document.getElementById('application-run-summary-list').innerHTML = [
    `Company: ${opportunity.company}`,
    `Job title: ${opportunity.role}`,
    `Current pipeline stage: ${titleCase(opportunity.phase)}`,
    `Portal: ${titleCase(run?.portal?.type || (opportunity.source_site || 'unknown'))}`,
    `Apply link: ${applyUrl || 'Missing'}`,
    `Location: ${opportunity.location || 'Not listed'}`,
    `Compensation: ${opportunity.compensation || 'Not listed'}`,
    `Next step: ${run?.next_step || 'Start application prep to create a live packet for this role.'}`,
  ].map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');

  document.getElementById('application-safe-list').innerHTML = safeFields.length ? safeFields.map(field => `
    <div class="checklist-item">
      <strong>${escapeHtml(field.label)}:</strong>
      <span>${escapeHtml(field.value)}</span>
    </div>
  `).join('') : '<p class="empty-state">Start the prep run to load reusable safe fields here.</p>';

  document.getElementById('application-manual-list').innerHTML = manualFields.length ? manualFields.map(field => `
    <div class="checklist-item">
      <strong>${escapeHtml(field.label)}</strong>
      <span>${escapeHtml(field.reason)}</span>
    </div>
  `).join('') : '<p class="empty-state">No manual checkpoints loaded yet.</p>';

  document.getElementById('application-files-list').innerHTML = attachedFiles.map(file => `
    <div class="source-card">
      <strong>${escapeHtml(file.label)}</strong>
      <small>${escapeHtml(file.value)}</small>
    </div>
  `).join('');

  if (!browserAssistMeta.available) {
    browserAssistPill.textContent = 'Unavailable';
    browserAssistPill.className = 'pill warning';
    browserAssistSummary.textContent = browserAssistMeta.summary;
    browserAssistList.innerHTML = '<p class="empty-state">Browser assist needs a supported local browser. Assistant fill help is still available below.</p>';
  } else {
    browserAssistPill.textContent = browserSession ? titleCase(browserSession.status || 'ready') : 'Ready';
    browserAssistPill.className = browserSession?.status === 'launch_failed'
      ? 'pill danger'
      : browserSession
        ? 'pill accent'
        : 'pill success';
    browserAssistSummary.textContent = browserSession?.next_step || browserAssistMeta.summary;
    browserAssistList.innerHTML = browserSession ? [
      browserSession.browser?.name ? `Browser: ${browserSession.browser.name}` : '',
      browserSession.output_session ? `Session file: ${browserSession.output_session}` : '',
      browserSession.output_log ? `Log file: ${browserSession.output_log}` : '',
      `Auto-filled fields: ${browserSession.auto_filled_count || 0}`,
      `Manual review items: ${browserSession.manual_review_count || 0}`,
      browserSession.error ? `Latest error: ${browserSession.error}` : '',
    ].filter(Boolean).map(item => `
      <div class="checklist-item">
        <strong>${escapeHtml(item)}</strong>
      </div>
    `).join('') : `
      <div class="checklist-item">
        <strong>Local browser assist will open ${escapeHtml(browserAssistMeta.browser?.name || 'your supported browser')}.</strong>
      </div>
      <div class="checklist-item">
        <strong>It uploads your final files and fills only high-confidence safe fields.</strong>
      </div>
      <div class="checklist-item">
        <strong>It stops for sensitive answers and before final submit.</strong>
      </div>
    `;
  }

  state.applicationGuidance = deriveApplicationGuidance({
    opportunity,
    run,
    browserAssistMeta,
    latestHandoff: latest,
  });
  guidancePill.textContent = state.applicationGuidance.pill;
  guidancePill.className = state.applicationGuidance.pillClass
    || (state.applicationGuidance.action.type === 'none' ? 'pill success' : 'pill accent');
  guidanceSummary.textContent = state.applicationGuidance.summary;
  guidanceList.innerHTML = renderGuidanceItems(state.applicationGuidance.steps);
  guidanceFootnote.textContent = state.applicationGuidance.footnote;
  guidanceButton.textContent = state.applicationGuidance.action.label;
  guidanceButton.disabled = Boolean(state.applicationGuidance.action.disabled);
  guidanceButton.dataset.actionType = state.applicationGuidance.action.type;
  pausePill.textContent = pauseGuidance.pill;
  pausePill.className = pauseGuidance.pillClass;
  pauseSummary.textContent = pauseGuidance.summary;
  pauseList.innerHTML = renderGuidanceItems(pauseGuidance.steps);
  pauseFootnote.textContent = pauseGuidance.footnote;

  if (!latest) {
    handoffPill.textContent = 'Not prepared';
    handoffPill.className = 'pill warning';
    document.getElementById('application-handoff-list').innerHTML = run
      ? '<p class="empty-state">Prepare assistant fill help after your final resume is attached and the apply link is confirmed. The package will tell your assistant to stop before sensitive answers and final submit.</p>'
      : '<p class="empty-state">Start application prep first so the app can build the submission packet and checklist.</p>';
    return;
  }

  handoffPill.textContent = `${titleCase(latest.status)} · ${latest.adapter_title}`;
  handoffPill.className = 'pill success';
  document.getElementById('application-handoff-list').innerHTML = [
    `Package folder: ${latest.absolute_bundle_dir}`,
    `Prompt file: ${latest.absolute_prompt_file}`,
    `Next step: ${latest.next_user_action}`,
    ...(latest.launch_notes || []),
  ].map(item => `
    <div class="checklist-item">
      <strong>${escapeHtml(item)}</strong>
    </div>
  `).join('');
}

function renderBridge() {
  const bridge = state.bridge;
  if (!bridge) return;

  const adapter = (bridge.adapters || []).find(item => item.id === state.agentMode) || bridge.adapters?.[0];
  const taskHandoffs = generalTaskHandoffs();
  const latest = taskHandoffs[0] || null;
  const opportunity = selectedOpportunity(state.snapshot);
  const pack = opportunity && state.taskPack?.opportunity?.id === opportunity.id ? state.taskPack : null;
  const handoffGuidance = deriveHandoffGuidance({
    snapshot: state.snapshot,
    opportunity,
    pack,
    latest,
    agentSetup: state.agentSetup,
  });
  const queueButton = document.getElementById('queue-task-handoff');
  const copyPathButton = document.getElementById('copy-handoff-path');
  const copyNotesButton = document.getElementById('copy-handoff-notes');
  const copyMessageButton = document.getElementById('copy-handoff-message');
  const copyRecoveryButton = document.getElementById('copy-handoff-recovery');
  const bridgePill = document.getElementById('bridge-pill');
  const bridgeQueuePill = document.getElementById('bridge-queue-pill');

  bridgePill.textContent = `${taskHandoffs.length} queued`;
  bridgePill.className = taskHandoffs.length ? 'pill success' : 'pill warning';
  bridgeQueuePill.textContent = `${taskHandoffs.length} recent`;
  bridgeQueuePill.className = taskHandoffs.length ? 'pill accent' : 'pill warning';

  document.getElementById('bridge-summary').textContent = state.taskPack
    ? `${state.agentSetup?.assistant?.title || 'Your assistant'} will use ${adapter?.transport?.toLowerCase() || 'a local package'} here. Prepare the package when the job summary and message look right.`
    : `${state.agentSetup?.assistant?.title || 'Your assistant'} will use ${adapter?.transport?.toLowerCase() || 'a local package'} here. Generate a task first, then prepare the package.`;

  queueButton.disabled = !state.taskPack;
  copyPathButton.disabled = !latest;
  copyNotesButton.disabled = !latest;
  copyMessageButton.disabled = !latest;
  copyRecoveryButton.disabled = !latest;

  const summaryList = document.getElementById('handoff-summary-list');
  const uploadList = document.getElementById('handoff-upload-list');
  const messageBox = document.getElementById('handoff-message');
  const notesList = document.getElementById('handoff-notes-list');
  const queueList = document.getElementById('bridge-queue-list');
  const statusPill = document.getElementById('handoff-status-pill');
  const guidancePill = document.getElementById('handoff-guidance-pill');
  const guidanceSummary = document.getElementById('handoff-guidance-summary');
  const guidanceList = document.getElementById('handoff-guidance-list');
  const recoveryBox = document.getElementById('handoff-recovery-message');
  const guidanceFootnote = document.getElementById('handoff-guidance-footnote');

  if (!latest) {
    statusPill.textContent = 'Awaiting handoff';
    statusPill.className = 'pill warning';
    summaryList.innerHTML = '<p class="empty-state">No assistant package has been prepared yet. Generate a task and then prepare the package here.</p>';
    uploadList.innerHTML = '<p class="empty-state">When a package is ready, this section will show the exact files to upload or reference.</p>';
    messageBox.value = 'Prepare a package to load the exact message you can paste into your assistant.';
    recoveryBox.value = handoffRecoveryMessage(null);
    notesList.innerHTML = '<p class="empty-state">Simple next-step instructions will appear here once a package is ready.</p>';
  } else {
    statusPill.textContent = `${titleCase(latest.status)} · ${latest.adapter_title}`;
    statusPill.className = 'pill success';
    summaryList.innerHTML = [
      `Task: ${latest.task_title}`,
      latest.assistant_title ? `Assistant: ${latest.assistant_title}` : '',
      `Role: ${latest.opportunity_label}`,
      `Package folder: ${latest.absolute_bundle_dir}`,
      `Message file: ${latest.absolute_prompt_file}`,
      latest.upload_count
        ? `Prepared uploads: ${latest.upload_count} file${latest.upload_count === 1 ? '' : 's'}`
        : 'Prepared uploads: This package references the local workspace directly',
      `Next step: ${latest.next_user_action}`,
    ].filter(Boolean).map(item => `
      <div class="checklist-item">
        <strong>${escapeHtml(item)}</strong>
      </div>
    `).join('');
    uploadList.innerHTML = latest.upload_count
      ? (latest.upload_files || []).map(file => `
        <div class="checklist-item">
          <strong>${escapeHtml(file.bundle_relative_path)}</strong>
          <span>${escapeHtml(file.source_relative_path)}</span>
        </div>
      `).join('')
      : `<div class="checklist-item">
          <strong>No uploads required.</strong>
          <span>${escapeHtml(latest.assistant_title || latest.adapter_title)} can work from the local workspace directly.</span>
        </div>`;
    messageBox.value = latest.prompt_text || 'The package message is not available yet.';
    recoveryBox.value = handoffRecoveryMessage(latest);
    notesList.innerHTML = (latest.launch_notes || []).map(note => `
      <div class="checklist-item">
        <strong>${escapeHtml(note)}</strong>
      </div>
    `).join('');
  }

  queueList.innerHTML = taskHandoffs.length ? taskHandoffs.map(handoff => `
    <div class="source-card">
      <strong>${escapeHtml(handoff.task_title)}</strong>
      <span>${escapeHtml(handoff.assistant_title || handoff.adapter_title)}</span>
      <small>${escapeHtml(handoff.opportunity_label)}</small>
      <small>${escapeHtml(formatTimestamp(handoff.created_at))}</small>
    </div>
  `).join('') : '<p class="empty-state">No queued handoffs yet.</p>';

  guidancePill.textContent = handoffGuidance.pill;
  guidancePill.className = handoffGuidance.pillClass;
  guidanceSummary.textContent = handoffGuidance.summary;
  guidanceList.innerHTML = renderGuidanceItems(handoffGuidance.steps);
  guidanceFootnote.textContent = handoffGuidance.footnote;
}

function renderOnboarding(snapshot) {
  document.getElementById('candidate-name').textContent = snapshot.meta.candidate_name;
  document.getElementById('candidate-headline').textContent = snapshot.meta.headline || '';
  document.getElementById('workspace-path-pill').textContent = state.desktop.available ? 'Stored in your desktop app workspace' : 'Stored in your local workspace';
  document.getElementById('onboarding-count').textContent = `${snapshot.onboarding.completed}/${snapshot.onboarding.total} core modules`;
  document.getElementById('pipeline-total').textContent = `${snapshot.pipeline.total} jobs`;
  document.getElementById('human-gate-count').textContent = `${snapshot.human_gates.length} fields`;
  document.getElementById('feedback-count').textContent = `${snapshot.feedback.event_count} events`;

  document.getElementById('onboarding-grid').innerHTML = snapshot.onboarding.modules.map(module => `
    <div class="module-card">
      <div class="module-top">
        <h3>${escapeHtml(displayModuleTitle(module.key, module.title))}</h3>
        <span class="${badgeClass(module.status)}">${titleCase(module.status)}</span>
      </div>
      <p>${escapeHtml(module.details)}</p>
      <small>${escapeHtml(module.next_step)}</small>
    </div>
  `).join('');

  document.getElementById('phase-list').innerHTML = Object.entries(snapshot.pipeline.phase_counts).map(([phase, count]) => `
    <div class="stat-row">
      <span>${titleCase(phase)}</span>
      <strong>${count}</strong>
    </div>
  `).join('');

  document.getElementById('opportunity-list').innerHTML = snapshot.pipeline.top_opportunities.length ? snapshot.pipeline.top_opportunities.map(opportunity => `
    <article class="opportunity-card">
      <div class="opportunity-top">
        <h3>${escapeHtml(opportunity.company)}</h3>
        <span class="pill accent">${escapeHtml(opportunity.priority_score)}</span>
      </div>
      <p class="role">${escapeHtml(opportunity.role)}</p>
      <p class="meta">${titleCase(opportunity.phase)} · ${titleCase(opportunity.recommendation)} · ${escapeHtml(opportunity.strategy?.lane || 'No target path yet')}</p>
      <p class="next-step">${escapeHtml(opportunity.next_step)}</p>
    </article>
  `).join('') : '<p class="empty-state">No opportunities loaded yet.</p>';

  document.getElementById('human-gate-list').innerHTML = snapshot.human_gates.length ? snapshot.human_gates.map(gate => `
    <span class="gate-chip">${titleCase(gate)}</span>
  `).join('') : '<p class="empty-state">No human-gated fields configured yet.</p>';

  document.getElementById('feedback-list').innerHTML = Object.entries(snapshot.feedback.counts_by_type).map(([type, count]) => `
    <div class="stat-row">
      <span>${titleCase(type)}</span>
      <strong>${count}</strong>
    </div>
  `).join('') || '<p class="empty-state">No feedback signals logged yet.</p>';
}

function renderActivity() {
  const activityLog = document.getElementById('activity-log');
  if (!activityLog) return;

  activityLog.innerHTML = state.activity.length ? state.activity.map(entry => `
    <div class="activity-entry ${entry.tone}">
      <strong>${escapeHtml(entry.message)}</strong>
      <small>${escapeHtml(formatTimestamp(entry.createdAt))}</small>
    </div>
  `).join('') : '<p class="empty-state">No activity yet. Import a source, run a search, or generate a draft to get started.</p>';
}

function renderLegalInfo() {
  const legal = state.legalInfo;
  if (!legal) return;

  document.getElementById('legal-license').textContent = legal.license_id;
  document.getElementById('legal-source-message').textContent = legal.source_access_message;
  document.getElementById('legal-warranty').textContent = legal.warranty_notice;

  const sourceLink = document.getElementById('legal-source-link');
  sourceLink.href = legal.source_url || legal.legal_paths.readme;
  sourceLink.textContent = legal.source_url ? 'Source Code' : 'Source Info';
}

function render() {
  if (!state.snapshot || !state.doctor || !state.agentSetup || !state.bridge || !state.browserAssist || !state.legalInfo) return;
  ensureLayoutState(state.snapshot);
  renderDesktopShell();
  renderWizard(state.snapshot);
  renderHealth();
  renderViewTabs(state.snapshot);
  renderViewContext(state.snapshot);
  renderSourceLists(state.snapshot);
  renderSettings(state.snapshot);
  renderSourcing(state.snapshot);
  renderArtifacts(state.snapshot);
  renderAgentSetup();
  renderTaskPack(state.snapshot);
  renderApplicationRuns(state.snapshot);
  renderBridge();
  renderOnboarding(state.snapshot);
  renderActivity();
  renderLegalInfo();
  renderLayoutState();
}

async function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const [, base64] = String(reader.result || '').split(',', 2);
      resolve(base64 || '');
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed.'));
    reader.readAsDataURL(file);
  });
}

function collectOutputPaths(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach(item => collectOutputPaths(item, output));
    return output;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('output') && typeof nested === 'string') {
      output.push(nested);
    } else {
      collectOutputPaths(nested, output);
    }
  }
  return output;
}

function textareaLines(elementId) {
  return String(document.getElementById(elementId).value || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function parseKeyValueTextarea(elementId) {
  const lines = textareaLines(elementId);
  const output = {};

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) {
      throw new Error(`Each safe-answer line must include a ":" separator. Invalid line: ${line}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    if (!key || !value) {
      throw new Error(`Each safe-answer line needs both a key and a value. Invalid line: ${line}`);
    }
    output[key] = value;
  }

  return output;
}

async function previewArtifact(relativePath) {
  const payload = await fetchJson(`/api/artifact?path=${encodeURIComponent(relativePath)}`);
  state.artifactPreview = {
    path: payload.artifact.relative_path,
    title: payload.artifact.title,
    content: payload.content,
  };
  renderArtifacts(state.snapshot);
}

async function previewBrowserAssistLog() {
  const button = document.getElementById('preview-browser-assist-log');
  const relativePath = button?.dataset.artifactPath || '';
  if (!relativePath) return;
  await previewArtifact(relativePath);
  activateView('workspace', {
    panelId: 'workspace-details-panel',
    scroll: true,
  });
  setStatus('Opened the browser assist log in Workspace.', 'success');
}

async function reloadDerivedState() {
  const [doctor, agentSetup, bridge, browserAssist] = await Promise.all([
    fetchJson('/api/doctor'),
    fetchJson(agentSetupUrl()),
    fetchJson('/api/agent-bridge'),
    fetchJson('/api/browser-assist'),
  ]);
  state.doctor = doctor;
  state.agentSetup = agentSetup;
  state.assistantId = agentSetup.assistant.id;
  state.agentMode = agentSetup.mode;
  state.bridge = bridge;
  state.browserAssist = browserAssist;
}

async function performAction(path, payload, successMessage) {
  setBusy(true, 'Working in your local workspace...');
  try {
    const result = await fetchJson(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
    state.snapshot = result.snapshot;
    if (result.bridge) {
      state.bridge = result.bridge;
    }
    await reloadDerivedState();
    render();
    setStatus(successMessage, 'success');
    addActivity(successMessage, 'success');

    const outputs = collectOutputPaths(result.result);
    if (outputs.length) {
      const preferred = outputs.find(output => output.endsWith('.md')) || outputs[0];
      await previewArtifact(preferred);
    }

    return result;
  } catch (error) {
    setStatus(error.message, 'error');
    addActivity(error.message, 'error');
    throw error;
  } finally {
    setBusy(false);
  }
}

async function handleCareerImport(event) {
  event.preventDefault();
  const file = document.getElementById('career-file').files[0];
  const text = document.getElementById('career-text').value.trim();
  if (!file && !text) {
    setStatus('Add a file or paste text before importing a career source.', 'error');
    return;
  }

  const payload = {
    kind: document.getElementById('career-kind').value,
    label: document.getElementById('career-label').value.trim(),
    filename: file?.name || `${document.getElementById('career-label').value.trim() || 'career-import'}.md`,
    content_base64: file ? await readFileAsBase64(file) : '',
    text: file ? '' : text,
  };

  await performAction('/api/actions/import-career-source', payload, 'Background material added.');
  document.getElementById('career-import-form').reset();
}

async function handleWritingImport(event) {
  event.preventDefault();
  const file = document.getElementById('writing-file').files[0];
  const text = document.getElementById('writing-text').value.trim();
  if (!file && !text) {
    setStatus('Add a file or paste text before importing a writing sample.', 'error');
    return;
  }

  const payload = {
    label: document.getElementById('writing-label').value.trim(),
    filename: file?.name || `${document.getElementById('writing-label').value.trim() || 'writing-sample'}.md`,
    content_base64: file ? await readFileAsBase64(file) : '',
    text: file ? '' : text,
  };

  await performAction('/api/actions/import-writing-sample', payload, 'Writing sample added.');
  document.getElementById('writing-import-form').reset();
}

async function handleSourcingImport(event) {
  event.preventDefault();
  const file = document.getElementById('sourcing-file').files[0];
  const text = document.getElementById('sourcing-text').value.trim();
  if (!file && !text) {
    setStatus('Add a file or paste search results before importing them.', 'error');
    return;
  }

  const payload = {
    source_label: document.getElementById('sourcing-label').value.trim(),
    source_url: document.getElementById('sourcing-source-url').value.trim(),
    filename: file?.name || `${document.getElementById('sourcing-label').value.trim() || 'search-results'}.md`,
    content_base64: file ? await readFileAsBase64(file) : '',
    text: file ? '' : text,
  };

  await performAction('/api/actions/source-opportunities', payload, 'Search results imported into your review queue.');
  document.getElementById('sourcing-import-form').reset();
}

async function handleSearchStrategySave(event) {
  event.preventDefault();
  await performAction('/api/actions/save-search-strategy', {
    lanes: textareaLines('strategy-lanes'),
    geography: {
      preferred: textareaLines('strategy-preferred-locations'),
      acceptable: textareaLines('strategy-acceptable-locations'),
      blocked: textareaLines('strategy-blocked-locations'),
    },
    work_mode_preferences: textareaLines('strategy-work-modes'),
    compensation: {
      target_base_usd: Number(document.getElementById('strategy-target-base').value || 0),
      exception_floor_usd: Number(document.getElementById('strategy-exception-floor').value || 0),
    },
    step_down_logic: textareaLines('strategy-step-down'),
  }, 'Job targets saved.');
}

async function handleApplicationProfileSave(event) {
  event.preventDefault();
  await performAction('/api/actions/save-application-profile', {
    contact: {
      email: document.getElementById('profile-email').value.trim(),
      phone: document.getElementById('profile-phone').value.trim(),
      linkedin_url: document.getElementById('profile-linkedin').value.trim(),
      portfolio_url: document.getElementById('profile-portfolio').value.trim(),
    },
    safe_answers: parseKeyValueTextarea('profile-safe-answers'),
    human_gated_fields: textareaLines('profile-human-gates'),
  }, 'Reusable application details saved.');
}

async function handleOpportunityAdd(event) {
  event.preventDefault();
  const company = document.getElementById('opportunity-company').value.trim();
  const role = document.getElementById('opportunity-role').value.trim();
  await performAction('/api/actions/add-opportunity', {
    company,
    role,
    application_url: document.getElementById('opportunity-apply-url').value.trim(),
    location: document.getElementById('opportunity-location').value.trim(),
    compensation: document.getElementById('opportunity-compensation').value.trim(),
    source_site: document.getElementById('opportunity-source-site').value.trim(),
    phase: document.getElementById('opportunity-phase').value,
    human_gate: document.getElementById('opportunity-human-gate').checked,
    next_step: document.getElementById('opportunity-next-step').value.trim(),
    strategy: {
      lane: document.getElementById('opportunity-lane').value,
      company_stage: document.getElementById('opportunity-company-stage').value,
      work_mode: document.getElementById('opportunity-work-mode').value,
    },
    score: {
      capability_fit: Number(document.getElementById('score-capability-fit').value || 0),
      screen_odds: Number(document.getElementById('score-screen-odds').value || 0),
      upside: Number(document.getElementById('score-upside').value || 0),
      compensation: Number(document.getElementById('score-compensation').value || 0),
      logistics: Number(document.getElementById('score-logistics').value || 0),
    },
  }, 'Job added to your list.');

  const addedOpportunity = pipelineOpportunities(state.snapshot).find(opportunity => opportunity.company === company && opportunity.role === role);
  if (addedOpportunity) {
    selectJobsRecord('pipeline', addedOpportunity.id, { filter: 'pipeline' });
  }

  document.getElementById('opportunity-form').reset();
  renderSettings(state.snapshot);
  render();
}

async function handleStartApplicationRun() {
  const opportunity = selectedApplicationOpportunity();
  if (!opportunity) {
    setStatus('Choose a job before starting application prep.', 'error');
    return;
  }

  await performAction('/api/actions/start-application-run', {
    opportunity_id: opportunity.id,
    apply_url: document.getElementById('application-apply-url').value.trim(),
    listing_url: opportunity.source_url || '',
  }, `Application prep started for ${opportunity.company}.`);
  renderApplicationRuns(state.snapshot);
}

async function handleApplicationArtifactUpload(event, artifactKind, inputId, successMessage) {
  event.preventDefault();
  const run = selectedApplicationRun();
  if (!run) {
    setStatus('Start application prep first so there is a run to attach files to.', 'error');
    return;
  }

  const file = document.getElementById(inputId).files[0];
  if (!file) {
    setStatus('Choose a file before uploading it.', 'error');
    return;
  }

  await performAction('/api/actions/upload-application-artifact', {
    run_id: run.id,
    artifact_kind: artifactKind,
    filename: file.name,
    content_base64: await readFileAsBase64(file),
  }, successMessage);

  event.currentTarget.reset();
  renderApplicationRuns(state.snapshot);
}

async function queueApplicationRunHandoff() {
  const run = selectedApplicationRun();
  if (!run) {
    setStatus('Start application prep first before launching assistant fill help.', 'error');
    return;
  }

  await performAction('/api/actions/queue-application-run', {
    run_id: run.id,
    assistant_id: state.assistantId,
    adapter: state.agentMode,
  }, `Assistant fill help prepared for ${run.company}.`);
  renderApplicationRuns(state.snapshot);
}

async function markApplicationReadyForFinalReview() {
  const run = selectedApplicationRun();
  if (!run) {
    setStatus('Start application prep first before updating the review state.', 'error');
    return;
  }

  await performAction('/api/actions/set-application-run-status', {
    run_id: run.id,
    status: 'awaiting_final_confirmation',
    next_step: 'Do the final human review, verify every sensitive field, then submit when ready.',
  }, `Application for ${run.company} is ready for final review.`);
  renderApplicationRuns(state.snapshot);
}

async function handleMarkApplicationSubmitted() {
  const run = selectedApplicationRun();
  if (!run) {
    setStatus('Start application prep first before marking anything submitted.', 'error');
    return;
  }

  await performAction('/api/actions/mark-application-submitted', {
    run_id: run.id,
  }, `Marked ${run.company} as submitted.`);
  renderApplicationRuns(state.snapshot);
}

async function launchBrowserAssist() {
  const run = selectedApplicationRun();
  if (!run) {
    setStatus('Start application prep first before launching browser assist.', 'error');
    return;
  }

  await performAction('/api/actions/start-browser-assist', {
    run_id: run.id,
  }, `Browser assist launched for ${run.company}. Refresh after it reaches a new step or final review.`);
  renderApplicationRuns(state.snapshot);
}

function focusApplyUrlField() {
  const input = document.getElementById('application-apply-url');
  scrollToPanel('application-run-panel');
  input?.focus();
  input?.select?.();
}

function focusResumeUpload() {
  const input = document.getElementById('application-resume-file');
  scrollToPanel('application-run-panel');
  input?.focus();
}

function openLiveApplication() {
  const run = selectedApplicationRun();
  const opportunity = selectedApplicationOpportunity();
  const target = run?.portal?.apply_url || opportunity?.application_url || opportunity?.source_url || '';
  if (!target) {
    setStatus('Add the live application URL first.', 'error');
    return;
  }
  window.open(target, '_blank', 'noopener,noreferrer');
  setStatus('Opened the live application in a new tab.', 'success');
  addActivity('Opened the live application for manual review.', 'success');
}

async function runRecommendedApplicationAction() {
  const actionType = state.applicationGuidance?.action?.type || 'none';

  if (actionType === 'start_prep') {
    await handleStartApplicationRun();
    return;
  }

  if (actionType === 'focus_apply_url') {
    focusApplyUrlField();
    return;
  }

  if (actionType === 'focus_resume') {
    focusResumeUpload();
    return;
  }

  if (actionType === 'launch_browser_assist') {
    await launchBrowserAssist();
    return;
  }

  if (actionType === 'queue_assistant_fill_help') {
    await queueApplicationRunHandoff();
    return;
  }

  if (actionType === 'refresh_dashboard') {
    await loadDashboard();
    setStatus('Application status refreshed.', 'success');
    addActivity('Refreshed the application flow status.', 'success');
    return;
  }

  if (actionType === 'open_live_application') {
    openLiveApplication();
    return;
  }
}

async function queueSourcingRun() {
  await performAction('/api/actions/queue-sourcing-run', {
    assistant_id: state.assistantId,
    adapter: state.agentMode,
  }, 'Search package prepared for your assistant.');
  renderSourcing(state.snapshot);
}

async function approveSourcingCandidate(candidateId) {
  const candidate = pendingCandidates(state.snapshot).find(item => item.id === candidateId) || null;
  await performAction('/api/actions/approve-sourced-candidate', {
    candidate_id: candidateId,
  }, 'Role approved into your active pipeline.');

  if (candidate) {
    const approvedOpportunity = pipelineOpportunities(state.snapshot).find(opportunity => opportunity.company === candidate.company && opportunity.role === candidate.role);
    if (approvedOpportunity) {
      selectJobsRecord('pipeline', approvedOpportunity.id, { filter: 'pipeline' });
      render();
    }
  }
}

async function dismissSourcingCandidate(candidateId) {
  await performAction('/api/actions/dismiss-sourced-candidate', {
    candidate_id: candidateId,
  }, 'Role dismissed from the search queue.');
  render();
}

async function refreshAgentSetup() {
  state.assistantId = document.getElementById('assistant-id').value;
  state.agentMode = document.getElementById('agent-mode').value;
  state.agentSetup = await fetchJson(agentSetupUrl());
  state.assistantId = state.agentSetup.assistant.id;
  state.agentMode = state.agentSetup.mode;

  if (state.taskPack?.task_type && state.taskPack?.opportunity?.id) {
    const refreshed = await fetchJson('/api/actions/build-task-pack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task_type: state.taskPack.task_type,
        opportunity_id: state.taskPack.opportunity.id,
        mode: state.agentMode,
      }),
    });
    state.snapshot = refreshed.snapshot;
    state.taskPack = refreshed.result;
    await reloadDerivedState();
  }

  render();
}

async function copyAgentPrompt() {
  try {
    await navigator.clipboard.writeText(document.getElementById('agent-prompt').value);
    setStatus('Agent brief copied to your clipboard.', 'success');
    addActivity('Copied the current agent brief.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the text manually.', 'error');
  }
}

async function copyTaskPrompt() {
  try {
    await navigator.clipboard.writeText(document.getElementById('task-prompt').value);
    setStatus('Task brief copied to your clipboard.', 'success');
    addActivity('Copied the current task brief.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the text manually.', 'error');
  }
}

function latestHandoff() {
  return generalTaskHandoffs()[0] || null;
}

function handoffRecoveryMessage(handoff) {
  if (!handoff) {
    return 'Prepare a package first. Then this box will show a recovery message you can paste into your assistant if it drifts from the task.';
  }

  const base = [
    'Please ignore any earlier assumptions and use only the files from the Job Hunter OS package plus the pasted instructions.',
    'If anything is missing, ask me for the exact file or answer you still need instead of guessing.',
  ];

  if (handoff.task_type === 'source_opportunities') {
    return [
      ...base,
      'Return results as either a structured YAML queue matching the included template or a clean markdown table with one job per row.',
      'Do not give me only a summary paragraph. I need structured results I can review or import.',
    ].join('\n');
  }

  if (handoff.task_type === 'application_fill_help') {
    return [
      ...base,
      'Use the uploaded packet and attachments to help with the live application, but stop on login walls, legal questions, EEO questions, work authorization, compensation, and final submit.',
      'If you reach one of those boundaries, tell me exactly what needs my manual review next.',
    ].join('\n');
  }

  return [
    ...base,
    'Follow the packaged checklist exactly and keep all sensitive answers and submissions under human approval.',
    'If the package is missing something, tell me the specific gap before you continue.',
  ].join('\n');
}

async function copyLatestHandoffPath() {
  const handoff = latestHandoff();
  if (!handoff) {
    setStatus('Prepare a handoff first so there is a bundle path to copy.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(handoff.absolute_bundle_dir);
    setStatus('Handoff bundle path copied to your clipboard.', 'success');
    addActivity('Copied the latest handoff bundle path.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the path manually.', 'error');
  }
}

async function copyLatestHandoffNotes() {
  const handoff = latestHandoff();
  if (!handoff) {
    setStatus('Prepare a handoff first so there are launch notes to copy.', 'error');
    return;
  }

  const payload = [
    `Task: ${handoff.task_title}`,
    handoff.assistant_title ? `Assistant: ${handoff.assistant_title}` : '',
    `Role: ${handoff.opportunity_label}`,
    `Package folder: ${handoff.absolute_bundle_dir}`,
    `Message file: ${handoff.absolute_prompt_file}`,
    '',
    ...(handoff.launch_notes || []),
  ].filter(Boolean).join('\n');

  try {
    await navigator.clipboard.writeText(payload);
    setStatus('Launch notes copied to your clipboard.', 'success');
    addActivity('Copied launch notes for the latest handoff.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the notes manually.', 'error');
  }
}

async function copyLatestHandoffMessage() {
  const handoff = latestHandoff();
  if (!handoff) {
    setStatus('Prepare a handoff first so there is a message to copy.', 'error');
    return;
  }

  if (!handoff.prompt_text) {
    setStatus('The handoff message is not available yet. Try preparing the package again.', 'error');
    return;
  }

  try {
    await navigator.clipboard.writeText(handoff.prompt_text);
    setStatus('Assistant message copied to your clipboard.', 'success');
    addActivity('Copied the latest assistant message.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the message manually.', 'error');
  }
}

async function copyLatestHandoffRecovery() {
  const handoff = latestHandoff();
  const payload = handoffRecoveryMessage(handoff);

  try {
    await navigator.clipboard.writeText(payload);
    setStatus('Recovery message copied to your clipboard.', 'success');
    addActivity('Copied the assistant recovery message.', 'success');
  } catch (error) {
    setStatus('Clipboard copy failed. You can still copy the recovery message manually.', 'error');
  }
}

function scrollToPanel(panelId) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const viewId = viewForPanel(panelId);
  activateView(viewId, {
    panelId,
    scroll: true,
  });
  if (panel.tagName === 'DETAILS') {
    panel.open = true;
  }
}

async function buildTaskPack(taskType) {
  const opportunity = selectedOpportunity();
  if (!opportunity) {
    setStatus('Select a pipeline role before generating assistant help for it.', 'error');
    return;
  }

  const result = await performAction('/api/actions/build-task-pack', {
    task_type: taskType,
    opportunity_id: opportunity.id,
    mode: state.agentMode,
  }, `${TASK_TYPES[taskType]} task packaged for ${opportunity.company}.`);

  state.taskPack = result.result;
  renderTaskPack(state.snapshot);
}

async function queueTaskHandoff() {
  if (!state.taskPack?.task_type || !state.taskPack?.opportunity?.id) {
    setStatus('Generate a task pack first before preparing a handoff.', 'error');
    return;
  }

  const opportunity = state.taskPack.opportunity;
  await performAction('/api/actions/queue-agent-task', {
    task_type: state.taskPack.task_type,
    opportunity_id: opportunity.id,
    assistant_id: state.assistantId,
    adapter: state.agentMode,
  }, `Agent handoff prepared for ${opportunity.company}.`);
  renderBridge();
}

async function openDesktopWorkspace() {
  if (!state.desktop.available) return;

  try {
    const result = await globalThis.jobHunterDesktop.openWorkspace();
    if (result?.ok) {
      setStatus('Opened the local workspace folder.', 'success');
      addActivity('Opened the local workspace folder from the desktop app.', 'success');
    } else {
      setStatus('Could not open the workspace folder automatically.', 'error');
    }
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function resetDesktopWorkspace() {
  if (!state.desktop.available) return;

  setBusy(true, 'Resetting the local workspace...');
  try {
    const result = await globalThis.jobHunterDesktop.resetWorkspace();
    if (result?.cancelled) {
      setStatus('Workspace reset cancelled.', 'neutral');
      return;
    }

    await loadDashboard();
    setStatus('Workspace reset to a fresh starter setup.', 'success');
    addActivity('Reset the desktop workspace to a fresh starter template.', 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function registerEvents() {
  document.querySelectorAll('.view-tab').forEach(button => {
    button.addEventListener('click', event => {
      const viewId = event.currentTarget.dataset.viewTarget;
      if (!viewId) return;
      activateView(viewId, { scroll: true });
    });
  });

  document.getElementById('career-import-form').addEventListener('submit', event => {
    handleCareerImport(event).catch(() => {});
  });

  document.getElementById('writing-import-form').addEventListener('submit', event => {
    handleWritingImport(event).catch(() => {});
  });

  document.getElementById('sourcing-import-form').addEventListener('submit', event => {
    handleSourcingImport(event).catch(() => {});
  });

  document.getElementById('search-strategy-form').addEventListener('submit', event => {
    handleSearchStrategySave(event).catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('application-profile-form').addEventListener('submit', event => {
    handleApplicationProfileSave(event).catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('opportunity-form').addEventListener('submit', event => {
    handleOpportunityAdd(event).catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('application-resume-form').addEventListener('submit', event => {
    handleApplicationArtifactUpload(event, 'resume', 'application-resume-file', 'Final resume attached to the application run.').catch(() => {});
  });

  document.getElementById('application-cover-letter-form').addEventListener('submit', event => {
    handleApplicationArtifactUpload(event, 'cover_letter', 'application-cover-letter-file', 'Cover letter attached to the application run.').catch(() => {});
  });

  document.getElementById('build-career-base').addEventListener('click', () => {
    performAction('/api/actions/build-career-base', {}, 'Background draft refreshed.').catch(() => {});
  });

  document.getElementById('build-voice-profile').addEventListener('click', () => {
    performAction('/api/actions/build-voice-profile', {}, 'Writing guide refreshed.').catch(() => {});
  });

  document.getElementById('build-onboarding').addEventListener('click', () => {
    performAction('/api/actions/build-onboarding', {}, 'Starter materials refreshed.').catch(() => {});
  });

  document.getElementById('queue-sourcing-run').addEventListener('click', () => {
    queueSourcingRun().catch(() => {});
  });

  document.getElementById('refresh-sourcing').addEventListener('click', () => {
    loadDashboard()
      .then(() => {
        setStatus('Search queue refreshed from local files.', 'success');
        addActivity('Refreshed the search queue from local sourcing files.', 'success');
      })
      .catch(error => {
        setStatus(error.message, 'error');
      });
  });

  document.getElementById('task-evaluate').addEventListener('click', () => {
    buildTaskPack('evaluate_opportunity').catch(() => {});
  });

  document.getElementById('task-draft-package').addEventListener('click', () => {
    buildTaskPack('draft_application_package').catch(() => {});
  });

  document.getElementById('task-prepare-submission').addEventListener('click', () => {
    buildTaskPack('prepare_submission').catch(() => {});
  });

  document.getElementById('queue-task-handoff').addEventListener('click', () => {
    queueTaskHandoff().catch(() => {});
  });

  document.getElementById('start-application-run').addEventListener('click', () => {
    handleStartApplicationRun().catch(() => {});
  });

  document.getElementById('application-primary-action').addEventListener('click', () => {
    runRecommendedApplicationAction().catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('queue-application-run').addEventListener('click', () => {
    queueApplicationRunHandoff().catch(() => {});
  });

  document.getElementById('launch-browser-assist').addEventListener('click', () => {
    launchBrowserAssist().catch(() => {});
  });

  document.getElementById('ready-for-final-review').addEventListener('click', () => {
    markApplicationReadyForFinalReview().catch(() => {});
  });

  document.getElementById('mark-application-submitted').addEventListener('click', () => {
    handleMarkApplicationSubmitted().catch(() => {});
  });

  document.getElementById('task-opportunity').addEventListener('change', () => {
    const currentOpportunity = selectedOpportunity();
    if (state.taskPack?.opportunity?.id !== currentOpportunity?.id) {
      state.taskPack = null;
    }
    renderTaskPack(state.snapshot);
  });

  document.getElementById('application-opportunity').addEventListener('change', () => {
    const opportunityId = document.getElementById('application-opportunity').value;
    if (opportunityId) {
      selectJobsRecord('pipeline', opportunityId, { filter: 'pipeline' });
    }
    renderApplicationRuns(state.snapshot);
  });

  document.getElementById('jobs-filter-review').addEventListener('click', () => {
    state.jobsBoardFilter = 'review';
    ensureJobsBoardState(state.snapshot);
    renderSourcing(state.snapshot);
  });

  document.getElementById('jobs-filter-pipeline').addEventListener('click', () => {
    state.jobsBoardFilter = 'pipeline';
    ensureJobsBoardState(state.snapshot);
    renderSourcing(state.snapshot);
  });

  document.getElementById('jobs-board-list').addEventListener('click', event => {
    const button = event.target.closest('[data-jobs-select-id]');
    if (!button) return;
    selectJobsRecord(button.dataset.jobsSelectType, button.dataset.jobsSelectId, {
      filter: button.dataset.jobsSelectType === 'candidate' ? 'review' : 'pipeline',
    });
    renderSourcing(state.snapshot);
    renderApplicationRuns(state.snapshot);
  });

  document.getElementById('jobs-detail-primary-actions').addEventListener('click', event => {
    const button = event.target.closest('[data-jobs-action]');
    if (!button) return;

    if (button.dataset.jobsAction === 'approve-selected' && state.jobsSelection.type === 'candidate') {
      approveSourcingCandidate(state.jobsSelection.id).catch(() => {});
      return;
    }

    if (button.dataset.jobsAction === 'dismiss-selected' && state.jobsSelection.type === 'candidate') {
      dismissSourcingCandidate(state.jobsSelection.id).catch(() => {});
      return;
    }

    if (button.dataset.jobsAction === 'focus-apply' && state.jobsSelection.type === 'pipeline') {
      activateView('apply', {
        panelId: 'application-run-panel',
        scroll: true,
      });
      renderApplicationRuns(state.snapshot);
      return;
    }

    if (button.dataset.jobsAction === 'open-source' && state.jobsSelection.type === 'pipeline') {
      const opportunity = selectedJobsRecord(state.snapshot)?.record;
      if (opportunity?.source_url) {
        window.open(opportunity.source_url, '_blank', 'noopener,noreferrer');
      }
    }
  });

  document.getElementById('jobs-open-apply').addEventListener('click', () => {
    if (state.jobsSelection.type !== 'pipeline') return;
    activateView('apply', {
      panelId: 'application-run-panel',
      scroll: true,
    });
    renderApplicationRuns(state.snapshot);
  });

  document.getElementById('assistant-id').addEventListener('change', () => {
    refreshAgentSetup().catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('agent-mode').addEventListener('change', () => {
    refreshAgentSetup().catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('copy-agent-prompt').addEventListener('click', () => {
    copyAgentPrompt().catch(() => {});
  });

  document.getElementById('copy-task-prompt').addEventListener('click', () => {
    copyTaskPrompt().catch(() => {});
  });

  document.getElementById('copy-handoff-path').addEventListener('click', () => {
    copyLatestHandoffPath().catch(() => {});
  });

  document.getElementById('copy-handoff-notes').addEventListener('click', () => {
    copyLatestHandoffNotes().catch(() => {});
  });

  document.getElementById('copy-handoff-message').addEventListener('click', () => {
    copyLatestHandoffMessage().catch(() => {});
  });

  document.getElementById('copy-handoff-recovery').addEventListener('click', () => {
    copyLatestHandoffRecovery().catch(() => {});
  });

  document.getElementById('preview-browser-assist-log').addEventListener('click', () => {
    previewBrowserAssistLog().catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('copy-agent-brief-hero').addEventListener('click', () => {
    scrollToPanel('agent-panel');
  });

  document.getElementById('jump-to-current-step').addEventListener('click', event => {
    const target = event.currentTarget.dataset.scrollTarget;
    if (!target) return;
    scrollToPanel(target);
  });

  document.getElementById('refresh-button').addEventListener('click', () => {
    loadDashboard()
      .then(() => {
        setStatus('Workspace refreshed.', 'success');
        addActivity('Refreshed the dashboard from local workspace files.', 'success');
      })
      .catch(error => {
        setStatus(error.message, 'error');
      });
  });

  document.getElementById('artifact-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-artifact-path]');
    if (!button) return;
    previewArtifact(button.dataset.artifactPath).catch(error => {
      setStatus(error.message, 'error');
    });
  });

  document.getElementById('wizard-grid').addEventListener('click', event => {
    const button = event.target.closest('[data-scroll-target]');
    if (!button) return;
    scrollToPanel(button.dataset.scrollTarget);
  });

  if (state.desktop.available) {
    document.getElementById('desktop-open-workspace').addEventListener('click', () => {
      openDesktopWorkspace().catch(() => {});
    });

    document.getElementById('desktop-reset-workspace').addEventListener('click', () => {
      resetDesktopWorkspace().catch(() => {});
    });
  }
}

registerEvents();

loadDashboard()
  .then(() => {
    addActivity('Dashboard ready. Start with the highlighted step in the setup journey.', 'success');
  })
  .catch(error => {
    document.getElementById('candidate-name').textContent = 'Workspace load failed';
    document.getElementById('candidate-headline').textContent = error.message;
    setStatus(error.message, 'error');
  });
