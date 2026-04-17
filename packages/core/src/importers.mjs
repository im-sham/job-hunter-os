import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import yaml from 'js-yaml';
import { resolveWorkspacePath } from './workspace.mjs';

const CAREER_IMPORT_DIR = ['data', 'imports', 'career-base'];
const WRITING_IMPORT_DIR = ['writing', 'imported'];
const EXPERIENCE_HEADINGS = new Set([
  'experience',
  'professional experience',
  'work experience',
  'employment',
  'employment history',
]);
const SKILLS_HEADINGS = new Set([
  'skills',
  'core competencies',
  'competencies',
  'tools',
  'tooling',
  'expertise',
]);
const SUMMARY_HEADINGS = new Set([
  'about',
  'summary',
  'profile',
  'professional summary',
  'about me',
]);
const ROLE_TITLE_HINTS = [
  'manager',
  'director',
  'head',
  'lead',
  'program',
  'operations',
  'operator',
  'strategy',
  'chief',
  'vp',
  'vice president',
  'consultant',
  'analyst',
  'specialist',
  'coordinator',
];
const LOCATION_HINTS = [
  'remote',
  'hybrid',
  'onsite',
  'on-site',
  'new york',
  'brooklyn',
  'san francisco',
  'bay area',
  'boston',
  'austin',
  'seattle',
  'los angeles',
  'chicago',
  'miami',
  'united states',
  'usa',
  'uk',
  'london',
];

function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'import';
}

function normalizeText(text = '') {
  return String(text)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/[ \u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readYamlFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return yaml.load(fs.readFileSync(filePath, 'utf-8')) || fallback;
}

function writeYamlFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(value, { lineWidth: -1 }));
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value);
}

function flattenJsonStrings(value, output = []) {
  if (typeof value === 'string') {
    output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonStrings(item, output);
    return output;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) flattenJsonStrings(item, output);
  }
  return output;
}

function stripHtmlTags(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|h5|li|br|tr|section)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

async function extractTextFromPath(inputPath) {
  const extension = path.extname(inputPath).toLowerCase();

  if (extension === '.txt' || extension === '.md') {
    return normalizeText(fs.readFileSync(inputPath, 'utf-8'));
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: inputPath });
    return normalizeText(result.value);
  }

  if (extension === '.html' || extension === '.htm') {
    return normalizeText(stripHtmlTags(fs.readFileSync(inputPath, 'utf-8')));
  }

  if (extension === '.json') {
    const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
    return normalizeText(flattenJsonStrings(parsed).join('\n'));
  }

  if (extension === '.pdf') {
    throw new Error('PDF import is not supported yet. Convert the source to .docx, .txt, or .md first.');
  }

  throw new Error(`Unsupported import format: ${extension || 'unknown'}`);
}

function normalizeHeading(line = '') {
  return String(line)
    .replace(/^#+\s*/, '')
    .trim()
    .toLowerCase();
}

function isAllCapsHeading(line = '') {
  const trimmed = String(line).trim();
  return trimmed.length > 2 && trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
}

function findSectionLines(lines, headingSet) {
  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const normalized = normalizeHeading(lines[index]);
    if (headingSet.has(normalized)) {
      startIndex = index + 1;
      break;
    }
  }

  if (startIndex === -1) return [];

  const section = [];
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = normalizeHeading(line);
    if (
      section.length > 0 &&
      (isAllCapsHeading(line)
        || (normalized && (EXPERIENCE_HEADINGS.has(normalized) || SKILLS_HEADINGS.has(normalized)) && section.length > 2))
    ) {
      break;
    }
    section.push(line);
  }

  return section;
}

function compactLines(text = '') {
  return normalizeText(text)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

function trimBlanks(lines = []) {
  let start = 0;
  let end = lines.length;
  while (start < end && !String(lines[start]).trim()) start += 1;
  while (end > start && !String(lines[end - 1]).trim()) end -= 1;
  return lines.slice(start, end);
}

function inferCandidateName(lines = []) {
  for (const line of lines.slice(0, 6)) {
    if (!line) continue;
    if (line.length > 80) continue;
    if (/\bexperience\b|\bsummary\b|\bprofile\b/i.test(line)) continue;
    if (/[@|]/.test(line)) continue;
    if (/^\d/.test(line)) continue;
    const words = line.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.length <= 5) {
      return line;
    }
  }
  return '';
}

