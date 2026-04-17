import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { addOpportunity } from './workspace-editor.mjs';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';
import { recommendationForScore, scoreOpportunity } from './state-machine.mjs';

export const DEFAULT_SOURCE_FILE = {
  version: 1,
  updated_at: null,
  batches: [],
  candidates: [],
};

const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'your', 'leadership',
  'manager', 'senior', 'director', 'head', 'principal', 'staff', 'of',
  'operations', 'operating', 'systems', 'lead', 'role', 'jobs', 'job',
]);

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

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value, 'utf-8');
}

export function sourcingFilePath(workspacePath) {
  return path.join(workspacePath, 'data', 'sourcing', 'candidates.yml');
}

function sourcingReviewsDir(workspacePath) {
  return path.join(workspacePath, 'data', 'sourcing', 'reviews');
}

function normalizeString(value = '') {
  return String(value || '').trim();
}

function slugify(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fieldKey(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function clampScore(value, fallback = 5) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(10, Math.round(numeric)));
}

function sourceSiteLabel(input = '') {
  try {
    const url = new URL(input);
    const host = url.hostname.toLowerCase();
    if (host.includes('greenhouse')) return 'Greenhouse';
    if (host.includes('lever')) return 'Lever';
    if (host.includes('ashby')) return 'Ashby';
    if (host.includes('workday')) return 'Workday';
    if (host.includes('smartrecruiters')) return 'SmartRecruiters';
    if (host.includes('workable')) return 'Workable';
    return host.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function companyFromUrl(input = '') {
  try {
    const url = new URL(input);
    const first = url.hostname
      .replace(/^www\./, '')
      .split('.')
      .find(Boolean);
    return first
      ? first.replace(/[-_]+/g, ' ').replace(/\b\w/g, match => match.toUpperCase())
      : '';
  } catch {
    return '';
  }
}

function decodeEntities(text = '') {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, '\'')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

function stripTags(html = '') {
  return decodeEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim());
}

function normalizeUrl(href = '', baseUrl = '') {
  const raw = normalizeString(href);
  if (!raw) return '';
  try {
    return new URL(raw, baseUrl || undefined).toString();
  } catch {
    return raw;
  }
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const normalized = normalizeString(value);
    if (normalized) return normalized;
  }
  return '';
}

function titleFromHtml(html = '') {
  const match = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? stripTags(match[1]) : '';
}

