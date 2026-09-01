import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const repoRoot = path.join(codexRoot, '..');
const nodesDir = path.join(repoRoot, 'knowledge-tree', 'nodes');
const targetTopicsDir = path.join(codexRoot, 'src', 'content', 'topics');
const dataDir = path.join(codexRoot, 'data');
const docsDir = path.join(codexRoot, 'docs');

if (!fs.existsSync(targetTopicsDir)) fs.mkdirSync(targetTopicsDir, { recursive: true });
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });

console.log('🚀 Initiating Full Corpus Migration & Knowledge Inventory...');

const sourceFiles = fs.readdirSync(nodesDir).filter((f) => f.endsWith('.md')).sort();
console.log(`Found ${sourceFiles.length} source chapters in ${nodesDir}`);

interface ChapterMeta {
  sourceFile: string;
  targetFile: string;
  slug: string;
  volume: number;
  volumeTitle: string;
  orderInVolume: number;
  title: string;
  archetype: 'CANONICAL_CONCEPT' | 'MASTERCLASS_LECTURE' | 'DIALECTIC_ESSAY' | 'TACTICAL_FRAMEWORK';
  archetypeConfidence: 'HIGH' | 'MEDIUM';
  archetypeReason: string;
  readingTimeMinutes: number;
  summary15s: string;
  tags: string[];
  stats: {
    wordCount: number;
    headingCount: number;
    h3Count: number;
    h4Count: number;
    paragraphCount: number;
    diagramCount: number;
    tableCount: number;
    blockquoteCount: number;
    codeBlockCount: number;
    mathCount: number;
    internalLinkCount: number;
    externalLinkCount: number;
  };
  inventory: {
    concepts: string[];
    mentalModels: string[];
    heuristics: string[];
    claims: string[];
    sources: string[];
  };
}

const corpusInventory: ChapterMeta[] = [];

function countWords(str: string): number {
  return str.trim().split(/\s+/).filter(Boolean).length;
}

function classifyArchetype(title: string, content: string): { archetype: ChapterMeta['archetype']; confidence: 'HIGH' | 'MEDIUM'; reason: string } {
  const t = title.toLowerCase();

  if (t.includes('pedagogy') || t.includes('writing') || t.includes('lecture') || t.includes('mit formula') || t.includes('craft')) {
    return { archetype: 'MASTERCLASS_LECTURE', confidence: 'HIGH', reason: 'Focuses on pedagogical transmission, writing craft, and educational delivery mechanics.' };
  }
  if (t.includes('supercommunication') || t.includes('conversation') || t.includes('spontaneous') || t.includes('protocol') || t.includes('morning') || t.includes('modes of execution') || t.includes('reset') || t.includes('outworking')) {
    return { archetype: 'TACTICAL_FRAMEWORK', confidence: 'HIGH', reason: 'Presents concrete action sequences, behavioral execution rules, and conversational protocols.' };
  }
  if (t.includes('paradox') || t.includes('pathology') || t.includes('fallacy') || t.includes('social fiction') || t.includes('iron cage') || t.includes('anomie') || t.includes('sociological') || t.includes('solitude') || t.includes('void') || t.includes('currencies of capital') || t.includes('philosoph')) {
    return { archetype: 'DIALECTIC_ESSAY', confidence: 'HIGH', reason: 'Deconstructs cultural illusions, philosophical paradoxes, and sociological status dynamics.' };
  }
  if (t.includes('neurobiology') || t.includes('neurochemistry') || t.includes('second brain') || t.includes('dopamine') || t.includes('supernormal') || t.includes('memory') || t.includes('meditation') || t.includes('cognitive') || t.includes('hydraulic') || t.includes('engine of wealth') || t.includes('pareto') || t.includes('marginal gains') || t.includes('biases') || t.includes('confidence') || t.includes('fulfillment') || t.includes('indiscipline') || t.includes('overthinking') || t.includes('consistency') || t.includes('comparison') || t.includes('self-knowledge') || t.includes('purpose') || t.includes('firewall') || t.includes('emotional granularity') || t.includes('integrated strength') || t.includes('resonance')) {
    return { archetype: 'CANONICAL_CONCEPT', confidence: 'HIGH', reason: 'Systematic first-principles breakdown of biological, cognitive, or financial mechanics.' };
  }

  return { archetype: 'CANONICAL_CONCEPT', confidence: 'MEDIUM', reason: 'Defaulted to canonical concept based on general structural deconstruction.' };
}