function inferHeadline(lines = [], candidateName = '') {
  for (const line of lines.slice(0, 10)) {
    if (!line || line === candidateName) continue;
    if (line.length > 140) continue;
    if (/[@|]/.test(line)) continue;
    if (EXPERIENCE_HEADINGS.has(normalizeHeading(line)) || SKILLS_HEADINGS.has(normalizeHeading(line))) continue;
    return line;
  }
  return '';
}

function findSectionBlocks(lines, headingSet) {
  const section = findSectionLines(lines, headingSet);
  if (!section.length) return [];
  return section
    .join('\n')
    .split(/\n\s*\n/)
    .map(block => compactLines(block))
    .filter(block => block.length > 0);
}

function looksLikeLocationLine(line = '') {
  const normalized = String(line).trim().toLowerCase();
  if (!normalized || normalized.length > 80) return false;
  if (/@/.test(normalized)) return false;
  return LOCATION_HINTS.some(hint => normalized.includes(hint))
    || /^[A-Za-z .'-]+,\s*[A-Z]{2}(?:\s|$)/.test(String(line).trim());
}

function looksLikeRoleTitle(line = '') {
  const normalized = String(line).trim().toLowerCase();
  return ROLE_TITLE_HINTS.some(hint => normalized.includes(hint));
}

function extractContactDetails(lines = []) {
  const topLines = lines.slice(0, 20);
  const text = topLines.join(' ');
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = text.match(/(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}/)?.[0] || '';
  const linkedin = text.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i)?.[0] || '';
  const website = text.match(/https?:\/\/(?!(?:www\.)?linkedin\.com)[^\s)]+/i)?.[0] || '';
  const location = topLines.find(looksLikeLocationLine) || '';

  return { email, phone, linkedin, website, location };
}

function extractProfileSummary(lines = [], candidateName = '', headline = '') {
  const summaryBlocks = findSectionBlocks(lines, SUMMARY_HEADINGS);
  if (summaryBlocks.length) {
    return summaryBlocks.flat().slice(0, 6);
  }

  const topLines = lines.slice(0, 18).filter(Boolean);
  const summary = [];
  for (const line of topLines) {
    if (line === candidateName || line === headline) continue;
    if (/@/.test(line)) continue;
    if (/linkedin\.com|http/i.test(line)) continue;
    if (EXPERIENCE_HEADINGS.has(normalizeHeading(line)) || SKILLS_HEADINGS.has(normalizeHeading(line))) break;
    if (looksLikeLocationLine(line)) continue;
    if (line.length < 20) continue;
    summary.push(line);
  }

  return summary.slice(0, 4);
}

function extractMetrics(lines = []) {
  const metricRegex = /(\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b|\b\d+(?:,\d{3})+\b|\b\d+\s*(?:M|MM|B|K)\b)/i;
  const values = [];
  const seen = new Set();

  for (const line of lines) {
    if (!metricRegex.test(line)) continue;
    const normalized = line.replace(/^[-*•]\s*/, '').trim();
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    values.push(normalized);
  }

  return values;
}

function tokenizeSkills(line = '') {
  return line
    .split(/[;,|]/)
    .map(part => part.trim())
    .filter(part => part && part.length <= 60);
}

function extractSkills(lines = []) {
  const skills = [];
  const seen = new Set();
  const skillSection = findSectionLines(lines, SKILLS_HEADINGS);

  for (const line of skillSection) {
    for (const skill of tokenizeSkills(line.replace(/^[-*•]\s*/, ''))) {
      const key = skill.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      skills.push(skill);
    }
  }

  return skills;
}

function parseDateRange(text = '') {
  const match = String(text).match(
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}))/i,
  );

  if (!match) return null;

  return {
    start: match[1],
    end: match[2],
  };
}

function looksLikeBullet(line = '') {
  return /^[-*•]/.test(line);
}