function jobTokens(value = '') {
  return normalizeString(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(token => token && token.length > 2 && !STOP_WORDS.has(token));
}

function similarityScore(needles = [], haystack = []) {
  if (!needles.length || !haystack.length) return 0;
  const haystackSet = new Set(haystack);
  let score = 0;
  for (const token of needles) {
    if (haystackSet.has(token)) score += 1;
  }
  return score;
}

function detectWorkMode(text = '', preferences = []) {
  const value = normalizeString(text).toLowerCase();
  if (/remote/.test(value)) return 'remote';
  if (/hybrid/.test(value)) return 'hybrid';
  if (/on[- ]?site|onsite/.test(value)) return 'onsite';
  return preferences[0] || 'remote';
}

function inferLane(candidate, searchStrategy = {}) {
  const lanes = searchStrategy.lanes || [];
  if (!lanes.length) {
    return {
      lane: 'general',
      reason: 'No role target paths are configured yet.',
      score: 0,
    };
  }

  const candidateTokens = jobTokens([
    candidate.role,
    candidate.company,
    candidate.summary,
  ].filter(Boolean).join(' '));

  let best = null;
  for (const lane of lanes) {
    const laneTokens = jobTokens([lane.name, lane.slug].join(' '));
    const score = similarityScore(laneTokens, candidateTokens);
    if (!best || score > best.score) {
      best = {
        lane: lane.slug,
        lane_name: lane.name,
        score,
      };
    }
  }

  if (!best || best.score === 0) {
    return {
      lane: lanes[0].slug,
      reason: `Defaulted to your first target path: ${lanes[0].name}.`,
      score: 0,
    };
  }

  return {
    lane: best.lane,
    reason: `Looks closest to your target path: ${best.lane_name}.`,
    score: best.score,
  };
}

function inferScoreHint(candidate, searchStrategy = {}, laneMatch = null) {
  const preferredModes = searchStrategy.work_mode_preferences || [];
  const mode = detectWorkMode([candidate.location, candidate.location_type, candidate.summary].join(' '), preferredModes);
  const locationText = normalizeString([candidate.location, candidate.location_type].filter(Boolean).join(' ')).toLowerCase();
  const preferredLocation = (searchStrategy.geography?.preferred || [])
    .find(item => locationText.includes(normalizeString(item).toLowerCase()));
  const acceptableLocation = (searchStrategy.geography?.acceptable || [])
    .find(item => locationText.includes(normalizeString(item).toLowerCase()));
  const blockedLocation = (searchStrategy.geography?.blocked || [])
    .find(item => locationText.includes(normalizeString(item).toLowerCase()));
  const compensationText = normalizeString(candidate.compensation);
  const compensationNumbers = [...compensationText.matchAll(/\$?\s*(\d{2,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s*([kKmM]?)/g)]
    .map(match => {
      const base = Number(String(match[1]).replace(/,/g, ''));
      if (!Number.isFinite(base)) return null;
      const suffix = String(match[2] || '').toLowerCase();
      if (suffix === 'k') return base * 1000;
      if (suffix === 'm') return base * 1000000;
      return base >= 1000 ? base : null;
    })
    .filter(Number.isFinite);
  const compensationMax = compensationNumbers.length ? Math.max(...compensationNumbers) : 0;
  const targetBase = Number(searchStrategy.compensation?.target_base_usd || 0);
  const exceptionFloor = Number(searchStrategy.compensation?.exception_floor_usd || 0);

  let compensationScore = 6;
  let compensationReason = 'Compensation fit is neutral because no reliable range was found.';
  if (compensationNumbers.length && (targetBase || exceptionFloor)) {
    if (exceptionFloor && compensationMax < exceptionFloor) {
      compensationScore = 2;
      compensationReason = `Compensation looks below your exception floor of $${exceptionFloor.toLocaleString()}.`;
    } else if (targetBase && compensationMax >= targetBase) {
      compensationScore = 8;
      compensationReason = `Compensation reaches your target range around $${targetBase.toLocaleString()}.`;
    } else if (exceptionFloor && compensationMax >= exceptionFloor) {
      compensationScore = 6;
      compensationReason = `Compensation is below your main target but above your exception floor of $${exceptionFloor.toLocaleString()}.`;
    }
  } else if (/\$|usd|salary|comp/i.test(compensationText)) {
    compensationScore = 7;
    compensationReason = 'Compensation is listed but not structured enough to compare precisely.';
  }

  let logisticsScore = preferredModes.length ? 6 : 7;
  let logisticsReason = 'Logistics fit is neutral.';
  if (blockedLocation) {
    logisticsScore = 2;
    logisticsReason = `Location appears to match a blocked geography: ${blockedLocation}.`;
  } else if (preferredLocation) {
    logisticsScore = 9;
    logisticsReason = `Location aligns with a preferred geography: ${preferredLocation}.`;
  } else if (acceptableLocation) {
    logisticsScore = 7;
    logisticsReason = `Location aligns with an acceptable geography: ${acceptableLocation}.`;
  }

  if (preferredModes.length) {
    if (preferredModes.includes(mode)) {
      logisticsScore = Math.max(logisticsScore, 8);
      logisticsReason = blockedLocation
        ? logisticsReason
        : `Work setup looks aligned with your preferred mode: ${mode}.`;
    } else if (!blockedLocation) {
      logisticsScore = Math.min(logisticsScore, 5);
      logisticsReason = `Work setup looks less aligned with your preferred modes (${preferredModes.join(', ')}).`;
    }
  }

  return {
    capability_fit: clampScore(4 + Math.min(5, (laneMatch?.score || 0) * 2), 5),
    screen_odds: clampScore(candidate.summary || candidate.source_url ? 7 : 6, 6),
    upside: clampScore(/director|head|lead|principal|staff|chief|vp/i.test(candidate.role) ? 8 : 6, 6),
    compensation: clampScore(compensationScore, 6),
    logistics: clampScore(logisticsScore, 6),
    mode,
    blocked_location: Boolean(blockedLocation),
    below_exception_floor: Boolean(exceptionFloor && compensationNumbers.length && compensationMax < exceptionFloor),
    compensation_reason: compensationReason,
    logistics_reason: logisticsReason,
  };
}

function companyStageFallback(searchStrategy = {}) {
  return Object.keys(searchStrategy.company_stage_mix || {})[0] || 'scale-up';
}

function locationFromParts(parts = {}) {
  const values = [
    parts.streetAddress,
    parts.addressLocality,
    parts.addressRegion,
    parts.addressCountry,
  ].map(normalizeString).filter(Boolean);
  return values.join(', ');
}

function collectJobPostingObjects(value, output = []) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach(item => collectJobPostingObjects(item, output));
    return output;
  }

  const type = value['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.some(item => String(item).toLowerCase() === 'jobposting')) {
    output.push(value);
  }

  Object.values(value).forEach(item => collectJobPostingObjects(item, output));
  return output;
}

function parseJsonLdJobs(html = '', sourceUrl = '') {
  const regex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  const jobs = [];
  let match;

  while ((match = regex.exec(html))) {
    const raw = normalizeString(match[1]);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const postings = collectJobPostingObjects(parsed);
      for (const posting of postings) {
        const locationObject = posting.jobLocation?.address || posting.jobLocation?.[0]?.address || {};
        jobs.push({
          role: firstNonEmpty(posting.title, posting.name),
          company: firstNonEmpty(
            posting.hiringOrganization?.name,
            posting.hiringOrganization?.sameAs,
            companyFromUrl(sourceUrl)
          ),
          location: firstNonEmpty(
            locationFromParts(locationObject),
            posting.jobLocation?.name,
            posting.applicantLocationRequirements?.[0]?.name
          ),
          summary: firstNonEmpty(posting.description && stripTags(posting.description)),
          source_url: normalizeUrl(posting.url, sourceUrl) || sourceUrl,
          source_site: sourceSiteLabel(sourceUrl),
          location_type: normalizeString(posting.jobLocationType || ''),
          employment: normalizeString(posting.employmentType || ''),
        });
      }
    } catch {
      continue;
    }
  }

  return jobs.filter(job => normalizeString(job.role) && normalizeString(job.company));
}

