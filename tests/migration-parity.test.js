import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const repoRoot = fs.existsSync(path.join(codexRoot, 'knowledge-tree')) ? codexRoot : path.join(codexRoot, '..');

const testPairs = [
  {
    name: 'Chapter 1: Gut-Mind Axis',
    originalFile: path.join(repoRoot, 'knowledge-tree', 'nodes', 'chapter-01-the-second-brain-and-the-gut-mind-axis.md'),
    migratedFile: path.join(codexRoot, 'src', 'content', 'topics', 'the-second-brain-and-the-gut-mind-axis.md')
  },
  {
    name: 'Chapter 18: Pathology of Comfort',
    originalFile: path.join(repoRoot, 'knowledge-tree', 'nodes', 'chapter-14-the-pathology-of-comfort-and-progressive-friction.md'),
    migratedFile: path.join(codexRoot, 'src', 'content', 'topics', 'the-pathology-of-comfort-and-progressive-friction.md')
  },
  {
    name: 'Chapter 32: High-Impact Pedagogy',
    originalFile: path.join(repoRoot, 'knowledge-tree', 'nodes', 'chapter-42-the-architecture-of-high-impact-pedagogy.md'),
    migratedFile: path.join(codexRoot, 'src', 'content', 'topics', 'the-architecture-of-high-impact-pedagogy.md')
  }
];

function extractBody(content) {
  // Strip frontmatter if present
  if (content.startsWith('---')) {
    const endMatch = content.indexOf('---', 3);
    if (endMatch !== -1) {
      return content.slice(endMatch + 3).trim();
    }
  }
  // Strip top level # Volume X and ## Chapter Y headings if original
  return content
    .replace(/^#\s+Volume\s+\d+:[^\n]+/m, '')
    .replace(/^##\s+Chapter\s+\d+:[^\n]+/m, '')
    .trim();
}

function countOccurrences(text, regex) {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

describe('Phase 2: Lossless Content Migration Verification', () => {
  for (const pair of testPairs) {
    test(`Lossless Parity for ${pair.name}`, () => {
      assert.strictEqual(fs.existsSync(pair.originalFile), true, `Original file missing: ${pair.originalFile}`);
      assert.strictEqual(fs.existsSync(pair.migratedFile), true, `Migrated file missing: ${pair.migratedFile}`);

      const origRaw = fs.readFileSync(pair.originalFile, 'utf8');
      const migRaw = fs.readFileSync(pair.migratedFile, 'utf8');

      const origBody = extractBody(origRaw);
      const migBody = extractBody(migRaw);

      // 1. Mermaid diagram parity
      const origDiagrams = countOccurrences(origRaw, /```mermaid/g);
      const migDiagrams = countOccurrences(migRaw, /```mermaid/g);
      assert.strictEqual(migDiagrams, origDiagrams, `Diagram count mismatch: orig=${origDiagrams}, mig=${migDiagrams}`);

      // 2. Headings count parity (### and ####)
      const origH3 = countOccurrences(origBody, /^###\s+/gm);
      const migH3 = countOccurrences(migBody, /^###\s+/gm);
      assert.strictEqual(migH3, origH3, `H3 Heading count mismatch: orig=${origH3}, mig=${migH3}`);

      const origH4 = countOccurrences(origBody, /^####\s+/gm);
      const migH4 = countOccurrences(migBody, /^####\s+/gm);
      assert.strictEqual(migH4, origH4, `H4 Heading count mismatch: orig=${origH4}, mig=${migH4}`);

      // 3. Blockquote parity
      const origQuotes = countOccurrences(origBody, /^>\s+/gm);
      const migQuotes = countOccurrences(migBody, /^>\s+/gm);
      assert.strictEqual(migQuotes, origQuotes, `Blockquote count mismatch: orig=${origQuotes}, mig=${migQuotes}`);

      // 4. Formula parity
      const origMath = countOccurrences(origBody, /\$\$/g);
      const migMath = countOccurrences(migBody, /\$\$/g);
      assert.strictEqual(migMath, origMath, `Math formula count mismatch: orig=${origMath}, mig=${migMath}`);

      // 5. Word parity: tokenize words and verify all key words from original are preserved
      const tokenize = (str) => str.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
      const origWords = new Set(tokenize(origBody));
      const migWords = new Set(tokenize(migBody));

      const missingWords = [];
      for (const word of origWords) {
        if (!migWords.has(word)) {
          missingWords.push(word);
        }
      }

      assert.strictEqual(missingWords.length, 0, `Missing words in migrated content: ${missingWords.join(', ')}`);
    });
  }
});