function parseHeaderLines(headerLines = []) {
  const cleaned = headerLines
    .map(line => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean);

  if (!cleaned.length) {
    return {
      company: 'Imported role',
      title: 'Role title to review',
    };
  }

  const joined = cleaned.join(' | ');
  const noDates = joined.replace(
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4})\s*(?:-|–|—|to)\s*((?:Present|Current|Now|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|\d{4}))/ig,
    '',
  ).trim();

  const pipeParts = noDates.split('|').map(part => part.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    if (looksLikeRoleTitle(pipeParts[0]) && !looksLikeRoleTitle(pipeParts[1])) {
      return {
        company: pipeParts[1],
        title: pipeParts[0],
      };
    }
    return {
      company: pipeParts[0],
      title: pipeParts[1],
    };
  }

  if (cleaned.length >= 2) {
    if (looksLikeRoleTitle(cleaned[0]) && !looksLikeRoleTitle(cleaned[1])) {
      return {
        company: cleaned[1],
        title: cleaned[0],
      };
    }
    if (!looksLikeRoleTitle(cleaned[0]) && looksLikeRoleTitle(cleaned[1])) {
      return {
        company: cleaned[0],
        title: cleaned[1],
      };
    }
    return {
      company: cleaned[0],
      title: cleaned[1],
    };
  }

  const dashParts = noDates.split(/ - | — | – /).map(part => part.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      company: dashParts[0],
      title: dashParts[1],
    };
  }

  return {
    company: cleaned[0],
    title: 'Role title to review',
  };
}

function splitExperienceIntoRoleBlocks(section = []) {
  const blocks = [];
  let current = [];
  let seenDate = false;

  for (let index = 0; index < section.length; index += 1) {
    const line = section[index];
    const isDateLine = Boolean(parseDateRange(line));

    if (isDateLine && seenDate && trimBlanks(current).length > 0) {
      blocks.push(trimBlanks(current));
      current = [];
      seenDate = false;
    }

    current.push(line);
    if (isDateLine) seenDate = true;

    if (!String(line).trim() && trimBlanks(current).length > 0) {
      const remainingHasDate = section.slice(index + 1).some(nextLine => Boolean(parseDateRange(nextLine)));
      if (seenDate && remainingHasDate) {
        blocks.push(trimBlanks(current));
        current = [];
        seenDate = false;
      }
    }
  }

  if (trimBlanks(current).length > 0) {
    blocks.push(trimBlanks(current));
  }

  return blocks.filter(block => block.length >= 2);
}

function parseExperienceRoles(lines = [], sourceId) {
  const section = findSectionLines(lines, EXPERIENCE_HEADINGS);
  if (!section.length) return [];

  const blocks = splitExperienceIntoRoleBlocks(section);
  const roles = [];

  for (const block of blocks) {
    const compactBlock = block.map(line => line.trim()).filter(line => line || looksLikeBullet(line));
    const dateIndex = compactBlock.findIndex(line => Boolean(parseDateRange(line)));
    const bullets = compactBlock.filter(looksLikeBullet).map(line => line.replace(/^[-*•]\s*/, '').trim());
    const nonBulletLines = compactBlock.filter(line => !looksLikeBullet(line) && line);
    const dateSource = nonBulletLines.join(' | ');
    const dates = parseDateRange(dateSource) || parseDateRange(compactBlock.join(' | '));
    let headerLines = dateIndex >= 0
      ? compactBlock.slice(Math.max(0, dateIndex - 3), dateIndex)
      : nonBulletLines.slice(0, 3);
    if (headerLines.length === 0 && dateIndex >= 0 && compactBlock[dateIndex]) {
      headerLines = [compactBlock[dateIndex]];
    }
    const parsedHeader = parseHeaderLines(headerLines);
    const narrativeLines = dateIndex >= 0
      ? compactBlock.slice(dateIndex + 1).filter(line => line && !looksLikeLocationLine(line))
      : nonBulletLines.slice(headerLines.length);
    const narrativeHighlights = narrativeLines.filter(Boolean).slice(0, 4);
    const highlights = (bullets.length ? bullets : narrativeHighlights).slice(0, 5);

    if (!dates || !highlights.length) continue;

    roles.push({
      company: parsedHeader.company,
      title: parsedHeader.title,
      start: dates.start,
      end: dates.end,
      source_id: sourceId,
      highlights,
    });
  }

  return roles;
}