function extractBalancedJson(text = '') {
  const value = String(text || '');
  const startIndex = value.search(/[{[]/);
  if (startIndex === -1) return '';

  const opening = value[startIndex];
  const closing = opening === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escapeNext = false;
  let quoteChar = '';

  for (let index = startIndex; index < value.length; index += 1) {
    const char = value[index];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (inString) {
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === quoteChar) {
        inString = false;
        quoteChar = '';
      }
      continue;
    }

    if (char === '"' || char === '\'') {
      inString = true;
      quoteChar = char;
      continue;
    }

    if (char === opening) depth += 1;
    if (char === closing) depth -= 1;
    if (depth === 0) {
      return value.slice(startIndex, index + 1);
    }
  }

  return '';
}

function firstFinite(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function formatMoneyAmount(value, currency = '') {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '';
  const rounded = Math.round(numeric);
  const normalizedCurrency = normalizeString(currency).toUpperCase();
  if (normalizedCurrency === 'USD' || normalizedCurrency === 'US$') {
    return `$${rounded.toLocaleString()}`;
  }
  if (normalizedCurrency) {
    return `${normalizedCurrency} ${rounded.toLocaleString()}`;
  }
  return `$${rounded.toLocaleString()}`;
}

function compensationTextFromObject(value) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeString(value);
  if (typeof value === 'number') return formatMoneyAmount(value);
  if (Array.isArray(value)) {
    return value.map(item => compensationTextFromObject(item)).find(Boolean) || '';
  }
  if (typeof value !== 'object') return '';

  const nested = compensationTextFromObject(
    value.value || value.range || value.compensation || value.salary || value.amount || value.amounts
  );
  if (nested) return nested;

  const currency = firstNonEmpty(value.currency, value.currencyCode, value.currency_code, value.code);
  const unit = firstNonEmpty(value.interval, value.unitText, value.frequency, value.period);
  const min = firstFinite(value.min, value.minimum, value.lowerBound, value.low, value.from, value.start);
  const max = firstFinite(value.max, value.maximum, value.upperBound, value.high, value.to, value.end);
  const exact = firstFinite(value.amount, value.value, value.salary, value.base);

  if (min !== null && max !== null) {
    return `${formatMoneyAmount(min, currency)} - ${formatMoneyAmount(max, currency)}${unit ? ` / ${unit}` : ''}`;
  }
  if (min !== null) {
    return `${formatMoneyAmount(min, currency)}+${unit ? ` / ${unit}` : ''}`;
  }
  if (max !== null) {
    return `Up to ${formatMoneyAmount(max, currency)}${unit ? ` / ${unit}` : ''}`;
  }
  if (exact !== null) {
    return `${formatMoneyAmount(exact, currency)}${unit ? ` / ${unit}` : ''}`;
  }

  return '';
}

function locationTextFromValue(value) {
  if (!value) return '';
  if (typeof value === 'string') return normalizeString(value);
  if (Array.isArray(value)) {
    return value.map(item => locationTextFromValue(item)).find(Boolean) || '';
  }
  if (typeof value !== 'object') return '';

  const direct = firstNonEmpty(
    value.name,
    value.label,
    value.location,
    value.locationName,
    value.city,
    value.text
  );
  if (direct) return direct;

  return firstNonEmpty(
    locationFromParts(value.address || value),
    locationFromParts(value.location || {}),
    locationTextFromValue(value.office),
    locationTextFromValue(value.remoteOption)
  );
}

function genericJobObjectCandidate(value = {}, sourceUrl = '') {
  const sourceCandidateUrl = normalizeUrl(
    firstNonEmpty(
      value.url,
      value.absolute_url,
      value.absoluteUrl,
      value.hosted_url,
      value.hostedUrl,
      value.apply_url,
      value.applyUrl,
      value.job_url,
      value.jobUrl,
      value.canonical_url,
      value.canonicalUrl,
      value.externalPath
    ),
    sourceUrl
  );

  return {
    role: firstNonEmpty(value.title, value.jobTitle, value.positionTitle, value.role, value.name),
    company: firstNonEmpty(
      value.company?.name,
      value.company_name,
      value.companyName,
      value.organization?.name,
      value.organization_name,
      value.organizationName,
      value.hiringOrganization?.name,
      value.employer?.name,
      companyFromUrl(sourceCandidateUrl || sourceUrl)
    ),
    location: firstNonEmpty(
      locationTextFromValue(value.location),
      locationTextFromValue(value.locations),
      locationTextFromValue(value.jobLocation),
      locationTextFromValue(value.workplaceLocation),
      locationTextFromValue(value.office),
      locationTextFromValue(value.offices),
      locationTextFromValue(value.applicantLocationRequirements)
    ),
    summary: firstNonEmpty(
      stripTags(value.summary),
      stripTags(value.description),
      stripTags(value.shortDescription),
      stripTags(value.short_description),
      stripTags(value.content)
    ),
    source_url: sourceCandidateUrl || normalizeUrl(sourceUrl),
    source_site: sourceSiteLabel(sourceCandidateUrl || sourceUrl),
    location_type: firstNonEmpty(
      value.location_type,
      value.locationType,
      value.jobLocationType,
      value.workplace,
      value.remote
    ),
    employment: firstNonEmpty(
      value.employment,
      value.employmentType,
      value.employment_type,
      value.jobType,
      value.job_type,
      value.commitment
    ),
    compensation: firstNonEmpty(
      compensationTextFromObject(value.compensation),
      compensationTextFromObject(value.compensationRange),
      compensationTextFromObject(value.salary),
      compensationTextFromObject(value.salaryRange),
      compensationTextFromObject(value.payRange),
      compensationTextFromObject(value.baseSalary)
    ),
  };
}

function looksLikeGenericJobObject(value = {}, sourceUrl = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).map(key => key.toLowerCase());
  const candidate = genericJobObjectCandidate(value, sourceUrl);
  if (!candidate.role) return false;

  const hasJobSignals = keys.some(key => /title|role|position|description|location|apply|employment|salary|compensation|posting|job/.test(key));
  const hasUsefulData = Boolean(candidate.source_url || candidate.company || candidate.location || candidate.summary || candidate.compensation);
  return hasJobSignals && hasUsefulData;
}

function collectGenericJsonJobs(value, sourceUrl = '', output = [], seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    value.forEach(item => collectGenericJsonJobs(item, sourceUrl, output, seen));
    return output;
  }
  if (seen.has(value)) return output;
  seen.add(value);

  if (looksLikeGenericJobObject(value, sourceUrl)) {
    output.push(genericJobObjectCandidate(value, sourceUrl));
  }

  Object.values(value).forEach(item => collectGenericJsonJobs(item, sourceUrl, output, seen));
  return output;
}