function extractInventory(content: string) {
  const concepts: string[] = [];
  const mentalModels: string[] = [];
  const heuristics: string[] = [];
  const claims: string[] = [];
  const sources: string[] = [];

  const boldMatches = content.match(/\*\*([^*]+)\*\*/g) || [];
  for (const b of boldMatches) {
    const clean = b.replace(/\*\*/g, '').trim();
    if (clean.length > 3 && clean.length < 50 && !clean.includes(':') && !clean.startsWith('Step') && !clean.startsWith('Rule') && !clean.startsWith('The Core')) {
      if (!concepts.includes(clean) && concepts.length < 8) {
        concepts.push(clean);
      }
    }
  }

  const h3Matches = content.match(/^###\s+([^\n]+)/gm) || [];
  for (const h of h3Matches) {
    const clean = h.replace(/^###\s+/, '').replace(/^\d+\.\s*/, '').trim();
    if (clean.toLowerCase().includes('model') || clean.toLowerCase().includes('law') || clean.toLowerCase().includes('engine') || clean.toLowerCase().includes('paradox') || clean.toLowerCase().includes('invariant') || clean.toLowerCase().includes('loop')) {
      mentalModels.push(clean);
    } else if (clean.toLowerCase().includes('protocol') || clean.toLowerCase().includes('heuristic') || clean.toLowerCase().includes('rule') || clean.toLowerCase().includes('step')) {
      heuristics.push(clean);
    }
  }

  const sourcePatterns = [
    /Huberman/gi, /McEnerney/gi, /Dweck/gi, /Bandura/gi, /Yerkes-Dodson/gi, /Ebbinghaus/gi,
    /Marlatt/gi, /Baumeister/gi, /Csikszentmihalyi/gi, /Kahneman/gi, /Tversky/gi,
    /Feynman/gi, /Goffman/gi, /Durkheim/gi, /Weber/gi, /Cialdini/gi, /Noa Kageyama/gi,
    /School of Life/gi, /Alastair/gi, /Patricia Zurita Ona/gi, /Charles Duhigg/gi
  ];

  for (const p of sourcePatterns) {
    const match = content.match(p);
    if (match) {
      const name = match[0];
      if (!sources.includes(name)) sources.push(name);
    }
  }

  return { concepts, mentalModels, heuristics, claims, sources };
}

function extractSummary(content: string): string {
  const bqMatch = content.match(/>\s*([^\n>]+(?:\n>\s*[^\n>]+)*)\s*$/);
  if (bqMatch) {
    const clean = bqMatch[1].replace(/\n>\s*/g, ' ').replace(/^["“]|["”]$/g, '').trim();
    if (clean.length >= 25) {
      return clean.slice(0, 300);
    }
  }

  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length >= 40 && !trimmed.startsWith('#') && !trimmed.startsWith('>') && !trimmed.startsWith('```') && !trimmed.startsWith('*') && !trimmed.startsWith('-')) {
      return trimmed.slice(0, 300);
    }
  }

  return "First-principles structural deconstruction of cognitive, behavioral, and communication invariants.";
}

function extractTags(title: string, content: string): string[] {
  const tags = new Set<string>();
  const text = (title + ' ' + content).toLowerCase();

  const tagMap: Record<string, string[]> = {
    'neurobiology': ['neurobiology', 'vagus nerve', 'brain', 'enteric', 'prefrontal', 'amygdala', 'dopamine', 'serotonin', 'cortisol'],
    'metacognition': ['metacognition', 'overthinking', 'bias', 'mindset', 'cognitive', 'self-trust'],
    'execution': ['execution', 'action', 'habit', 'friction', 'procrastination', 'discipline', 'consistency'],
    'communication': ['communication', 'writing', 'pedagogy', 'conversation', 'speaking', 'rapport', 'social'],
    'wealth': ['wealth', 'capital', 'compounding', 'debt', 'cashflow', 'rent vs buy', 'investing'],
    'resilience': ['resilience', 'solitude', 'stoic', 'adversity', 'stress', 'hormesis', 'confidence']
  };

  for (const [tag, keywords] of Object.entries(tagMap)) {
    if (keywords.some((k) => text.includes(k))) {
      tags.add(tag);
    }
  }

  if (tags.size === 0) tags.add('mental-models');
  return Array.from(tags).slice(0, 4);
}