function mergeUniqueStrings(existing = [], incoming = []) {
  const seen = new Set(existing.map(value => String(value).toLowerCase()));
  const merged = [...existing];

  for (const item of incoming) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  return merged;
}

function mergeUniqueRoles(existing = [], incoming = []) {
  const keyFor = role => [
    String(role.company || '').toLowerCase(),
    String(role.title || '').toLowerCase(),
    String(role.start || '').toLowerCase(),
    String(role.end || '').toLowerCase(),
  ].join('::');

  const seen = new Set(existing.map(keyFor));
  const merged = [...existing];

  for (const role of incoming) {
    const key = keyFor(role);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(role);
  }

  return merged;
}

function ensureSourceDocument(config, entry) {
  config.source_documents = Array.isArray(config.source_documents) ? config.source_documents : [];
  const exists = config.source_documents.some(document => document.id === entry.id);
  if (!exists) {
    config.source_documents.push(entry);
  }
}

function ensureSampleSource(config, sourcePath) {
  config.sample_sources = Array.isArray(config.sample_sources) ? config.sample_sources : [];
  if (!config.sample_sources.includes(sourcePath)) {
    config.sample_sources.push(sourcePath);
  }
}

function mergeSummaryItems(existing = [], incoming = []) {
  const current = Array.isArray(existing) ? existing : [];
  const byId = new Map(current.map(item => [item.id, item]));
  for (const item of incoming) {
    const previous = byId.get(item.id) || {};
    byId.set(item.id, {
      ...previous,
      ...item,
    });
  }
  return [...byId.values()];
}

function isPlaceholderName(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'your name' || normalized === 'candidate';
}

function isPlaceholderHeadline(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return !normalized || normalized === 'your target role or professional headline';
}