function parseEmbeddedJsonJobs(html = '', sourceUrl = '') {
  const regex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const jobs = [];
  let match;

  while ((match = regex.exec(html))) {
    const script = normalizeString(match[1]);
    if (!script) continue;

    const candidates = [script, extractBalancedJson(script)].filter(Boolean);
    for (const rawCandidate of candidates) {
      try {
        const parsed = JSON.parse(rawCandidate);
        jobs.push(...collectGenericJsonJobs(parsed, sourceUrl));
      } catch {
        continue;
      }
    }
  }

  return jobs.filter(job => normalizeString(job.role) && normalizeString(job.company));
}

function splitMarkdownRow(line = '') {
  return String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map(cell => cell.trim());
}

function markdownSeparatorRow(line = '') {
  return /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/.test(String(line || ''));
}

function markdownCellText(value = '') {
  return normalizeString(String(value || '').replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/`/g, ''));
}

function markdownCellUrl(value = '', sourceUrl = '') {
  const linkMatch = String(value || '').match(/\((https?:\/\/[^)\s]+)\)/);
  if (linkMatch) return normalizeUrl(linkMatch[1], sourceUrl);
  const urlMatch = String(value || '').match(/https?:\/\/\S+/);
  return urlMatch ? normalizeUrl(urlMatch[0], sourceUrl) : '';
}

function markdownColumnKey(value = '') {
  const key = fieldKey(value);
  if (['role', 'title', 'position', 'job_title'].includes(key)) return 'role';
  if (['company', 'organization', 'org', 'employer'].includes(key)) return 'company';
  if (['location', 'city'].includes(key)) return 'location';
  if (['compensation', 'salary', 'pay', 'pay_range'].includes(key)) return 'compensation';
  if (['summary', 'description', 'notes', 'reason'].includes(key)) return 'summary';
  if (['url', 'link', 'apply', 'apply_url', 'source_url'].includes(key)) return 'source_url';
  if (['source', 'source_site', 'board', 'ats'].includes(key)) return 'source_site';
  if (['review_band', 'band', 'priority'].includes(key)) return 'review_band';
  if (['review_reason', 'reason_for_review'].includes(key)) return 'review_reason';
  return key;
}

function parseMarkdownTableJobs(text = '', sourceUrl = '') {
  const lines = String(text || '').split('\n');
  const jobs = [];

  for (let index = 0; index < lines.length - 1; index += 1) {
    const headerLine = lines[index];
    const separatorLine = lines[index + 1];
    if (!headerLine.includes('|') || !markdownSeparatorRow(separatorLine)) continue;

    const headers = splitMarkdownRow(headerLine).map(markdownColumnKey);
    index += 2;

    while (index < lines.length && lines[index].includes('|')) {
      const row = splitMarkdownRow(lines[index]);
      if (!row.length || row.every(cell => !normalizeString(cell))) {
        index += 1;
        continue;
      }

      const record = {};
      headers.forEach((header, columnIndex) => {
        const cell = row[columnIndex] || '';
        if (!header) return;
        if (header === 'source_url') {
          record.source_url = markdownCellUrl(cell, sourceUrl) || normalizeString(cell);
          return;
        }
        record[header] = markdownCellText(cell);
      });

      if (record.role && record.company) {
        jobs.push({
          role: record.role,
          company: record.company,
          location: record.location || '',
          compensation: record.compensation || '',
          summary: record.summary || '',
          source_url: normalizeUrl(record.source_url || '', sourceUrl),
          source_site: firstNonEmpty(record.source_site, sourceSiteLabel(record.source_url || sourceUrl)),
          review_band: record.review_band || '',
          review_reason: record.review_reason || '',
        });
      }

      index += 1;
    }

    index -= 1;
  }

  return jobs;
}

function parseAnchorJobs(html = '', sourceUrl = '') {
  const jobs = [];
  const regex = /<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const pageTitle = titleFromHtml(html);
  let match;

  while ((match = regex.exec(html))) {
    const href = normalizeUrl(match[1], sourceUrl);
    const role = stripTags(match[2]);
    if (!href || !role) continue;
    if (!/job|career|opening|position|posting/i.test(href)) continue;
    if (role.length < 4 || role.length > 120) continue;
    if (!/[A-Za-z]/.test(role)) continue;

    const chunk = html.slice(Math.max(0, match.index - 260), match.index + match[0].length + 260);
    const contextText = stripTags(chunk);
    const locationMatch = contextText.match(/\b(remote|hybrid|onsite|on-site|new york|san francisco|los angeles|boston|austin|miami|seattle|london|uk|us)\b/i);

    jobs.push({
      role,
      company: companyFromUrl(href) || companyFromUrl(sourceUrl) || pageTitle.replace(/\s*careers?.*$/i, ''),
      location: locationMatch ? locationMatch[0] : '',
      summary: contextText,
      source_url: href,
      source_site: sourceSiteLabel(href || sourceUrl),
    });
  }

  return jobs;
}

function parseMarkdownJobs(text = '', sourceUrl = '') {
  const jobs = [];
  const lines = String(text || '').split('\n');
  let currentCompany = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const headingMatch = trimmed.match(/^#{1,3}\s+(.+)$/);
    if (headingMatch) {
      currentCompany = headingMatch[1].trim();
      continue;
    }

    const linkedBullet = trimmed.match(/^[*-]\s+\[([^\]]+)\]\((https?:\/\/[^)]+)\)(?:\s+[—\-|]\s+([^|—-]+))?(?:\s+[—\-|]\s+(.+))?$/);
    if (linkedBullet) {
      jobs.push({
        role: linkedBullet[1],
        source_url: normalizeUrl(linkedBullet[2], sourceUrl),
        company: firstNonEmpty(currentCompany, companyFromUrl(linkedBullet[2]), linkedBullet[3]),
        location: linkedBullet[4] || '',
        source_site: sourceSiteLabel(linkedBullet[2]),
      });
      continue;
    }

    const textBullet = trimmed.match(/^[*-]\s+([^|—-]+?)\s+[—\-|]\s+([^|—-]+?)(?:\s+[—\-|]\s+(https?:\/\/\S+))?(?:\s+[—\-|]\s+(.+))?$/);
    if (textBullet) {
      const first = textBullet[1].trim();
      const second = textBullet[2].trim();
      const looksLikeRoleFirst = /manager|operations|director|lead|chief|head|strategy|program|business|revenue|product|support|customer|g&a|finance/i.test(first);
      jobs.push({
        role: looksLikeRoleFirst ? first : second,
        company: looksLikeRoleFirst ? second : first,
        source_url: normalizeUrl(textBullet[3] || '', sourceUrl),
        location: textBullet[4] || '',
        source_site: sourceSiteLabel(textBullet[3] || sourceUrl),
      });
    }
  }

  return jobs;
}

function parseYamlCandidateImport(text = '', sourceUrl = '') {
  try {
    const parsed = yaml.load(text);
    if (!parsed || typeof parsed !== 'object') return [];
    const candidates = parsed.candidates || parsed.roles;
    if (!Array.isArray(candidates)) return [];

    return candidates.map(candidate => ({
      role: firstNonEmpty(candidate.role, candidate.title, candidate.name),
      company: firstNonEmpty(candidate.company, candidate.organization),
      source_url: normalizeUrl(candidate.source_url || candidate.url || '', sourceUrl),
      source_site: firstNonEmpty(candidate.source_site, sourceSiteLabel(candidate.source_url || candidate.url || sourceUrl)),
      source_label: normalizeString(candidate.source || candidate.source_label),
      location: normalizeString(candidate.location),
      location_type: normalizeString(candidate.location_type),
      employment: normalizeString(candidate.employment),
      compensation: normalizeString(candidate.compensation),
      summary: normalizeString(candidate.summary || candidate.notes),
      review_band: normalizeString(candidate.review_band),
      review_reason: normalizeString(candidate.review_reason),
      strategy: candidate.strategy || {},
      score_hint: candidate.score_hint || candidate.priority || {},
    })).filter(candidate => normalizeString(candidate.role) && normalizeString(candidate.company));
  } catch {
    return [];
  }
}

function dedupeJobs(jobs = []) {
  const seen = new Set();
  const deduped = [];

  for (const job of jobs) {
    const key = [
      normalizeString(job.source_url).toLowerCase(),
      normalizeString(job.company).toLowerCase(),
      normalizeString(job.role).toLowerCase(),
    ].join('::');
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(job);
  }

  return deduped;
}

function loadSourcingState(workspaceArg) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  return readYamlFile(sourcingFilePath(workspacePath), DEFAULT_SOURCE_FILE) || structuredClone(DEFAULT_SOURCE_FILE);
}

function nextNumericId(items = [], prefix) {
  const ids = items
    .map(item => Number(String(item.id || '').replace(`${prefix}-`, '')))
    .filter(Number.isFinite);
  const next = ids.length ? Math.max(...ids) + 1 : 1;
  return `${prefix}-${String(next).padStart(4, '0')}`;
}

function existingOpportunityKeys(workspace) {
  const pipelineKeys = (workspace.opportunities?.opportunities || []).map(item => [
    normalizeString(item.company).toLowerCase(),
    normalizeString(item.role).toLowerCase(),
  ].join('::'));
  return new Set(pipelineKeys);
}

function existingSourcingKeys(state) {
  return new Set((state.candidates || []).map(candidate => [
    normalizeString(candidate.source_url).toLowerCase(),
    normalizeString(candidate.company).toLowerCase(),
    normalizeString(candidate.role).toLowerCase(),
  ].join('::')));
}

function normalizeImportedCandidate(candidate, workspace, now, batchId, fallbackSourceLabel = '') {
  const laneMatch = inferLane(candidate, workspace.searchStrategy || {});
  const inferredScoreHint = inferScoreHint(candidate, workspace.searchStrategy || {}, laneMatch);
  const scoreHint = {
    capability_fit: clampScore(candidate.score_hint?.capability_fit, inferredScoreHint.capability_fit),
    screen_odds: clampScore(candidate.score_hint?.screen_odds, inferredScoreHint.screen_odds),
    upside: clampScore(candidate.score_hint?.upside, inferredScoreHint.upside),
    compensation: clampScore(candidate.score_hint?.compensation, inferredScoreHint.compensation),
    logistics: clampScore(candidate.score_hint?.logistics, inferredScoreHint.logistics),
  };
  const priorityScoreHint = scoreOpportunity({ score: scoreHint }, workspace.searchStrategy || {});
  const reviewBand = normalizeString(candidate.review_band)
    || adjustReviewBandForConstraints(recommendationForScore(priorityScoreHint, workspace.searchStrategy || {}), inferredScoreHint);
  const sourceUrl = normalizeUrl(candidate.source_url);

  return {
    id: '',
    batch_id: batchId,
    discovered_at: now,
    pipeline_status: 'pending',
    company: normalizeString(candidate.company),
    role: normalizeString(candidate.role),
    source_label: firstNonEmpty(candidate.source_label, fallbackSourceLabel, sourceSiteLabel(sourceUrl)),
    source_site: firstNonEmpty(candidate.source_site, sourceSiteLabel(sourceUrl)),
    source_url: sourceUrl,
    location: normalizeString(candidate.location),
    location_type: normalizeString(candidate.location_type),
    employment: normalizeString(candidate.employment),
    compensation: normalizeString(candidate.compensation),
    summary: normalizeString(candidate.summary),
    live: true,
    strategy: {
      lane: normalizeString(candidate.strategy?.lane) || laneMatch.lane,
      company_stage: normalizeString(candidate.strategy?.company_stage) || companyStageFallback(workspace.searchStrategy || {}),
      work_mode: normalizeString(candidate.strategy?.work_mode)
        || inferredScoreHint.mode
        || detectWorkMode([candidate.location, candidate.summary].join(' '), workspace.searchStrategy?.work_mode_preferences || []),
    },
    score_hint: scoreHint,
    priority_score_hint: priorityScoreHint,
    review_band: reviewBand,
    review_reason: normalizeString(candidate.review_reason)
      || [
        laneMatch.reason,
        inferredScoreHint.compensation_reason,
        inferredScoreHint.logistics_reason,
        `Priority looks ${titleCaseRecommendation(reviewBand).toLowerCase()} for the current search setup.`,
      ].filter(Boolean).join(' '),
  };
}

function titleCaseRecommendation(value = '') {
  return String(value || '').replace(/_/g, ' ').replace(/\b\w/g, match => match.toUpperCase());
}

function adjustReviewBandForConstraints(reviewBand = '', inferredScoreHint = {}) {
  if (inferredScoreHint.blocked_location && inferredScoreHint.below_exception_floor) {
    return 'pass';
  }
  if ((inferredScoreHint.blocked_location || inferredScoreHint.below_exception_floor) && reviewBand === 'pursue_now') {
    return 'hold';
  }
  if ((inferredScoreHint.blocked_location || inferredScoreHint.below_exception_floor) && reviewBand === 'selective_pursue') {
    return 'hold';
  }
  return reviewBand;
}

function sourceReviewMarkdown({ candidateName, batch, candidates, searchStrategy }) {
  return [
    `# Sourcing Run - ${batch.id}`,
    '',
    `- Candidate: ${candidateName}`,
    `- Created: ${batch.created_at}`,
    `- Source label: ${batch.source_label || 'assistant-sourcing-run'}`,
    `- Source URL: ${batch.source_url || 'N/A'}`,
    `- Imported candidates: ${batch.imported_candidate_count}`,
    `- Added candidates: ${batch.added_candidate_count}`,
    `- Duplicates skipped: ${batch.duplicate_count}`,
    '',
    '## Search Context',
    '',
    `- Role targets: ${(searchStrategy.lanes || []).map(lane => lane.name || lane.slug).join(', ') || 'Not configured'}`,
    `- Preferred locations: ${(searchStrategy.geography?.preferred || []).join(', ') || 'Not configured'}`,
    `- Work modes: ${(searchStrategy.work_mode_preferences || []).join(', ') || 'Not configured'}`,
    '',
    '## Candidates',
    '',
    ...(candidates.length ? candidates.map(candidate => [
      `### ${candidate.company} - ${candidate.role}`,
      '',
      `- Source: ${candidate.source_site || candidate.source_label || 'Unknown source'}`,
      `- URL: ${candidate.source_url || 'N/A'}`,
      `- Location: ${candidate.location || 'Not listed'}`,
      `- Compensation: ${candidate.compensation || 'Not listed'}`,
      `- Review band: ${candidate.review_band}`,
      `- Reason: ${candidate.review_reason}`,
      '',
    ].join('\n')) : ['No new candidates were added in this run.']),
  ].join('\n');
}

