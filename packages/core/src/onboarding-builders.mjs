import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { loadWorkspace, resolveWorkspacePath } from './workspace.mjs';

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'because',
  'by',
  'for',
  'from',
  'has',
  'have',
  'i',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'their',
  'this',
  'to',
  'was',
  'we',
  'with',
  'you',
  'your',
]);

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeYamlFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, yaml.dump(value, { lineWidth: -1 }));
}

function writeTextFile(filePath, value) {
  ensureParentDir(filePath);
  fs.writeFileSync(filePath, value);
}

function relativeToWorkspace(workspacePath, filePath) {
  return path.relative(workspacePath, filePath);
}

function toMarkdownList(items = [], fallback = '- None yet') {
  if (!items.length) return fallback;
  return items.map(item => `- ${item}`).join('\n');
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function collectRoleHighlights(roles = []) {
  return roles.flatMap(role => (role.highlights || []).map(highlight => ({
    company: role.company,
    title: role.title,
    text: highlight,
  })));
}

function summarizeImportedSignals(summaryInventory = []) {
  const lines = [];
  for (const item of summaryInventory) {
    if (item.headline) {
      lines.push(`${item.kind || 'source'} headline: ${item.headline}`);
    }
    for (const line of (item.summary_lines || [])) {
      lines.push(line);
    }
  }
  return [...new Set(lines)];
}

function renderContactSummary(summaryInventory = []) {
  const contacts = [];
  for (const item of summaryInventory) {
    const contact = item.contact || {};
    if (contact.email) contacts.push(`Email: ${contact.email}`);
    if (contact.phone) contacts.push(`Phone: ${contact.phone}`);
    if (contact.location) contacts.push(`Location: ${contact.location}`);
    if (contact.linkedin) contacts.push(`LinkedIn: ${contact.linkedin}`);
    if (contact.website) contacts.push(`Website: ${contact.website}`);
  }
  return [...new Set(contacts)];
}

export function buildCareerBaseArtifacts(workspaceArg) {
  const workspace = loadWorkspace(workspaceArg);
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const candidate = workspace.careerBaseConfig?.candidate || {};
  const roles = workspace.experienceInventory?.roles || [];
  const metrics = workspace.experienceInventory?.metrics_inventory || [];
  const skills = workspace.experienceInventory?.skills_map || [];
  const summaryInventory = workspace.experienceInventory?.summary_inventory || [];
  const topHighlights = collectRoleHighlights(roles).slice(0, 6);
  const summaryInputs = summarizeImportedSignals(summaryInventory);
  const contactSignals = renderContactSummary(summaryInventory);

  if (!roles.length) {
    throw new Error('Career Base build requires at least one role in data/career-base/experience-inventory.yml');
  }

  const masterExperiencePath = path.join(
    workspacePath,
    'data',
    'career-base',
    'master-experience.generated.md',
  );
  const buildReportPath = path.join(
    workspacePath,
    'data',
    'career-base',
    'career-base-build.yml',
  );

  const markdown = [
    `# ${candidate.full_name || 'Candidate'} Master Experience Draft`,
    '',
    '## Headline',
    '',
    candidate.headline || 'Add a target role headline here.',
    '',
    '## Imported Summary Inputs',
    '',
    toMarkdownList(summaryInputs, '- No summary inputs imported yet'),
    '',
    '## Contact Signals',
    '',
    toMarkdownList(contactSignals, '- No contact signals imported yet'),
    '',
    '## Source Material',
    '',
    toMarkdownList((workspace.careerBaseConfig?.source_documents || []).map(document => (
      `${document.kind || 'document'}: ${document.filename || document.id || 'unknown file'}`
    ))),
    '',
    '## Reusable Strengths',
    '',
    toMarkdownList(topHighlights.map(item => `${item.text} (${item.company} — ${item.title})`)),
    '',
    '## Experience Chronology',
    '',
    roles.map(role => [
      `### ${role.company} — ${role.title}`,
      '',
      `${role.start || 'Unknown start'} to ${role.end || 'Present'}`,
      '',
      toMarkdownList(role.highlights || []),
    ].join('\n')).join('\n\n'),
    '',
    '## Metrics Inventory',
    '',
    toMarkdownList(metrics),
    '',
    '## Skills Map',
    '',
    toMarkdownList(skills),
    '',
  ].join('\n');

  const report = {
    generated_at: new Date().toISOString(),
    role_count: roles.length,
    metric_count: metrics.length,
    skill_count: skills.length,
    output: relativeToWorkspace(workspacePath, masterExperiencePath),
  };

  writeTextFile(masterExperiencePath, markdown);
  writeYamlFile(buildReportPath, report);

  return {
    ...report,
    workspace_path: workspacePath,
  };
}

function splitSentences(text) {
  return String(text)
    .split(/[.!?]+/)
    .map(sentence => sentence.trim())
    .filter(Boolean);
}

function splitWords(text) {
  return String(text)
    .toLowerCase()
    .match(/[a-z][a-z'-]+/g) || [];
}

function countMatches(text, regex) {
  return (String(text).match(regex) || []).length;
}

function average(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function topTerms(texts, limit = 10) {
  const counts = new Map();
  for (const text of texts) {
    for (const word of splitWords(text)) {
      if (STOP_WORDS.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([term, count]) => ({ term, count }));
}

function topBigrams(texts, limit = 8) {
  const counts = new Map();
  for (const text of texts) {
    const words = splitWords(text).filter(word => !STOP_WORDS.has(word));
    for (let index = 0; index < words.length - 1; index += 1) {
      const phrase = `${words[index]} ${words[index + 1]}`;
      counts.set(phrase, (counts.get(phrase) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count }));
}

function lexicalDiversity(texts = []) {
  const words = texts.flatMap(splitWords);
  if (!words.length) return 0;
  return round2(new Set(words).size / words.length);
}

function paragraphLengths(text = '') {
  return String(text)
    .split(/\n\s*\n/)
    .map(paragraph => splitWords(paragraph).length)
    .filter(length => length > 0);
}

function stripVoiceBoilerplate(text = '') {
  return String(text)
    .replace(/^#+\s.*$/gim, '')
    .replace(/^dear\b.*$/gim, '')
    .replace(/^(best|thanks|sincerely|regards),?.*$/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractOpeningSentences(texts = [], limit = 5) {
  return texts
    .flatMap(text => splitSentences(stripVoiceBoilerplate(text)).slice(0, 1))
    .map(sentence => sentence.trim())
    .filter(Boolean)
    .slice(0, limit);
}

function countEvidenceMarkers(texts = []) {
  const pattern = /(\$[\d,.]+|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?x\b|\b\d+(?:,\d{3})+\b|\b\d+\s*(?:M|MM|B|K)\b)/gi;
  return texts.reduce((sum, text) => sum + (String(text).match(pattern) || []).length, 0);
}

function countHedges(texts = []) {
  const pattern = /\b(maybe|might|could|fairly|somewhat|perhaps|likely|generally|roughly)\b/gi;
  return texts.reduce((sum, text) => sum + (String(text).match(pattern) || []).length, 0);
}

function countActionVerbs(texts = []) {
  const pattern = /\b(built|led|launched|reduced|improved|designed|created|ran|drove|scaled|owned|delivered)\b/gi;
  return texts.reduce((sum, text) => sum + (String(text).match(pattern) || []).length, 0);
}

function deriveVoiceRecommendations(aggregate) {
  const recommendations = [];

  if (aggregate.average_sentence_length <= 16) {
    recommendations.push('Keep sentence length compact and direct.');
  } else {
    recommendations.push('Trim long explanatory sentences when drafting for applications.');
  }

  if (aggregate.evidence_marker_count > 0) {
    recommendations.push('Preserve the habit of grounding claims in concrete evidence.');
  } else {
    recommendations.push('Introduce more quantified proof points when possible.');
  }

  if (aggregate.hedge_count <= 1) {
    recommendations.push('Maintain the low-hedge, confident tone.');
  } else {
    recommendations.push('Reduce hedge words when stronger ownership language is warranted.');
  }

  if (aggregate.first_person_ratio >= 0.04) {
    recommendations.push('First-person ownership is part of the voice; keep it purposeful, not repetitive.');
  } else {
    recommendations.push('The voice stays restrained; add first-person ownership only where it clarifies accountability.');
  }

  return recommendations;
}

function deriveVoiceWatchouts(aggregate) {
  const watchouts = [];

  if (aggregate.sample_count < 2) {
    watchouts.push('Calibration is still thin; add more samples before treating this as stable.');
  }
  if (aggregate.total_words < 150) {
    watchouts.push('Sample set is short, so style signals may be noisy.');
  }
  if (aggregate.exclamation_count > 0) {
    watchouts.push('Avoid drifting into higher-emphasis punctuation if you want the voice to stay measured.');
  }
  if (aggregate.average_paragraph_length > 60) {
    watchouts.push('Break up dense paragraphs for job-search writing where skim speed matters.');
  }

  return watchouts;
}

function deriveStyleSignals({ averageSentenceLength, firstPersonRatio, exclamationCount, questionCount }) {
  const signals = [];

  signals.push(
    averageSentenceLength <= 16
      ? 'prefers concise sentence structure'
      : 'uses medium-length explanatory sentences'
  );

  if (firstPersonRatio >= 0.04) {
    signals.push('leans into first-person ownership language');
  } else {
    signals.push('keeps self-reference fairly restrained');
  }

  if (exclamationCount === 0) {
    signals.push('uses restrained emphasis');
  } else {
    signals.push('occasionally uses high-emphasis punctuation');
  }

  if (questionCount > 0) {
    signals.push('sometimes uses rhetorical framing');
  }

  return signals;
}

export function buildVoiceCalibrationArtifacts(workspaceArg) {
  const workspace = loadWorkspace(workspaceArg);
  const workspacePath = resolveWorkspacePath(workspaceArg);
  const sampleSources = workspace.voiceProfile?.sample_sources || [];

  if (!sampleSources.length) {
    throw new Error('Voice Calibration build requires at least one sample source in config/voice-profile.yml');
  }

  const sampleAnalyses = sampleSources.map(source => {
    const filePath = path.join(workspacePath, source);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Voice sample not found: ${source}`);
    }

    const text = fs.readFileSync(filePath, 'utf-8');
    const sentences = splitSentences(text);
    const words = splitWords(text);
    const averageSentenceLength = average(sentences.map(sentence => splitWords(sentence).length));
    const firstPersonCount = countMatches(text, /\b(I|I'm|I’ve|I'd|my|me)\b/gi);

    return {
      source,
      word_count: words.length,
      sentence_count: sentences.length,
      average_sentence_length: Number(averageSentenceLength.toFixed(1)),
      first_person_count: firstPersonCount,
      exclamation_count: countMatches(text, /!/g),
      question_count: countMatches(text, /\?/g),
    };
  });

  const allTexts = sampleSources.map(source => fs.readFileSync(path.join(workspacePath, source), 'utf-8'));
  const totalWords = sampleAnalyses.reduce((sum, sample) => sum + sample.word_count, 0);
  const totalSentences = sampleAnalyses.reduce((sum, sample) => sum + sample.sentence_count, 0);
  const firstPersonCount = sampleAnalyses.reduce((sum, sample) => sum + sample.first_person_count, 0);
  const exclamationCount = sampleAnalyses.reduce((sum, sample) => sum + sample.exclamation_count, 0);
  const questionCount = sampleAnalyses.reduce((sum, sample) => sum + sample.question_count, 0);
  const averageSentenceLength = Number(average(sampleAnalyses.map(sample => sample.average_sentence_length)).toFixed(1));
  const averageParagraphLength = Number(average(allTexts.flatMap(paragraphLengths)).toFixed(1));
  const firstPersonRatio = totalWords ? Number((firstPersonCount / totalWords).toFixed(3)) : 0;
  const lexicalVariety = lexicalDiversity(allTexts);
  const evidenceMarkerCount = countEvidenceMarkers(allTexts);
  const hedgeCount = countHedges(allTexts);
  const actionVerbCount = countActionVerbs(allTexts);

  const aggregate = {
    generated_at: new Date().toISOString(),
    sample_count: sampleAnalyses.length,
    total_words: totalWords,
    total_sentences: totalSentences,
    average_sentence_length: averageSentenceLength,
    average_paragraph_length: averageParagraphLength,
    first_person_ratio: firstPersonRatio,
    exclamation_count: exclamationCount,
    question_count: questionCount,
    lexical_diversity: lexicalVariety,
    evidence_marker_count: evidenceMarkerCount,
    hedge_count: hedgeCount,
    action_verb_count: actionVerbCount,
    configured_traits: workspace.voiceProfile?.voice_traits || [],
    top_terms: topTerms(allTexts),
    top_bigrams: topBigrams(allTexts),
    opening_sentences: extractOpeningSentences(allTexts),
    style_signals: deriveStyleSignals({
      averageSentenceLength,
      firstPersonRatio,
      exclamationCount,
      questionCount,
    }),
    recommendations: [],
    watchouts: [],
  };
  aggregate.recommendations = deriveVoiceRecommendations(aggregate);
  aggregate.watchouts = deriveVoiceWatchouts(aggregate);

  const analysisPath = path.join(workspacePath, 'data', 'voice', 'voice-analysis.yml');
  const guidePath = path.join(workspacePath, 'data', 'voice', 'voice-guide.generated.md');

  const guide = [
    '# Voice Guide',
    '',
    '## Configured Traits',
    '',
    toMarkdownList(aggregate.configured_traits),
    '',
    '## Observed Style Signals',
    '',
    toMarkdownList(aggregate.style_signals),
    '',
    '## Recommendations',
    '',
    toMarkdownList(aggregate.recommendations),
    '',
    '## Watchouts',
    '',
    toMarkdownList(aggregate.watchouts, '- No obvious watchouts from the current sample set'),
    '',
    '## Top Repeated Terms',
    '',
    toMarkdownList(aggregate.top_terms.map(entry => `${entry.term} (${entry.count})`)),
    '',
    '## Repeated Phrases',
    '',
    toMarkdownList(aggregate.top_bigrams.map(entry => `${entry.phrase} (${entry.count})`), '- No strong repeated phrases yet'),
    '',
    '## Opening Sentence Patterns',
    '',
    toMarkdownList(aggregate.opening_sentences, '- No opener patterns captured yet'),
    '',
    '## Quant Signals',
    '',
    toMarkdownList([
      `Average sentence length: ${aggregate.average_sentence_length}`,
      `Average paragraph length: ${aggregate.average_paragraph_length}`,
      `Lexical diversity: ${aggregate.lexical_diversity}`,
      `Evidence markers: ${aggregate.evidence_marker_count}`,
      `Action verb count: ${aggregate.action_verb_count}`,
      `Hedge count: ${aggregate.hedge_count}`,
    ]),
    '',
    '## Sample Coverage',
    '',
    toMarkdownList(sampleAnalyses.map(sample => (
      `${sample.source}: ${sample.word_count} words, ${sample.average_sentence_length} avg words/sentence`
    ))),
    '',
  ].join('\n');

  writeYamlFile(analysisPath, {
    aggregate,
    samples: sampleAnalyses,
  });
  writeTextFile(guidePath, guide);

  return {
    generated_at: aggregate.generated_at,
    sample_count: aggregate.sample_count,
    output_analysis: relativeToWorkspace(workspacePath, analysisPath),
    output_guide: relativeToWorkspace(workspacePath, guidePath),
  };
}

export function buildOnboardingArtifacts(workspaceArg) {
  return {
    career_base: buildCareerBaseArtifacts(workspaceArg),
    voice_calibration: buildVoiceCalibrationArtifacts(workspaceArg),
  };
}
