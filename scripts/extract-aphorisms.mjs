import fs from 'fs';
import path from 'path';

const repoRoot = 'c:/Users/visha/OneDrive/Documents/mind of aravalli/.cache/ytdecoded_repo';
const TOPICS_DIR = path.join(repoRoot, 'src/content/topics');
const OUTPUT_FILE = path.join(repoRoot, 'public/data/codex-aphorisms.json');
const SCRIPTS_EXTRACTOR = path.join(repoRoot, 'scripts/extract-aphorisms.mjs');

function clean(str) {
  if (!str) return '';
  return str.replace(/^["']|["']$/g, '').replace(/\s+/g, ' ').trim();
}

function parseYamlTopic(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const raw = m[1];

  const titleMatch = raw.match(/^title:\s*(.*)$/m);
  const idMatch = raw.match(/^id:\s*(.*)$/m);
  const volumeMatch = raw.match(/^volume:\s*(\d+)/m);
  const volumeTitleMatch = raw.match(/^volume_title:\s*(.*)$/m);
  const summaryMatch = raw.match(/^summary_15s:\s*(?:>-\s*\n|["'])?([^"'\r\n]+(?:\r?\n\s+[^"'\r\n]+)*)["']?/m);

  const title = titleMatch ? clean(titleMatch[1]) : '';
  const id = idMatch ? clean(idMatch[1]) : '';
  const volume = volumeMatch ? parseInt(volumeMatch[1], 10) : 1;
  const volume_title = volumeTitleMatch ? clean(volumeTitleMatch[1]) : '';
  const summary_15s = summaryMatch ? clean(summaryMatch[1]) : '';

  // Parse sources and claims
  const claims = [];
  const lines = raw.split(/\r?\n/);
  let currentCreator = 'The Living Codex';
  let inSources = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^sources:/.test(line)) {
      inSources = true;
      continue;
    }
    if (inSources && /^[a-zA-Z0-9_-]+:/.test(line) && !/^\s/.test(line)) {
      inSources = false;
    }

    if (inSources) {
      const creatorM = line.match(/^\s*-?\s*creator:\s*["']?([^"'\r\n]+)["']?/);
      if (creatorM) {
        currentCreator = clean(creatorM[1]);
      }

      const claimM = line.match(/^\s*-?\s*claim:\s*["']?([^"'\r\n]+)["']?/);
      if (claimM) {
        let claimText = clean(claimM[1]);
        // Collect multiline if indented
        let j = i + 1;
        while (j < lines.length && /^\s{6,}/.test(lines[j]) && !/^\s*-?\s*\w+:/.test(lines[j])) {
          claimText += ' ' + clean(lines[j]);
          j++;
        }
        claims.push({
          quote: claimText,
          creator: currentCreator
        });
      }
    }
  }

  return { id, title, volume, volume_title, summary_15s, claims };
}

export function run() {
  const files = fs.readdirSync(TOPICS_DIR).filter(f => f.endsWith('.md'));
  const list = [];

  for (const f of files) {
    const defaultSlug = f.replace(/\.md$/, '');
    const content = fs.readFileSync(path.join(TOPICS_DIR, f), 'utf8');
    const parsed = parseYamlTopic(content);
    if (!parsed) continue;

    const slug = parsed.id || defaultSlug;

    // 1. Core Axiom from summary_15s
    if (parsed.summary_15s && parsed.summary_15s.length > 25 && parsed.summary_15s.length < 240) {
      list.push({
        id: `axiom-${slug}`,
        quote: parsed.summary_15s,
        creator: 'Canonical Codex Axiom',
        topic_title: parsed.title,
        topic_slug: slug,
        volume: parsed.volume,
        volume_title: parsed.volume_title,
        archetype: 'AXIOM'
      });
    }

    // 2. High-value claims
    for (let i = 0; i < parsed.claims.length; i++) {
      const c = parsed.claims[i];
      let quote = c.quote;
      // Remove trailing quotes
      quote = quote.replace(/["']+$/, '').trim();

      // Split concept prefix e.g. "The Core Wealth Axiom: Seek wealth..."
      const colonIdx = quote.indexOf(': ');
      if (colonIdx > 0 && colonIdx < 50) {
        quote = quote.substring(colonIdx + 2).trim();
      }

      if (quote.length >= 25 && quote.length <= 260) {
        list.push({
          id: `claim-${slug}-${i}`,
          quote: quote,
          creator: c.creator || 'The Living Codex',
          topic_title: parsed.title,
          topic_slug: slug,
          volume: parsed.volume,
          volume_title: parsed.volume_title,
          archetype: 'PHILOSOPHICAL_CLAIM'
        });
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  const deduped = list.filter(item => {
    const key = item.quote.toLowerCase().slice(0, 45);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const outDir = path.dirname(OUTPUT_FILE);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(deduped, null, 2), 'utf8');
  console.log(`Generated ${deduped.length} curated philosophical aphorisms at ${OUTPUT_FILE}`);
}

run();