function parseCandidateInput(text = '', sourceUrl = '') {
  const normalizedText = String(text || '');
  const html = /<html|<body|<script|<a\s/i.test(normalizedText) ? normalizedText : '';

  const jobs = dedupeJobs([
    ...parseYamlCandidateImport(normalizedText, sourceUrl),
    ...parseJsonLdJobs(html, sourceUrl),
    ...parseEmbeddedJsonJobs(html, sourceUrl),
    ...parseAnchorJobs(html, sourceUrl),
    ...parseMarkdownTableJobs(normalizedText, sourceUrl),
    ...parseMarkdownJobs(normalizedText, sourceUrl),
  ]);

  return jobs;
}

export function sourceOpportunities({ workspaceArg, payload = {} }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const state = loadSourcingState(workspacePath);
  const now = new Date().toISOString();
  const inputText = normalizeString(payload.text || '');
  const sourceUrl = normalizeString(payload.source_url || '');
  const sourceLabel = normalizeString(payload.source_label || payload.label || sourceSiteLabel(sourceUrl) || 'manual-import');

  if (!inputText) {
    throw new Error('Search results text, markdown, HTML, or YAML is required.');
  }

  const parsed = parseCandidateInput(inputText, sourceUrl);
  if (!parsed.length) {
    throw new Error('Could not detect any jobs in that search-results payload.');
  }

  const batchId = nextNumericId(state.batches || [], 'batch');
  const opportunityKeys = existingOpportunityKeys(workspace);
  const sourcingKeys = existingSourcingKeys(state);
  const normalized = [];
  let duplicateCount = 0;

  for (const candidate of parsed) {
    const normalizedCandidate = normalizeImportedCandidate(candidate, workspace, now, batchId, sourceLabel);
    const dedupeKey = [
      normalizeString(normalizedCandidate.source_url).toLowerCase(),
      normalizeString(normalizedCandidate.company).toLowerCase(),
      normalizeString(normalizedCandidate.role).toLowerCase(),
    ].join('::');
    const roleKey = [
      normalizeString(normalizedCandidate.company).toLowerCase(),
      normalizeString(normalizedCandidate.role).toLowerCase(),
    ].join('::');

    if (sourcingKeys.has(dedupeKey) || opportunityKeys.has(roleKey)) {
      duplicateCount += 1;
      continue;
    }

    sourcingKeys.add(dedupeKey);
    normalizedCandidate.id = nextNumericId([...state.candidates, ...normalized], 'candidate');
    normalized.push(normalizedCandidate);
  }

  const reviewRelativePath = path.join('data', 'sourcing', 'reviews', `${batchId}.md`);
  const batch = {
    id: batchId,
    created_at: now,
    source_label: sourceLabel,
    source_url: sourceUrl,
    imported_candidate_count: parsed.length,
    added_candidate_count: normalized.length,
    duplicate_count: duplicateCount,
    review_report: reviewRelativePath,
  };

  const next = {
    version: Number(state.version || 1),
    updated_at: now,
    batches: [batch, ...(state.batches || [])],
    candidates: [...normalized, ...(state.candidates || [])],
  };

  writeYamlFile(sourcingFilePath(workspacePath), next);
  writeTextFile(
    path.join(workspacePath, reviewRelativePath),
    sourceReviewMarkdown({
      candidateName: workspace.careerBaseConfig?.candidate?.full_name || 'Unknown Candidate',
      batch,
      candidates: normalized,
      searchStrategy: workspace.searchStrategy || {},
    })
  );

  return {
    output: path.relative(workspacePath, sourcingFilePath(workspacePath)),
    output_review: reviewRelativePath,
    batch,
    imported_candidate_count: parsed.length,
    added_candidate_count: normalized.length,
    duplicate_count: duplicateCount,
  };
}