export async function importCareerSource({ workspaceArg, inputPath, kind = 'resume', label = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const absoluteInputPath = path.resolve(inputPath);
  const text = await extractTextFromPath(absoluteInputPath);
  const rawLines = normalizeText(text)
    .split('\n')
    .map(line => line.trim());
  const nonBlankLines = rawLines.filter(Boolean);
  const sourceId = slugify(label || path.basename(absoluteInputPath, path.extname(absoluteInputPath)));
  const destinationRelativePath = path.join(...CAREER_IMPORT_DIR, `${sourceId}.md`);
  const destinationPath = path.join(workspacePath, destinationRelativePath);
  const importedAt = new Date().toISOString();

  writeTextFile(destinationPath, text);

  const careerBasePath = path.join(workspacePath, 'config', 'career-base.yml');
  const inventoryPath = path.join(workspacePath, 'data', 'career-base', 'experience-inventory.yml');
  const careerBaseConfig = readYamlFile(careerBasePath, { version: 1, candidate: {}, source_documents: [], status: {} });
  const inventory = readYamlFile(inventoryPath, { version: 1, roles: [], metrics_inventory: [], skills_map: [], source_extractions: [] });

  const parsedName = inferCandidateName(nonBlankLines);
  const parsedHeadline = inferHeadline(nonBlankLines, parsedName);
  const parsedSummary = extractProfileSummary(rawLines, parsedName, parsedHeadline);
  const parsedContact = extractContactDetails(nonBlankLines);
  const parsedRoles = parseExperienceRoles(rawLines, sourceId);
  const parsedMetrics = extractMetrics(nonBlankLines);
  const parsedSkills = extractSkills(rawLines);

  careerBaseConfig.candidate = careerBaseConfig.candidate || {};
  if (isPlaceholderName(careerBaseConfig.candidate.full_name) && parsedName) {
    careerBaseConfig.candidate.full_name = parsedName;
  }
  if (isPlaceholderHeadline(careerBaseConfig.candidate.headline) && parsedHeadline) {
    careerBaseConfig.candidate.headline = parsedHeadline;
  }
  if ((!careerBaseConfig.candidate.location || careerBaseConfig.candidate.location === 'Your City, ST') && parsedContact.location) {
    careerBaseConfig.candidate.location = parsedContact.location;
  }
  if (!careerBaseConfig.candidate.email && parsedContact.email) {
    careerBaseConfig.candidate.email = parsedContact.email;
  }
  if (!careerBaseConfig.candidate.phone && parsedContact.phone) {
    careerBaseConfig.candidate.phone = parsedContact.phone;
  }
  careerBaseConfig.candidate.links = careerBaseConfig.candidate.links || {};
  if (!careerBaseConfig.candidate.links.linkedin && parsedContact.linkedin) {
    careerBaseConfig.candidate.links.linkedin = parsedContact.linkedin;
  }
  if (!careerBaseConfig.candidate.links.website && parsedContact.website) {
    careerBaseConfig.candidate.links.website = parsedContact.website;
  }

  ensureSourceDocument(careerBaseConfig, {
    id: sourceId,
    kind,
    filename: path.basename(absoluteInputPath),
    imported_at: importedAt,
    normalized_text: destinationRelativePath,
  });
  careerBaseConfig.status = {
    ...(careerBaseConfig.status || {}),
    import_complete: true,
    chronology_reviewed: false,
    metrics_reviewed: false,
  };

  inventory.roles = mergeUniqueRoles(Array.isArray(inventory.roles) ? inventory.roles : [], parsedRoles);
  inventory.metrics_inventory = mergeUniqueStrings(Array.isArray(inventory.metrics_inventory) ? inventory.metrics_inventory : [], parsedMetrics);
  inventory.skills_map = mergeUniqueStrings(Array.isArray(inventory.skills_map) ? inventory.skills_map : [], parsedSkills);
  inventory.summary_inventory = mergeSummaryItems(inventory.summary_inventory, [{
    id: sourceId,
    kind,
    headline: parsedHeadline,
    summary_lines: parsedSummary,
    contact: parsedContact,
  }]);
  inventory.source_extractions = Array.isArray(inventory.source_extractions) ? inventory.source_extractions : [];
  inventory.source_extractions.push({
    id: sourceId,
    kind,
    imported_at: importedAt,
    normalized_text: destinationRelativePath,
    roles_added: parsedRoles.length,
    metrics_added: parsedMetrics.length,
    skills_added: parsedSkills.length,
    summary_lines_added: parsedSummary.length,
  });

  writeYamlFile(careerBasePath, careerBaseConfig);
  writeYamlFile(inventoryPath, inventory);

  return {
    source_id: sourceId,
    workspace_path: workspacePath,
    imported_text: destinationRelativePath,
    roles_added: parsedRoles.length,
    metrics_added: parsedMetrics.length,
    skills_added: parsedSkills.length,
    summary_lines_added: parsedSummary.length,
  };
}

export async function importWritingSample({ workspaceArg, inputPath, label = '' }) {
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const absoluteInputPath = path.resolve(inputPath);
  const text = await extractTextFromPath(absoluteInputPath);
  const sourceId = slugify(label || path.basename(absoluteInputPath, path.extname(absoluteInputPath)));
  const destinationRelativePath = path.join(...WRITING_IMPORT_DIR, `${sourceId}.md`);
  const destinationPath = path.join(workspacePath, destinationRelativePath);
  const importedAt = new Date().toISOString();

  writeTextFile(destinationPath, text);

  const voiceProfilePath = path.join(workspacePath, 'config', 'voice-profile.yml');
  const voiceProfile = readYamlFile(voiceProfilePath, { version: 1, sample_sources: [], voice_traits: [], defaults: {}, status: {} });
  ensureSampleSource(voiceProfile, destinationRelativePath);
  voiceProfile.status = {
    ...(voiceProfile.status || {}),
    calibrated: false,
    reviewer_notes: 'Review imported samples and regenerate the voice guide before relying on this profile.',
    last_imported_at: importedAt,
  };

  writeYamlFile(voiceProfilePath, voiceProfile);

  return {
    source_id: sourceId,
    workspace_path: workspacePath,
    imported_text: destinationRelativePath,
    word_count: normalizeText(text).split(/\s+/).filter(Boolean).length,
  };
}
