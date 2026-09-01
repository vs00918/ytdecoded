import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const topicsDir = path.join(codexRoot, 'src', 'content', 'topics');

export interface TopicIndexEntry {
  slug: string;
  title: string;
  volume: number;
  archetype: string;
  summary_15s: string;
  tags: string[];
  mental_models: string[];
  full_content: string;
}

let cachedIndex: TopicIndexEntry[] | null = null;

export function loadTopicIndex(): TopicIndexEntry[] {
  if (cachedIndex) return cachedIndex;

  if (!fs.existsSync(topicsDir)) {
    throw new Error(`Topics directory does not exist: ${topicsDir}`);
  }

  const files = fs.readdirSync(topicsDir).filter((f) => f.endsWith('.md'));
  const entries: TopicIndexEntry[] = [];

  for (const file of files) {
    const filePath = path.join(topicsDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const parsed = matter(content);
    const slug = file.replace(/\.md$/, '');

    entries.push({
      slug,
      title: parsed.data.title || slug,
      volume: parsed.data.volume || 1,
      archetype: parsed.data.archetype || 'MECHANISM_AND_PATHOLOGY',
      summary_15s: parsed.data.summary_15s || '',
      tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
      mental_models: Array.isArray(parsed.data.mental_models) ? parsed.data.mental_models : [],
      full_content: parsed.content
    });
  }

  cachedIndex = entries;
  return entries;
}

export interface CandidateMatch {
  topic: TopicIndexEntry;
  score: number;
  matchedTerms: string[];
}

export function retrieveCandidateTopics(
  queryText: string,
  topK = 5
): CandidateMatch[] {
  const index = loadTopicIndex();
  const normalizedQuery = queryText.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const queryTokens = Array.from(
    new Set(normalizedQuery.split(/\s+/).filter((t) => t.length > 3))
  );

  const scored = index.map((topic) => {
    let score = 0;
    const matchedTerms: string[] = [];

    const titleLower = topic.title.toLowerCase();
    const summaryLower = topic.summary_15s.toLowerCase();
    const contentLower = topic.full_content.toLowerCase();

    for (const token of queryTokens) {
      if (titleLower.includes(token)) {
        score += 10;
        matchedTerms.push(`title:${token}`);
      }
      if (summaryLower.includes(token)) {
        score += 5;
        matchedTerms.push(`summary:${token}`);
      }
      if (topic.tags.some((t) => t.toLowerCase().includes(token))) {
        score += 4;
        matchedTerms.push(`tag:${token}`);
      }
      if (topic.mental_models.some((m) => m.toLowerCase().includes(token))) {
        score += 4;
        matchedTerms.push(`model:${token}`);
      }
      if (contentLower.includes(token)) {
        score += 1;
      }
    }

    return { topic, score, matchedTerms };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