function findCandidateOrThrow(state, candidateId) {
  const candidate = (state.candidates || []).find(item => item.id === candidateId);
  if (!candidate) {
    throw new Error(`Sourced candidate not found: ${candidateId}`);
  }
  return candidate;
}

export function approveSourcedCandidate({ workspaceArg, candidateId }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const state = loadSourcingState(workspacePath);
  const candidate = findCandidateOrThrow(state, candidateId);

  if (candidate.pipeline_status === 'approved' && candidate.opportunity_id) {
    return {
      candidate,
      already_approved: true,
      opportunity_id: candidate.opportunity_id,
    };
  }

  const result = addOpportunity({
    workspaceArg: workspacePath,
    payload: {
      company: candidate.company,
      role: candidate.role,
      application_url: candidate.source_url,
      source_url: candidate.source_url,
      source_site: candidate.source_site,
      location: candidate.location,
      location_type: candidate.location_type,
      employment: candidate.employment,
      compensation: candidate.compensation,
      phase: 'researching',
      human_gate: false,
      next_step: 'Review the sourced role and decide whether to evaluate or draft a tailored package.',
      strategy: {
        lane: candidate.strategy?.lane,
        company_stage: candidate.strategy?.company_stage,
        work_mode: candidate.strategy?.work_mode,
      },
      score: candidate.score_hint,
    },
  });

  const now = new Date().toISOString();
  const nextCandidates = (state.candidates || []).map(item => item.id === candidateId ? {
    ...item,
    pipeline_status: 'approved',
    approved_at: now,
    opportunity_id: result.opportunity.id,
  } : item);

  writeYamlFile(sourcingFilePath(workspacePath), {
    ...state,
    updated_at: now,
    candidates: nextCandidates,
  });

  return {
    output: path.relative(workspacePath, sourcingFilePath(workspacePath)),
    candidate_id: candidateId,
    opportunity: result.opportunity,
    total_pipeline: result.total,
  };
}