for (const file of sourceFiles) {
  const filePath = path.join(nodesDir, file);
  const rawContent = fs.readFileSync(filePath, 'utf8');

  const volMatch = rawContent.match(/^#\s+Volume\s+(\d+):\s*([^\n]+)/m);
  const volume = volMatch ? parseInt(volMatch[1], 10) : 1;
  const volumeTitle = volMatch ? volMatch[2].trim() : 'Master Foundations';

  const chMatch = rawContent.match(/^##\s+Chapter\s+(\d+):\s*([^\n]+)/m);
  const orderInVolume = chMatch ? parseInt(chMatch[1], 10) : 1;
  const rawTitle = chMatch ? chMatch[2].trim() : file.replace(/\.md$/, '').replace(/^chapter-\d+-/, '').replace(/-/g, ' ');

  const baseSlug = file.replace(/\.md$/, '').replace(/^chapter-\d+-/, '');
  const slug = baseSlug.length > 0 ? baseSlug : `topic-vol${volume}-${orderInVolume}`;

  let body = rawContent
    .replace(/^#\s+Volume\s+\d+:[^\n]*\n+/m, '')
    .replace(/^##\s+Chapter\s+\d+:[^\n]*\n+/m, '')
    .trim();

  const wordCount = countWords(body);
  const headingCount = (body.match(/^#{1,6}\s+/gm) || []).length;
  const h3Count = (body.match(/^###\s+/gm) || []).length;
  const h4Count = (body.match(/^####\s+/gm) || []).length;
  const paragraphCount = body.split(/\n\n+/).filter((p) => !p.startsWith('#') && !p.startsWith('```') && p.trim().length > 0).length;
  const diagramCount = (body.match(/```mermaid/g) || []).length;
  const tableCount = (body.match(/\|[^\n]+\|/g) ? 1 : 0);
  const blockquoteCount = (body.match(/^>\s+/gm) || []).length;
  const codeBlockCount = (body.match(/```(?!mermaid)[a-z0-9]*/gi) || []).length;
  const mathCount = (body.match(/\$\$|\$[^$\n]+\$/g) || []).length;
  const internalLinkCount = (body.match(/\[\[[^\]]+\]\]/g) || []).length;
  const externalLinkCount = (body.match(/\[[^\]]+\]\(https?:\/\/[^\)]+\)/g) || []).length;

  const { archetype, confidence, reason } = classifyArchetype(rawTitle, body);
  const summary15s = extractSummary(body);
  const tags = extractTags(rawTitle, body);
  const inventory = extractInventory(body);
  const readingTimeMinutes = Math.max(3, Math.ceil(wordCount / 180));

  const meta: ChapterMeta = {
    sourceFile: file,
    targetFile: `${slug}.md`,
    slug,
    volume,
    volumeTitle,
    orderInVolume,
    title: rawTitle,
    archetype,
    archetypeConfidence: confidence,
    archetypeReason: reason,
    readingTimeMinutes,
    summary15s,
    tags,
    stats: {
      wordCount,
      headingCount,
      h3Count,
      h4Count,
      paragraphCount,
      diagramCount,
      tableCount,
      blockquoteCount,
      codeBlockCount,
      mathCount,
      internalLinkCount,
      externalLinkCount
    },
    inventory
  };

  corpusInventory.push(meta);

  const mentalModelsYaml = inventory.mentalModels.length > 0
    ? `mental_models:\n${inventory.mentalModels.map((m) => `  - "${m.replace(/"/g, '\\"')}"`).join('\n')}`
    : `mental_models: []`;

  const tagsYaml = tags.length > 0
    ? `tags:\n${tags.map((t) => `  - "${t}"`).join('\n')}`
    : `tags: []`;

  const frontmatter = `---
id: "${slug}"
title: "${rawTitle.replace(/"/g, '\\"')}"
volume: ${volume}
volume_title: "${volumeTitle.replace(/"/g, '\\"')}"
order_in_volume: ${orderInVolume}
archetype: "${archetype}"
reading_time_minutes: ${readingTimeMinutes}
summary_15s: "${summary15s.replace(/"/g, '\\"')}"
${tagsYaml}
${mentalModelsYaml}
relationships:
  prerequisites: []
  builds_on: []
  contrasts_with: []
  applies_to: []
sources: []
active_recall: []
last_updated: "2026-09-01"
---

${body}
`;

  const targetPath = path.join(targetTopicsDir, `${slug}.md`);
  fs.writeFileSync(targetPath, frontmatter, 'utf8');
}

console.log(`✅ Successfully migrated all ${corpusInventory.length} chapters to ${targetTopicsDir}`);

const corpusIndexPath = path.join(dataDir, 'corpus-index.json');
fs.writeFileSync(corpusIndexPath, JSON.stringify(corpusInventory, null, 2), 'utf8');
console.log(`✅ Saved machine-readable corpus index to ${corpusIndexPath}`);

const conceptMap: Record<string, string[]> = {};
for (const ch of corpusInventory) {
  for (const c of ch.inventory.concepts) {
    if (!conceptMap[c]) conceptMap[c] = [];
    conceptMap[c].push(ch.title);
  }
}

let mdReport = `# The Living Codex — Full Corpus Forensic Quality & Knowledge Audit

**Total Canonical Chapters Migrated:** ${corpusInventory.length}  
**Date of Audit:** September 1, 2026  
**Auditor:** Automated Codex Migration Engine v2  

---

## 1. Corpus Overview & Volume Distribution

| Volume | Volume Title | Chapter Count | Total Word Count | Total Diagrams | Avg Read Time |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;

const volumeSummary: Record<number, { title: string; count: number; words: number; diagrams: number }> = {};
for (const ch of corpusInventory) {
  if (!volumeSummary[ch.volume]) {
    volumeSummary[ch.volume] = { title: ch.volumeTitle, count: 0, words: 0, diagrams: 0 };
  }
  volumeSummary[ch.volume].count++;
  volumeSummary[ch.volume].words += ch.stats.wordCount;
  volumeSummary[ch.volume].diagrams += ch.stats.diagramCount;
}

for (const [vol, data] of Object.entries(volumeSummary)) {
  const avgRead = Math.round(data.words / (data.count * 180));
  mdReport += `| **Volume ${vol}** | ${data.title} | ${data.count} | ${data.words.toLocaleString()} words | ${data.diagrams} | ${avgRead} min |\n`;
}

mdReport += `
---

## 2. Archetype Distribution

| Archetype | Count | Percentage | Primary Pedagogical Role |
| :--- | :--- | :--- | :--- |
`;

const archetypeCounts: Record<string, number> = {};
for (const ch of corpusInventory) {
  archetypeCounts[ch.archetype] = (archetypeCounts[ch.archetype] || 0) + 1;
}

for (const [arch, count] of Object.entries(archetypeCounts)) {
  const pct = ((count / corpusInventory.length) * 100).toFixed(1);
  mdReport += `| **\`${arch}\`** | ${count} | ${pct}% | ${arch === 'CANONICAL_CONCEPT' ? 'First-principles breakdown of biological/cognitive mechanics' : arch === 'TACTICAL_FRAMEWORK' ? 'Step-by-step behavioral protocols and conversational scripts' : arch === 'DIALECTIC_ESSAY' ? 'Philosophical deconstructions of societal illusions & paradoxes' : 'Long-form academic & pedagogical masterclasses'} |\n`;
}

mdReport += `
---

## 3. Structural Statistics Across Corpus

* **Total Word Count:** ${corpusInventory.reduce((acc, c) => acc + c.stats.wordCount, 0).toLocaleString()} words
* **Total Mermaid Diagrams:** ${corpusInventory.reduce((acc, c) => acc + c.stats.diagramCount, 0)} diagrams
* **Total Section Headings:** ${corpusInventory.reduce((acc, c) => acc + c.stats.headingCount, 0)} headings
* **Total Blockquotes / Takeaways:** ${corpusInventory.reduce((acc, c) => acc + c.stats.blockquoteCount, 0)} blockquotes
* **Total Mathematical Formulas:** ${corpusInventory.reduce((acc, c) => acc + c.stats.mathCount, 0)} formulas

---

## 4. Complete 45-Chapter Inventory Roster

| # | Title | Vol | Archetype | Words | Diagrams | Key Mental Models & Heuristics |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
`;

corpusInventory.forEach((ch, idx) => {
  const models = [...ch.inventory.mentalModels, ...ch.inventory.heuristics].slice(0, 2).join(', ') || 'First-principles breakdown';
  mdReport += `| ${idx + 1} | [${ch.title}](/topics/${ch.slug}/) | ${ch.volume} | \`${ch.archetype}\` | ${ch.stats.wordCount} | ${ch.stats.diagramCount} | ${models} |\n`;
});

mdReport += `
---

## 5. Cross-Chapter Concept Matrix & Candidate Overlaps

The following concepts appear across multiple chapters, representing high-leverage conceptual bridges:

`;

const repeatedConcepts = Object.entries(conceptMap).filter(([_, chapters]) => chapters.length >= 2);
for (const [concept, chapters] of repeatedConcepts.slice(0, 15)) {
  mdReport += `* **${concept}** (referenced in ${chapters.length} chapters):\n`;
  for (const c of chapters) {
    mdReport += `  * ${c}\n`;
  }
}

mdReport += `
---

## 6. Recommendations for Future YouTube Ingestion

1. **Deterministic Invariant**: Use the \`CANONICAL_CONCEPT\` archetype for science/biology videos, \`TACTICAL_FRAMEWORK\` for skill/action tutorials, and \`DIALECTIC_ESSAY\` for philosophical commentaries.
2. **Layered Structure**: Every newly ingested video should automatically generate the 15-second summary kernel, visual Mermaid model, step-by-step causal mechanics, and timestamp citations.
3. **Lossless Preservation Invariant**: When a new video covers an existing topic, append to the existing canonical chapter rather than creating duplicate entries.
`;

const reportPath = path.join(docsDir, 'corpus-audit.md');
fs.writeFileSync(reportPath, mdReport, 'utf8');
console.log(`✅ Generated comprehensive human-readable audit report to ${reportPath}`);
