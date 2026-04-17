import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readYamlFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) || fallback;
}

function writeYamlFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(value, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }));
}

function normalizeString(value = '') {
  return String(value || '').trim();
}

function normalizeStringList(items = []) {
  return [...new Set((items || [])
    .map(item => normalizeString(item))
    .filter(Boolean))];
}

function fieldKey(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function slugify(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function clampScore(value, fallback = 5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(10, numeric));
}

function searchStrategyPath(workspacePath) {
  return path.join(workspacePath, 'config', 'search-strategy.yml');
}

function applicationProfilePath(workspacePath) {
  return path.join(workspacePath, 'config', 'application-profile.yml');
}

function opportunitiesPath(workspacePath) {
  return path.join(workspacePath, 'data', 'pipeline', 'opportunities.yml');
}

function normalizeLanes(lanes = []) {
  return normalizeStringList(lanes).map(name => ({
    name,
    slug: slugify(name),
  })).filter(lane => lane.slug);
}

function normalizeSafeAnswers(safeAnswers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(safeAnswers || {})) {
    const normalizedKey = fieldKey(key);
    const normalizedValue = normalizeString(value);
    if (!normalizedKey || !normalizedValue) continue;
    normalized[normalizedKey] = normalizedValue;
  }
  return normalized;
}

function normalizeHumanGatedFields(fields = []) {
  const normalized = {};
  for (const key of normalizeStringList(fields)) {
    const normalizedKey = fieldKey(key);
    if (!normalizedKey) continue;
    normalized[normalizedKey] = 'human_review_required';
  }
  return normalized;
}

function humanizeFieldKey(key = '') {
  return String(key).replace(/_/g, ' ').trim();
}

function uniqueOpportunityId(existing = [], company = '', role = '') {
  const base = [slugify(company), slugify(role)].filter(Boolean).join('-') || `opportunity-${Date.now()}`;
  const used = new Set(existing.map(item => item.id));

  if (!used.has(base)) return base;

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

export function saveSearchStrategy({ workspaceArg, payload = {} }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const filePath = searchStrategyPath(workspacePath);
  const current = readYamlFile(filePath, {}) || {};

  const next = {
    ...current,
    version: Number(current.version || 1),
    lanes: normalizeLanes(payload.lanes),
    geography: {
      preferred: normalizeStringList(payload.geography?.preferred),
      acceptable: normalizeStringList(payload.geography?.acceptable),
      blocked: normalizeStringList(payload.geography?.blocked),
    },
    work_mode_preferences: normalizeStringList(payload.work_mode_preferences),
    compensation: {
      ...(current.compensation || {}),
      target_base_usd: Number(payload.compensation?.target_base_usd || 0),
      exception_floor_usd: Number(payload.compensation?.exception_floor_usd || 0),
    },
    step_down_logic: normalizeStringList(payload.step_down_logic),
  };

  writeYamlFile(filePath, next);

  return {
    output: path.relative(workspacePath, filePath),
    lane_count: next.lanes.length,
    work_mode_count: next.work_mode_preferences.length,
    target_base_usd: next.compensation.target_base_usd,
  };
}

export function saveApplicationProfile({ workspaceArg, payload = {} }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const filePath = applicationProfilePath(workspacePath);
  const current = readYamlFile(filePath, {}) || {};
  const humanGatedFields = normalizeHumanGatedFields(payload.human_gated_fields);

  const next = {
    ...current,
    version: Number(current.version || 1),
    contact: {
      ...(current.contact || {}),
      email: normalizeString(payload.contact?.email),
      phone: normalizeString(payload.contact?.phone),
      linkedin_url: normalizeString(payload.contact?.linkedin_url),
      portfolio_url: normalizeString(payload.contact?.portfolio_url),
    },
    safe_answers: normalizeSafeAnswers(payload.safe_answers),
    human_gated_fields: humanGatedFields,
    guardrails: {
      ...(current.guardrails || {}),
      never_auto_submit_without_human_confirmation: true,
      never_auto_answer: Object.keys(humanGatedFields).map(humanizeFieldKey),
    },
  };

  writeYamlFile(filePath, next);

  return {
    output: path.relative(workspacePath, filePath),
    safe_answer_count: Object.keys(next.safe_answers).length,
    human_gate_count: Object.keys(next.human_gated_fields).length,
  };
}

export function addOpportunity({ workspaceArg, payload = {} }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const filePath = opportunitiesPath(workspacePath);
  const current = readYamlFile(filePath, { version: 1, opportunities: [] }) || { version: 1, opportunities: [] };
  const company = normalizeString(payload.company);
  const role = normalizeString(payload.role);

  if (!company || !role) {
    throw new Error('Company and role are required to add an opportunity.');
  }

  const opportunity = {
    id: uniqueOpportunityId(current.opportunities || [], company, role),
    company,
    role,
    application_url: normalizeString(payload.application_url),
    source_url: normalizeString(payload.source_url),
    source_site: normalizeString(payload.source_site),
    location: normalizeString(payload.location),
    location_type: normalizeString(payload.location_type),
    employment: normalizeString(payload.employment),
    compensation: normalizeString(payload.compensation),
    phase: normalizeString(payload.phase) || 'researching',
    human_gate: Boolean(payload.human_gate),
    next_step: normalizeString(payload.next_step) || 'Review and decide the next move.',
    strategy: {
      lane: normalizeString(payload.strategy?.lane)
        || workspace.searchStrategy?.lanes?.[0]?.slug
        || 'general',
      company_stage: normalizeString(payload.strategy?.company_stage)
        || Object.keys(workspace.searchStrategy?.company_stage_mix || {})[0]
        || 'scale-up',
      work_mode: normalizeString(payload.strategy?.work_mode)
        || workspace.searchStrategy?.work_mode_preferences?.[0]
        || 'remote',
    },
    score: {
      capability_fit: clampScore(payload.score?.capability_fit),
      screen_odds: clampScore(payload.score?.screen_odds),
      upside: clampScore(payload.score?.upside),
      compensation: clampScore(payload.score?.compensation),
      logistics: clampScore(payload.score?.logistics),
    },
  };

  const next = {
    version: Number(current.version || 1),
    opportunities: [opportunity, ...(current.opportunities || [])],
  };

  writeYamlFile(filePath, next);

  return {
    output: path.relative(workspacePath, filePath),
    opportunity,
    total: next.opportunities.length,
  };
}

export function updateOpportunityPhase({ workspaceArg, opportunityId, phase, nextStep = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const filePath = opportunitiesPath(workspacePath);
  const current = readYamlFile(filePath, { version: 1, opportunities: [] }) || { version: 1, opportunities: [] };
  let updated = null;

  const nextOpportunities = (current.opportunities || []).map(opportunity => {
    if (opportunity.id !== opportunityId) return opportunity;
    updated = {
      ...opportunity,
      phase: normalizeString(phase) || opportunity.phase,
      next_step: normalizeString(nextStep) || opportunity.next_step,
    };
    return updated;
  });

  if (!updated) {
    throw new Error(`Opportunity not found: ${opportunityId}`);
  }

  writeYamlFile(filePath, {
    version: Number(current.version || 1),
    opportunities: nextOpportunities,
  });

  return {
    output: path.relative(workspacePath, filePath),
    opportunity: updated,
  };
}