export function dismissSourcedCandidate({ workspaceArg, candidateId, reason = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const state = loadSourcingState(workspacePath);
  findCandidateOrThrow(state, candidateId);

  const now = new Date().toISOString();
  const nextCandidates = (state.candidates || []).map(item => item.id === candidateId ? {
    ...item,
    pipeline_status: 'dismissed',
    dismissed_at: now,
    dismissal_reason: normalizeString(reason) || 'Dismissed by the user during sourcing review.',
  } : item);

  writeYamlFile(sourcingFilePath(workspacePath), {
    ...state,
    updated_at: now,
    candidates: nextCandidates,
  });

  return {
    output: path.relative(workspacePath, sourcingFilePath(workspacePath)),
    candidate_id: candidateId,
    dismissed_at: now,
  };
}

function listOrFallback(items = [], fallback = '- None noted') {
  return items.length ? items.join('\n') : fallback;
}

function safeAnswerLines(applicationProfile = {}) {
  return Object.entries(applicationProfile.safe_answers || {})
    .map(([key, value]) => `- ${key}: ${value}`);
}

function humanGateLines(applicationProfile = {}) {
  return Object.keys(applicationProfile.human_gated_fields || {})
    .map(key => `- ${key}`);
}

function sourcingYamlTemplate(batchId) {
  return [
    'version: 1',
    `updated_at: "${new Date().toISOString()}"`,
    'batches:',
    `  - id: ${batchId}`,
    '    created_at: "<ISO timestamp>"',
    '    source_label: "assistant-sourcing-run"',
    '    source_url: ""',
    '    imported_candidate_count: 0',
    '    added_candidate_count: 0',
    '    duplicate_count: 0',
    `    review_report: "data/sourcing/reviews/${batchId}.md"`,
    'candidates:',
    '  - id: candidate-0001',
    `    batch_id: ${batchId}`,
    '    discovered_at: "<ISO timestamp>"',
    '    pipeline_status: pending',
    '    company: Example Company',
    '    role: Example Role',
    '    source_label: assistant-sourcing-run',
    '    source_site: Greenhouse',
    '    source_url: https://example.com/jobs/123',
    '    location: Remote',
    '    location_type: Remote',
    '    employment: Full time',
    '    compensation: "$180K - $220K"',
    '    summary: Short fit summary.',
    '    live: true',
    '    strategy:',
    '      lane: general',
    '      company_stage: scale-up',
    '      work_mode: remote',
    '    score_hint:',
    '      capability_fit: 7',
    '      screen_odds: 7',
    '      upside: 7',
    '      compensation: 7',
    '      logistics: 7',
    '    priority_score_hint: 70',
    '    review_band: selective_pursue',
    '    review_reason: Why this role belongs in the queue.',
  ].join('\n');
}

export function buildSourcingRunPack({ workspaceArg, mode = 'folder_access' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const workspace = loadWorkspace(workspacePath);
  const currentState = loadSourcingState(workspacePath);
  const createdAt = new Date().toISOString();
  const batchId = nextNumericId(currentState.batches || [], 'batch');
  const candidateName = workspace.careerBaseConfig?.candidate?.full_name || 'Unknown Candidate';
  const reviewRelativePath = path.join('data', 'sourcing', 'reviews', `${batchId}.md`);
  const outputTaskPack = path.join('data', 'agent-tasks', `${batchId}-sourcing-run.md`);

  const roleTargets = (workspace.searchStrategy?.lanes || []).map(lane => `- ${lane.name || lane.slug}`);
  const preferredLocations = (workspace.searchStrategy?.geography?.preferred || []).map(item => `- ${item}`);
  const safeAnswers = safeAnswerLines(workspace.applicationProfile || {});
  const humanGates = humanGateLines(workspace.applicationProfile || {});

  const prompt = [
    `Find jobs to review for ${candidateName}.`,
    '',
    mode === 'chat_upload'
      ? 'You are operating as a chat-only assistant. Browse the web yourself, then return YAML and markdown matching the output contract below.'
      : `You are operating with direct access to the local workspace at ${workspacePath}. Browse the web yourself and write the sourcing results back into the workspace files listed below.`,
    '',
    'Goal:',
    '- Discover 8 to 20 currently live roles that fit the configured job targets.',
    '- Prioritize roles from common public ATS boards such as Greenhouse, Lever, Ashby, SmartRecruiters, and Workable when they fit.',
    '- Do the web research yourself. Do not ask the human to provide a search page URL unless you are fully blocked.',
    '',
    'Where results belong:',
    `- Canonical sourcing queue: data/sourcing/candidates.yml`,
    `- Human-readable review note: ${reviewRelativePath}`,
    mode === 'chat_upload'
      ? '- If you cannot return YAML cleanly, a markdown table with Company | Role | Location | Compensation | Apply URL | Source also works.'
      : '',
    '',
    'What to include for each role:',
    '- company',
    '- role',
    '- source_site',
    '- source_url',
    '- location',
    '- location_type',
    '- employment',
    '- compensation',
    '- summary',
    '- strategy.lane',
    '- strategy.company_stage',
    '- strategy.work_mode',
    '- score_hint fields from 0 to 10',
    '- priority_score_hint from 0 to 100',
    '- review_band',
    '- review_reason',
    '',
    'Search strategy context:',
    'Role targets:',
    listOrFallback(roleTargets),
    '',
    'Preferred locations:',
    listOrFallback(preferredLocations),
    '',
    `Preferred work modes: ${(workspace.searchStrategy?.work_mode_preferences || []).join(', ') || 'Not configured'}`,
    `Target base: $${Number(workspace.searchStrategy?.compensation?.target_base_usd || 0).toLocaleString()}`,
    `Exception floor: $${Number(workspace.searchStrategy?.compensation?.exception_floor_usd || 0).toLocaleString()}`,
    '',
    'Rules:',
    '- Keep only live roles that plausibly fit the current targets.',
    '- Deduplicate against existing pipeline roles and existing sourced candidates already in the workspace.',
    '- Leave fields blank if uncertain instead of guessing.',
    '- Do not auto-submit or imply an application happened.',
    '- Human-gated fields stay human-confirmed only.',
    '',
    'Reusable safe answers:',
    listOrFallback(safeAnswers, '- None configured'),
    '',
    'Human-gated fields:',
    listOrFallback(humanGates, '- None configured'),
    '',
    'YAML template:',
    '```yaml',
    sourcingYamlTemplate(batchId),
    '```',
  ].join('\n');

  const markdown = [
    `# Find Jobs To Review`,
    '',
    `- Candidate: ${candidateName}`,
    `- Mode: ${mode === 'chat_upload' ? 'Chat-only assistant' : 'Folder-connected assistant'}`,
    `- Created: ${createdAt}`,
    `- Queue file: data/sourcing/candidates.yml`,
    `- Review note: ${reviewRelativePath}`,
    '',
    '## Instructions',
    '',
    prompt,
  ].join('\n');

  writeTextFile(path.join(workspacePath, outputTaskPack), markdown);

  return {
    task_type: 'source_opportunities',
    task_title: 'Find Jobs To Review',
    created_at: createdAt,
    output_task_pack: outputTaskPack,
    review_output_path: reviewRelativePath,
    queue_output_path: path.join('data', 'sourcing', 'candidates.yml'),
    prompt,
    checklist: [
      'Search the web for live roles that fit the current targets.',
      'Write the canonical queue file and the human-readable review note.',
      'Deduplicate against existing queue and pipeline data.',
      'Keep legal and sensitive data human-reviewed only.',
    ],
    recommended_files: [
      path.join('config', 'search-strategy.yml'),
      path.join('config', 'application-profile.yml'),
      path.join('data', 'pipeline', 'opportunities.yml'),
      path.join('data', 'sourcing', 'candidates.yml'),
    ],
  };
}
