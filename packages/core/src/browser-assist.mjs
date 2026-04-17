import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { createRequire } from 'module';
import {
  getApplicationRun,
  setApplicationRunBrowserAssist,
} from './application-runs.mjs';
import { resolveWorkspacePath } from './workspace.mjs';

const require = createRequire(import.meta.url);
const SESSION_FILENAME = 'browser-assist-session.yml';
const LOG_FILENAME = 'browser-assist-log.md';
const MAX_AUTOMATION_STEPS = 2;
const KEY_TOKEN_STOPWORDS = new Set(['url', 'link', 'profile', 'number', 'id']);
const GENERIC_MANUAL_PATTERNS = [
  ['work authorization', 'Work authorization'],
  ['authorized to work', 'Work authorization'],
  ['legal right to work', 'Work authorization'],
  ['right to work', 'Work authorization'],
  ['eligible to work', 'Work authorization'],
  ['sponsorship', 'Sponsorship'],
  ['visa', 'Visa sponsorship'],
  ['gender', 'Gender'],
  ['race', 'Race or ethnicity'],
  ['ethnicity', 'Race or ethnicity'],
  ['veteran', 'Veteran status'],
  ['disability', 'Disability status'],
  ['compensation', 'Compensation expectations'],
  ['salary', 'Compensation expectations'],
  ['pay range', 'Compensation expectations'],
  ['ssn', 'Social security number'],
  ['social security', 'Social security number'],
  ['date of birth', 'Date of birth'],
  ['criminal history', 'Criminal history'],
  ['background check', 'Criminal history'],
  ['conviction', 'Criminal history'],
];
const MANUAL_KEY_ALIASES = {
  work_authorization: [
    'work authorization',
    'authorized to work',
    'authorization to work',
    'legal right to work',
    'right to work',
    'eligible to work',
  ],
  sponsorship: [
    'sponsorship',
    'visa sponsorship',
    'require sponsorship',
    'require visa',
    'future sponsorship',
  ],
  eeo: [
    'eeo',
    'equal employment opportunity',
    'self identify',
    'self-identify',
    'race or ethnicity',
    'gender identity',
  ],
  disability_status: [
    'disability',
    'disability status',
  ],
  veteran_status: [
    'veteran',
    'protected veteran',
  ],
  criminal_history: [
    'criminal history',
    'criminal record',
    'background check',
    'conviction',
  ],
  compensation_expectation: [
    'compensation expectation',
    'salary expectation',
    'compensation',
    'salary',
    'pay range',
    'salary range',
    'target compensation',
  ],
};
const SAFE_FIELD_ALIASES = [
  {
    keys: ['github_url', 'github_profile', 'github'],
    patterns: ['github profile', 'github'],
  },
  {
    keys: ['portfolio_url', 'website', 'personal_website', 'personal_site'],
    patterns: ['website', 'portfolio', 'personal site', 'personal website'],
  },
  {
    keys: ['linkedin_url', 'linkedin_profile'],
    patterns: ['linkedin profile', 'linkedin'],
  },
  {
    keys: ['current_city', 'city', 'location_city'],
    patterns: ['location city', 'current city', 'city'],
  },
  {
    keys: ['current_country', 'country', 'country_region'],
    patterns: ['country/region', 'country region', 'current country', 'country'],
  },
  {
    keys: ['referral_source', 'job_source', 'how_heard'],
    patterns: ['how did you hear', 'heard about this job', 'how you heard', 'referral source'],
  },
  {
    keys: ['start_date', 'availability'],
    patterns: ['start date', 'available start', 'availability'],
  },
  {
    keys: ['relocation'],
    patterns: ['relocation', 'relocate'],
  },
  {
    keys: ['work_mode_preference', 'work_mode', 'work_arrangement'],
    patterns: ['work mode', 'work arrangement', 'work setup', 'remote or hybrid', 'onsite remote hybrid'],
  },
];
const PORTAL_PROFILES = {
  generic: {
    id: 'generic',
    name: 'Generic ATS',
    maxAutomationSteps: 2,
    maxOpenApplyClicks: 1,
    openApplyPatterns: [
      /apply for this job/i,
      /apply now/i,
      /^apply$/i,
      /submit application/i,
      /i'?m interested/i,
    ],
    advancePatterns: [
      /continue application/i,
      /continue/i,
      /next/i,
      /review application/i,
      /review your application/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  greenhouse: {
    id: 'greenhouse',
    name: 'Greenhouse',
    maxAutomationSteps: 2,
    maxOpenApplyClicks: 1,
    openApplyPatterns: [
      /apply now/i,
      /apply for this job/i,
    ],
    advancePatterns: [
      /continue/i,
      /next/i,
      /review application/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  ashby: {
    id: 'ashby',
    name: 'Ashby',
    maxAutomationSteps: 2,
    maxOpenApplyClicks: 1,
    openApplyPatterns: [
      /apply for this job/i,
      /apply now/i,
      /i'?m interested/i,
    ],
    advancePatterns: [
      /continue/i,
      /next/i,
      /review application/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  lever: {
    id: 'lever',
    name: 'Lever',
    maxAutomationSteps: 2,
    maxOpenApplyClicks: 1,
    openApplyPatterns: [
      /apply for this job/i,
      /apply now/i,
    ],
    advancePatterns: [
      /continue/i,
      /next/i,
      /review your application/i,
      /review application/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  smartrecruiters: {
    id: 'smartrecruiters',
    name: 'SmartRecruiters',
    maxAutomationSteps: 3,
    maxOpenApplyClicks: 2,
    openApplyPatterns: [
      /i'?m interested/i,
      /apply now/i,
      /^apply$/i,
    ],
    advancePatterns: [
      /continue/i,
      /next/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  workable: {
    id: 'workable',
    name: 'Workable',
    maxAutomationSteps: 3,
    maxOpenApplyClicks: 2,
    openApplyPatterns: [
      /apply now/i,
      /apply for this job/i,
      /easy apply/i,
    ],
    advancePatterns: [
      /continue/i,
      /next/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit your application/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
  workday: {
    id: 'workday',
    name: 'Workday',
    maxAutomationSteps: 4,
    maxOpenApplyClicks: 3,
    openApplyPatterns: [
      /autofill with resume/i,
      /upload resume/i,
      /apply manually/i,
      /apply now/i,
      /^apply$/i,
    ],
    advancePatterns: [
      /save and continue/i,
      /continue/i,
      /next/i,
      /review/i,
    ],
    submitPatterns: [
      /review and submit/i,
      /submit application/i,
      /^submit$/i,
    ],
  },
};

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeYamlFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(value, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  }));
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value, 'utf-8');
}

function normalizeString(value = '') {
  return String(value || '').trim();
}

function titleCase(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, match => match.toUpperCase());
}

function redactValue(value = '') {
  const text = normalizeString(value);
  if (!text) return '';
  if (text.length <= 4) return text;
  return `${text.slice(0, 2)}...${text.slice(-2)}`;
}

function browserAssistFolderRelative(runId) {
  return path.join('data', 'applications', runId);
}

function browserAssistSessionRelativePath(runId) {
  return path.join(browserAssistFolderRelative(runId), SESSION_FILENAME);
}

function browserAssistLogRelativePath(runId) {
  return path.join(browserAssistFolderRelative(runId), LOG_FILENAME);
}

function browserUserDataDir(workspacePath, runId) {
  return path.join(workspacePath, browserAssistFolderRelative(runId), '.browser-assist-profile');
}

function sessionPath(workspacePath, runId) {
  return path.join(workspacePath, browserAssistSessionRelativePath(runId));
}

function logPath(workspacePath, runId) {
  return path.join(workspacePath, browserAssistLogRelativePath(runId));
}

function safeToken(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokensForKey(value = '') {
  return safeToken(value).split(' ').filter(Boolean);
}

function normalizeLabel(value = '') {
  return safeToken(value);
}

function meaningfulTokensForKey(value = '') {
  return tokensForKey(value).filter(token => !KEY_TOKEN_STOPWORDS.has(token));
}

function normalizedLabelMatchesPattern(normalizedLabel = '', pattern = '') {
  if (!normalizedLabel || !pattern) return false;
  if (normalizedLabel.includes(pattern)) return true;
  const tokens = tokensForKey(pattern);
  return tokens.length > 0 && tokens.every(token => normalizedLabel.includes(token));
}

function normalizePortalType(value = '') {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized && PORTAL_PROFILES[normalized]) return normalized;
  if (normalized === 'manual' || normalized === 'unknown') return 'generic';
  return normalized || 'generic';
}

function uniquePatterns(patterns = []) {
  const seen = new Set();
  return patterns.filter(pattern => {
    const key = String(pattern);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function portalProfileForType(portalType = '') {
  return PORTAL_PROFILES[normalizePortalType(portalType)] || PORTAL_PROFILES.generic;
}

function inferPortalTypeFromHint(hint = '') {
  const haystack = normalizeLabel(hint);
  if (!haystack) return 'generic';
  if (haystack.includes('greenhouse')) return 'greenhouse';
  if (haystack.includes('ashbyhq') || haystack.includes('ashby')) return 'ashby';
  if (haystack.includes('lever.co') || haystack.includes('lever')) return 'lever';
  if (haystack.includes('smartrecruiters')) return 'smartrecruiters';
  if (haystack.includes('workable')) return 'workable';
  if (haystack.includes('myworkdayjobs') || haystack.includes('workday')) return 'workday';
  return 'generic';
}

function inferPortalTypeFromHints(...hints) {
  for (const hint of hints) {
    const inferred = inferPortalTypeFromHint(hint);
    if (inferred !== 'generic') return inferred;
  }

  return inferPortalTypeFromHint(hints.filter(Boolean).join(' '));
}

export function detectBrowserAssistPortal(run = {}, scan = {}) {
  const explicitType = normalizePortalType(run.portal?.type || '');
  const inferredType = inferPortalTypeFromHints(
    scan.url,
    scan.title,
    scan.bodyText,
    run.portal?.apply_url,
    run.portal?.listing_url,
  );

  if (inferredType !== 'generic' && inferredType !== explicitType) {
    return portalProfileForType(inferredType);
  }

  if (explicitType !== 'generic') {
    return portalProfileForType(explicitType);
  }

  return portalProfileForType(inferredType);
}

function portalPatterns(portalProfile, key) {
  return uniquePatterns([
    ...(portalProfile?.[key] || []),
    ...(PORTAL_PROFILES.generic[key] || []),
  ]);
}

function portalSubmitButtons(portalProfile, buttonTexts = []) {
  const patterns = portalPatterns(portalProfile, 'submitPatterns');
  return buttonTexts.filter(text => patterns.some(pattern => pattern.test(String(text || ''))));
}

function splitFullName(fullName = '') {
  const parts = normalizeString(fullName).split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
}

function packageExists(name) {
  try {
    require.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function browserCandidates() {
  if (process.platform === 'darwin') {
    return [
      {
        id: 'google_chrome',
        name: 'Google Chrome',
        executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      },
      {
        id: 'brave',
        name: 'Brave Browser',
        executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      },
      {
        id: 'edge',
        name: 'Microsoft Edge',
        executablePath: '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      },
    ];
  }

  if (process.platform === 'win32') {
    return [
      {
        id: 'google_chrome',
        name: 'Google Chrome',
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      },
      {
        id: 'edge',
        name: 'Microsoft Edge',
        executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
      },
    ];
  }

  return [
    {
      id: 'google_chrome',
      name: 'Google Chrome',
      executablePath: '/usr/bin/google-chrome',
    },
    {
      id: 'google_chrome_stable',
      name: 'Google Chrome Stable',
      executablePath: '/usr/bin/google-chrome-stable',
    },
    {
      id: 'brave',
      name: 'Brave Browser',
      executablePath: '/usr/bin/brave-browser',
    },
  ];
}

function detectLocalBrowser() {
  for (const candidate of browserCandidates()) {
    if (fs.existsSync(candidate.executablePath)) {
      return candidate;
    }
  }
  return null;
}

export function browserAssistStatus() {
  const dependencyInstalled = packageExists('playwright-core');
  const browser = detectLocalBrowser();
  const available = Boolean(dependencyInstalled && browser);
  const supportedPortals = Object.values(PORTAL_PROFILES)
    .filter(profile => profile.id !== 'generic')
    .map(profile => ({
      id: profile.id,
      name: profile.name,
      max_automation_steps: profile.maxAutomationSteps,
    }));

  return {
    available,
    dependency_installed: dependencyInstalled,
    browser,
    supported_portals: supportedPortals,
    summary: available
      ? `Local browser assist can launch ${browser.name} and handle common ATS flows like Greenhouse, Ashby, Lever, and Workday while keeping sensitive answers human-reviewed.`
      : dependencyInstalled
        ? 'Local browser assist needs Chrome, Brave, or Edge installed on this computer.'
        : 'Local browser assist needs the Playwright runtime dependency installed first.',
  };
}

export function browserAssistArtifactsForRun(runId) {
  return {
    session: browserAssistSessionRelativePath(runId),
    log: browserAssistLogRelativePath(runId),
  };
}

function readRun(workspaceArg, runId) {
  return getApplicationRun({
    workspaceArg,
    runId,
  });
}

function fullNameValue(run) {
  return (run.safe_prefill || []).find(field => field.key === 'full_name')?.value || '';
}

function safeValueFromRun(run, key) {
  return (run.safe_prefill || []).find(field => field.key === key)?.value || '';
}

function safeFieldFromRun(run, keys = []) {
  for (const key of keys) {
    const found = (run.safe_prefill || []).find(field => field.key === key && normalizeString(field.value));
    if (found) return found;
  }
  return null;
}

function safeFieldAliasMatch(normalizedFieldLabel = '', run) {
  for (const alias of SAFE_FIELD_ALIASES) {
    if (!alias.patterns.some(pattern => normalizedLabelMatchesPattern(normalizedFieldLabel, pattern))) continue;
    const field = safeFieldFromRun(run, alias.keys);
    if (!field) continue;
    return {
      key: field.key || '',
      source: field.source || field.key || '',
      value: field.value,
    };
  }

  return null;
}

function findManualCheckpoint(run, label = '') {
  const normalized = normalizeLabel(label);

  for (const checkpoint of run.manual_checkpoints || []) {
    const aliasPatterns = [
      ...(MANUAL_KEY_ALIASES[checkpoint.key] || []),
      ...(MANUAL_KEY_ALIASES[normalizeString(checkpoint.key).toLowerCase()] || []),
    ];
    if (aliasPatterns.some(pattern => normalizedLabelMatchesPattern(normalized, pattern))) {
      return checkpoint;
    }

    const keys = [checkpoint.key, checkpoint.label].filter(Boolean);
    for (const key of keys) {
      const tokenGroups = [
        tokensForKey(key),
        meaningfulTokensForKey(key),
      ].filter(tokens => tokens.length);
      if (tokenGroups.some(tokens => tokens.every(token => normalized.includes(token)))) {
        return checkpoint;
      }
    }
  }

  for (const [pattern, labelText] of GENERIC_MANUAL_PATTERNS) {
    if (normalizedLabelMatchesPattern(normalized, pattern)) {
      return {
        key: pattern.replace(/\s+/g, '_'),
        label: labelText,
        reason: 'This answer must always be confirmed by the human before submission.',
      };
    }
  }

  return null;
}

function findSafeFieldValue(run, field) {
  const normalized = normalizeLabel([field.label, field.name, field.id].filter(Boolean).join(' '));
  const fullName = fullNameValue(run);
  const { firstName, lastName } = splitFullName(fullName);
  const directPatterns = [
    ['email', ['email', 'email address']],
    ['phone', ['phone', 'phone number', 'mobile', 'mobile phone']],
    ['linkedin_url', ['linkedin', 'linkedin profile']],
    ['portfolio_url', ['portfolio', 'website', 'personal site', 'personal website']],
  ];

  if (/first name|given name/.test(normalized) && firstName) {
    return {
      key: 'full_name',
      source: 'candidate.full_name',
      value: firstName,
    };
  }

  if (/last name|surname|family name/.test(normalized) && lastName) {
    return {
      key: 'full_name',
      source: 'candidate.full_name',
      value: lastName,
    };
  }

  if ((/full name|your name|\bname\b/.test(normalized) && !/first name|last name|surname|family name/.test(normalized)) && fullName) {
    return {
      key: 'full_name',
      source: 'candidate.full_name',
      value: fullName,
    };
  }

  for (const [key, patterns] of directPatterns) {
    if (!patterns.some(pattern => normalized.includes(pattern))) continue;
    const value = safeValueFromRun(run, key);
    if (!value) continue;
    return {
      key,
      source: key,
      value,
    };
  }

  const aliased = safeFieldAliasMatch(normalized, run);
  if (aliased) return aliased;

  for (const fieldValue of run.safe_prefill || []) {
    if (!fieldValue?.value) continue;
    const tokenGroups = [
      tokensForKey(fieldValue.key || fieldValue.label || ''),
      meaningfulTokensForKey(fieldValue.key || fieldValue.label || ''),
    ].filter(tokens => tokens.length);
    if (tokenGroups.some(tokens => tokens.every(token => normalized.includes(token)))) {
      return {
        key: fieldValue.key || '',
        source: fieldValue.source || fieldValue.key || '',
        value: fieldValue.value,
      };
    }
  }

  return null;
}

function pickUpload(run, field, uploadsUsed = new Set(), portalProfile = PORTAL_PROFILES.generic) {
  const normalized = normalizeLabel([field.label, field.name, field.id].filter(Boolean).join(' '));
  const genericUploadSignal = normalized.includes('upload')
    || normalized.includes('attach')
    || normalized.includes('drop file')
    || normalized.includes('drop files')
    || normalized.includes('browse');
  const candidates = [
    {
      kind: 'cover_letter',
      patterns: ['cover letter', 'coverletter', 'motivation letter'],
      relativePath: run.artifacts?.cover_letter || '',
    },
    {
      kind: 'resume',
      patterns: ['resume', 'cv', 'curriculum vitae', 'upload resume', 'candidate resume'],
      relativePath: run.artifacts?.resume || '',
    },
  ];

  for (const candidate of candidates) {
    if (!candidate.relativePath || uploadsUsed.has(candidate.kind)) continue;
    if (candidate.patterns.some(pattern => normalized.includes(pattern))) {
      return candidate;
    }
  }

  const ambiguousUpload = normalized.includes('upload files')
    || normalized.includes('attachments')
    || normalized.includes('drag and drop');
  if (portalProfile.id === 'workday' && ambiguousUpload) {
    if (!uploadsUsed.has('resume') && run.artifacts?.resume) {
      return {
        kind: 'resume',
        patterns: ['resume'],
        relativePath: run.artifacts.resume,
      };
    }
    if (!uploadsUsed.has('cover_letter') && run.artifacts?.cover_letter) {
      return {
        kind: 'cover_letter',
        patterns: ['cover letter'],
        relativePath: run.artifacts.cover_letter,
      };
    }
  }

  if (genericUploadSignal && !uploadsUsed.has('resume') && run.artifacts?.resume) {
    return {
      kind: 'resume',
      patterns: ['resume'],
      relativePath: run.artifacts.resume,
    };
  }

  if (genericUploadSignal && !uploadsUsed.has('cover_letter') && run.artifacts?.cover_letter) {
    return {
      kind: 'cover_letter',
      patterns: ['cover letter'],
      relativePath: run.artifacts.cover_letter,
    };
  }

  return null;
}

async function maybeOpenApplyFlow(page, portalProfile = PORTAL_PROFILES.generic) {
  const patterns = portalPatterns(portalProfile, 'openApplyPatterns');

  for (const pattern of patterns) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.count()) {
      await button.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      return true;
    }

    const link = page.getByRole('link', { name: pattern }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      return true;
    }
  }

  return false;
}

async function scanForm(page) {
  return page.evaluate(() => {
    const isVisible = element => {
      if (!element) return false;
      const style = window.getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    const textContent = element => (element?.textContent || '').replace(/\s+/g, ' ').trim();

    const labelFor = element => {
      if (!element) return '';
      const id = element.getAttribute('id');
      if (id) {
        const direct = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (direct) return textContent(direct);
      }
      const wrapped = element.closest('label');
      if (wrapped) return textContent(wrapped);
      const aria = element.getAttribute('aria-label');
      if (aria) return aria.trim();
      const labelledBy = element.getAttribute('aria-labelledby');
      if (labelledBy) {
        const node = document.getElementById(labelledBy);
        if (node) return textContent(node);
      }
      return '';
    };

    const refPrefix = 'job-hunter-os-browser-assist';
    let refIndex = 0;
    const fields = [];
    for (const element of document.querySelectorAll('input, textarea, select')) {
      const tag = element.tagName.toLowerCase();
      const type = (element.getAttribute('type') || tag).toLowerCase();
      if (tag === 'input' && ['hidden', 'submit', 'button', 'reset'].includes(type)) continue;
      if (type === 'checkbox' || type === 'radio') continue;
      const label = labelFor(element) || element.getAttribute('placeholder') || element.getAttribute('name') || element.id || '';
      if (!label && type !== 'file') continue;
      if (type !== 'file' && !isVisible(element)) continue;
      refIndex += 1;
      const ref = `${refPrefix}-${refIndex}`;
      element.setAttribute('data-jhos-ref', ref);
      fields.push({
        ref,
        tag,
        type,
        label,
        name: element.getAttribute('name') || '',
        id: element.id || '',
        required: element.required || element.getAttribute('aria-required') === 'true',
        value: tag === 'select' ? element.value || '' : ('value' in element ? element.value || '' : ''),
      });
    }

    const buttonTexts = [];
    for (const element of document.querySelectorAll('button, input[type="submit"], input[type="button"], a[role="button"]')) {
      const text = textContent(element) || element.getAttribute('value') || element.getAttribute('aria-label') || '';
      if (!text || !isVisible(element)) continue;
      buttonTexts.push(text);
    }

    return {
      url: window.location.href,
      title: document.title,
      fields,
      buttonTexts,
      bodyText: (document.body?.innerText || '').slice(0, 20000),
    };
  });
}

function looksLikeApplicationForm(scan = {}) {
  const labels = (scan.fields || [])
    .map(field => normalizeLabel([field.label, field.name, field.id].filter(Boolean).join(' ')))
    .filter(Boolean);
  if (!labels.length) return false;

  if (labels.some(label => /resume|cv|cover letter|first name|last name|email|phone|linkedin|portfolio|website|authorization|salary|compensation/i.test(label))) {
    return true;
  }

  return labels.length >= 3
    && (scan.buttonTexts || []).some(text => /continue|next|review|submit/i.test(normalizeLabel(text)));
}

export function needsOpenApplyStep(scan = {}, portalHint = 'generic') {
  const portalProfile = typeof portalHint === 'string'
    ? portalProfileForType(portalHint)
    : (portalHint || PORTAL_PROFILES.generic);

  if (looksLikeApplicationForm(scan)) return false;
  if (detectPageGate(scan.bodyText || '', portalProfile)) return false;

  return (scan.buttonTexts || []).some(text =>
    portalPatterns(portalProfile, 'openApplyPatterns').some(pattern => pattern.test(String(text || ''))));
}

function detectPageGate(bodyText = '', portalProfile = PORTAL_PROFILES.generic) {
  const lower = normalizeLabel(bodyText);
  if (lower.includes('captcha') || lower.includes('verify you are human')) {
    return 'CAPTCHA or human verification detected.';
  }
  if (lower.includes('verification code') || lower.includes('two factor') || lower.includes('one time passcode')) {
    return 'Verification code or MFA detected.';
  }
  if ((lower.includes('create account') || lower.includes('candidate home account')) && lower.includes('password')) {
    return 'Account creation or sign-in is required before the application can continue.';
  }
  const loginSignals = lower.includes('password')
    || lower.includes('email address')
    || lower.includes('forgot your password')
    || lower.includes('login required');
  if (lower.includes('log in') || (lower.includes('sign in') && loginSignals) || lower.includes('password')) {
    return 'Login required before the application can continue.';
  }
  if (portalProfile.id === 'workday' && (lower.includes('create account') || lower.includes('already have an account') || lower.includes('use my stored profile'))) {
    return 'Workday is asking for an account step that needs a human before automation can continue.';
  }
  return '';
}

async function fillFieldValue(page, field, value) {
  const locator = page.locator(`[data-jhos-ref="${field.ref}"]`).first();
  if (field.tag === 'select') {
    try {
      await locator.selectOption({ label: value });
      return;
    } catch {}
    try {
      await locator.selectOption(value);
      return;
    } catch {}
  }
  await locator.fill(value);
}

async function uploadFieldValue(page, field, filePath) {
  const locator = page.locator(`[data-jhos-ref="${field.ref}"]`).first();
  await locator.setInputFiles(filePath);
}

async function maybeAdvanceStep(page, buttonTexts = [], portalProfile = PORTAL_PROFILES.generic) {
  const nextPatterns = portalPatterns(portalProfile, 'advancePatterns');
  const hasNext = buttonTexts.some(text => nextPatterns.some(pattern => pattern.test(String(text || ''))));
  if (!hasNext) return false;

  for (const pattern of nextPatterns) {
    const button = page.getByRole('button', { name: pattern }).first();
    if (await button.count()) {
      await button.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      return true;
    }

    const link = page.getByRole('link', { name: pattern }).first();
    if (await link.count()) {
      await link.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      return true;
    }
  }

  return false;
}

function actionLogEntry(kind, details = {}) {
  return {
    timestamp: new Date().toISOString(),
    kind,
    ...details,
  };
}

function logMarkdown(run, session) {
  const autoFilled = (session.auto_filled || []).map(item => `- ${item.field}: ${item.kind === 'upload' ? item.file : item.value_preview}`);
  const manual = (session.manual_review_items || []).map(item => `- ${item.label}: ${item.reason}`);
  const unresolved = (session.unresolved_required_fields || []).map(item => `- ${item}`);
  const buttons = (session.submit_buttons || []).map(item => `- ${item}`);

  return [
    `# Browser Assist - ${run.company} - ${run.role}`,
    '',
    `- Status: ${titleCase(session.status)}`,
    `- Portal: ${session.portal?.name || titleCase(run.portal?.type || 'Unknown')}`,
    `- Browser: ${session.browser?.name || 'Unknown browser'}`,
    `- Current URL: ${session.current_url || run.portal?.apply_url || 'Unknown'}`,
    `- Next step: ${session.next_step || 'Review the application and continue carefully.'}`,
    '',
    '## Auto Filled',
    '',
    ...(autoFilled.length ? autoFilled : ['- No safe fields were auto-filled in this pass.']),
    '',
    '## Manual Review Items',
    '',
    ...(manual.length ? manual : ['- None detected in this pass.']),
    '',
    '## Remaining Required Fields',
    '',
    ...(unresolved.length ? unresolved : ['- None detected in this pass.']),
    '',
    '## Submit Buttons Detected',
    '',
    ...(buttons.length ? buttons : ['- None detected in this pass.']),
    '',
    '## Rules',
    '',
    '- Sensitive answers stay human-reviewed.',
    '- Final submit is always human-controlled.',
    '- If the app looks wrong, stop and use assistant fill help instead.',
  ].join('\n');
}

function buildSessionSummary(run, browser, artifacts, session, error = '') {
  return {
    version: 1,
    run_id: run.id,
    company: run.company,
    role: run.role,
    launched_at: session.launched_at,
    updated_at: new Date().toISOString(),
    status: session.status,
    browser,
    portal: session.portal || {
      id: normalizePortalType(run.portal?.type || ''),
      name: titleCase(run.portal?.type || 'generic'),
    },
    current_url: session.current_url || run.portal?.apply_url || '',
    auto_filled_count: (session.auto_filled || []).length,
    manual_review_count: (session.manual_review_items || []).length,
    unresolved_required_count: (session.unresolved_required_fields || []).length,
    submit_detected: Boolean((session.submit_buttons || []).length),
    next_step: session.next_step,
    output_session: artifacts.session,
    output_log: artifacts.log,
    error: normalizeString(error),
  };
}

function initialSession(run) {
  return {
    launched_at: new Date().toISOString(),
    status: 'launching',
    current_url: run.portal?.apply_url || '',
    portal: {
      id: normalizePortalType(run.portal?.type || ''),
      name: portalProfileForType(run.portal?.type || '').name,
    },
    auto_filled: [],
    manual_review_items: [],
    unresolved_required_fields: [],
    submit_buttons: [],
    next_step: 'Launching the local browser assist flow.',
  };
}

function mapRunStatus(browserSession) {
  if (browserSession.status === 'ready_for_final_review') {
    return {
      status: 'awaiting_final_confirmation',
      nextStep: 'Browser assist reached the final-review step. Verify everything manually, then submit when ready.',
    };
  }

  if (browserSession.status === 'manual_review_required') {
    return {
      status: 'manual_review_required',
      nextStep: 'Browser assist paused because a manual answer or unresolved required field needs your review in the live application.',
    };
  }

  if (browserSession.status === 'launch_failed') {
    return {
      status: 'browser_assist_error',
      nextStep: 'Browser assist could not complete. Use assistant fill help or continue manually.',
    };
  }

  return {
    status: 'browser_assist_in_progress',
    nextStep: 'Browser assist filled the current step and left the live application ready for your review.',
  };
}

export function resolveFieldPlan(run, field, portalHint = null, uploadsUsed = new Set()) {
  const portalProfile = typeof portalHint === 'string'
    ? portalProfileForType(portalHint)
    : (portalHint || detectBrowserAssistPortal(run, {}));
  const upload = field.type === 'file' ? pickUpload(run, field, uploadsUsed, portalProfile) : null;
  if (upload) {
    return {
      kind: 'upload',
      artifact: upload.kind,
      relativePath: upload.relativePath,
    };
  }

  const manual = findManualCheckpoint(run, [field.label, field.name, field.id].filter(Boolean).join(' '));
  if (manual) {
    return {
      kind: 'manual',
      key: manual.key || '',
      label: manual.label || field.label || '',
      reason: manual.reason || 'Human review required.',
    };
  }

  const safe = findSafeFieldValue(run, field);
  if (safe) {
    return {
      kind: 'safe',
      key: safe.key || '',
      source: safe.source || '',
      value: safe.value,
    };
  }

  return {
    kind: field.required ? 'required_manual' : 'unknown',
  };
}

async function importPlaywright() {
  return import('playwright-core');
}

export async function runBrowserAssist({
  workspaceArg,
  runId,
  headless = false,
  keepOpen = true,
}) {
  const capabilities = browserAssistStatus();
  if (!capabilities.dependency_installed) {
    throw new Error('Local browser assist is unavailable because the Playwright runtime is not installed.');
  }
  if (!capabilities.browser) {
    throw new Error('Local browser assist could not find Chrome, Brave, or Edge on this computer.');
  }

  const workspacePath = resolveWorkspacePath(workspaceArg);
  const run = readRun(workspacePath, runId);
  if (!normalizeString(run.portal?.apply_url)) {
    throw new Error('Add the direct application URL before launching browser assist.');
  }
  if (!normalizeString(run.artifacts?.resume)) {
    throw new Error('Attach the final resume before launching browser assist.');
  }

  const artifacts = browserAssistArtifactsForRun(run.id);
  let session = initialSession(run);
  let browserSummary = {
    id: capabilities.browser.id,
    name: capabilities.browser.name,
    executable_path: capabilities.browser.executablePath,
    user_data_dir: path.relative(workspacePath, browserUserDataDir(workspacePath, run.id)),
  };

  writeYamlFile(sessionPath(workspacePath, run.id), session);
  writeTextFile(logPath(workspacePath, run.id), logMarkdown(run, session));
  setApplicationRunBrowserAssist({
    workspaceArg: workspacePath,
    runId: run.id,
    browserAssist: buildSessionSummary(run, browserSummary, artifacts, session),
    status: 'browser_assist_in_progress',
    nextStep: 'Browser assist is launching local browser automation for this application.',
  });

  const { chromium } = await importPlaywright();
  const userDataDir = browserUserDataDir(workspacePath, run.id);
  fs.mkdirSync(userDataDir, { recursive: true });

  let context;
  let browser;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless,
      executablePath: capabilities.browser.executablePath,
      viewport: null,
      args: ['--start-maximized'],
    });
    browser = context.browser();
    const page = context.pages()[0] || await context.newPage();

    await page.goto(run.portal.apply_url, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle').catch(() => {});
    let initialScan = await scanForm(page);
    let portalProfile = detectBrowserAssistPortal(run, initialScan);

    const maxOpenApplyClicks = portalProfile.maxOpenApplyClicks || 1;
    for (let openStepIndex = 0; openStepIndex < maxOpenApplyClicks; openStepIndex += 1) {
      if (!needsOpenApplyStep(initialScan, portalProfile)) break;
      const opened = await maybeOpenApplyFlow(page, portalProfile);
      if (!opened) break;
      initialScan = await scanForm(page);
      portalProfile = detectBrowserAssistPortal(run, initialScan);
    }

    const gate = looksLikeApplicationForm(initialScan)
      ? ''
      : detectPageGate(initialScan.bodyText, portalProfile);
    if (gate) {
      session = {
        ...session,
        status: 'manual_review_required',
        current_url: initialScan.url,
        portal: {
          id: portalProfile.id,
          name: portalProfile.name,
        },
        manual_review_items: [
          {
            label: gate,
            reason: 'The live application needs a human before automation can continue.',
          },
        ],
        next_step: gate,
      };
    } else {
      const uploadsUsed = new Set();
      const maxAutomationSteps = portalProfile.maxAutomationSteps || MAX_AUTOMATION_STEPS;
      for (let stepIndex = 0; stepIndex < maxAutomationSteps; stepIndex += 1) {
        const scan = await scanForm(page);
        portalProfile = detectBrowserAssistPortal(run, scan);
        const autoFilled = [];
        const manualItems = [];
        const unresolvedRequired = [];

        for (const field of scan.fields || []) {
          const label = [field.label, field.name, field.id].filter(Boolean).join(' ').trim() || `Field ${field.ref}`;
          if (field.value && field.type !== 'file') continue;
          const plan = resolveFieldPlan(run, field, portalProfile, uploadsUsed);

          if (plan.kind === 'upload' && plan.relativePath) {
            const filePath = path.join(workspacePath, plan.relativePath);
            if (!fs.existsSync(filePath)) continue;
            await uploadFieldValue(page, field, filePath);
            uploadsUsed.add(plan.artifact);
            autoFilled.push(actionLogEntry('upload', {
              field: label,
              file: plan.relativePath,
            }));
            continue;
          }

          if (plan.kind === 'manual') {
            manualItems.push({
              key: plan.key,
              label: plan.label || label,
              reason: plan.reason,
            });
            continue;
          }

          if (plan.kind === 'safe' && plan.value) {
            await fillFieldValue(page, field, plan.value);
            autoFilled.push(actionLogEntry('safe_fill', {
              field: label,
              value_preview: redactValue(plan.value),
              source: plan.source,
            }));
            continue;
          }

          if (field.required) {
            unresolvedRequired.push(label);
          }
        }

        const finalScan = await scanForm(page);
        portalProfile = detectBrowserAssistPortal(run, finalScan);
        const submitButtons = portalSubmitButtons(portalProfile, finalScan.buttonTexts || []);

        session = {
          ...session,
          current_url: finalScan.url,
          portal: {
            id: portalProfile.id,
            name: portalProfile.name,
          },
          auto_filled: [...(session.auto_filled || []), ...autoFilled],
          manual_review_items: [...(session.manual_review_items || []), ...manualItems],
          unresolved_required_fields: [...(session.unresolved_required_fields || []), ...unresolvedRequired],
          submit_buttons: submitButtons,
        };

        if (submitButtons.length) {
          session.status = 'ready_for_final_review';
          session.next_step = 'Browser assist reached a final-review step. Verify every field manually, then submit yourself.';
          break;
        }

        if (manualItems.length || unresolvedRequired.length) {
          session.status = 'manual_review_required';
          session.next_step = 'Browser assist paused because a manual answer or unresolved required field needs your review.';
          break;
        }

        const advanced = await maybeAdvanceStep(page, finalScan.buttonTexts || [], portalProfile);
        if (!advanced) {
          session.status = 'step_filled';
          session.next_step = 'Browser assist filled the current step. Continue in the live application and refresh the dashboard afterward.';
          break;
        }
      }
    }

    const runStatus = mapRunStatus(session);
    writeYamlFile(sessionPath(workspacePath, run.id), {
      version: 1,
      run_id: run.id,
      company: run.company,
      role: run.role,
      browser: browserSummary,
      ...session,
      updated_at: new Date().toISOString(),
    });
    writeTextFile(logPath(workspacePath, run.id), logMarkdown(run, session));
    setApplicationRunBrowserAssist({
      workspaceArg: workspacePath,
      runId: run.id,
      browserAssist: buildSessionSummary(run, browserSummary, artifacts, session),
      status: runStatus.status,
      nextStep: runStatus.nextStep,
    });

    if (keepOpen && !headless && browser) {
      await new Promise(resolve => {
        browser.on('disconnected', resolve);
      });
      return {
        ok: true,
        run_id: run.id,
        browser_kept_open: true,
        session_path: artifacts.session,
        log_path: artifacts.log,
      };
    }

    await context.close();
    return {
      ok: true,
      run_id: run.id,
      browser_kept_open: false,
      session_path: artifacts.session,
      log_path: artifacts.log,
    };
  } catch (error) {
    session = {
      ...session,
      status: 'launch_failed',
      next_step: 'Browser assist failed. Use assistant fill help or continue manually.',
    };
    writeYamlFile(sessionPath(workspacePath, run.id), {
      version: 1,
      run_id: run.id,
      company: run.company,
      role: run.role,
      browser: browserSummary,
      ...session,
      updated_at: new Date().toISOString(),
      error: error.message,
    });
    writeTextFile(logPath(workspacePath, run.id), logMarkdown(run, session));
    setApplicationRunBrowserAssist({
      workspaceArg: workspacePath,
      runId: run.id,
      browserAssist: buildSessionSummary(run, browserSummary, artifacts, session, error.message),
      status: 'browser_assist_error',
      nextStep: 'Browser assist failed. Use assistant fill help or continue manually.',
    });

    if (context) {
      await context.close().catch(() => {});
    }

    throw error;
  }
}
