import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const repoRoot = fs.existsSync(path.join(codexRoot, 'knowledge-tree')) ? codexRoot : path.join(codexRoot, '..');

const nodesDir = path.join(repoRoot, 'knowledge-tree', 'nodes');
const targetTopicsDir = path.join(codexRoot, 'src', 'content', 'topics');

function countOccurrences(text, regex) {
  return (text.match(regex) || []).length;
}

function extractBody(content) {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) {
      return content.slice(end + 3).trim();
    }
  }
  return content.trim();
}

const sourceFiles = fs.readdirSync(nodesDir).filter((f) => f.endsWith('.md')).sort();

describe('Phase 4: Full Corpus 45-Chapter Parity Verification', () => {
  test('Exactly 45 source files exist in original knowledge-tree/nodes', () => {
    assert.strictEqual(sourceFiles.length, 45);
  });

  test('All 45 original source files are fully preserved in codex/src/content/topics', () => {
    const migratedFiles = fs.readdirSync(targetTopicsDir).filter((f) => f.endsWith('.md'));
    assert.ok(migratedFiles.length >= 45, `Expected at least 45 topics, got ${migratedFiles.length}`);
  });

  for (const file of sourceFiles) {
    const slug = file.replace(/\.md$/, '').replace(/^chapter-\d+-/, '');
    const origPath = path.join(nodesDir, file);
    const migPath = path.join(targetTopicsDir, `${slug}.md`);

    test(`Parity for ${file} -> ${slug}.md`, () => {
      assert.strictEqual(fs.existsSync(origPath), true);
      assert.strictEqual(fs.existsSync(migPath), true, `Migrated file missing: ${migPath}`);

      const origRaw = fs.readFileSync(origPath, 'utf8');
      const migRaw = fs.readFileSync(migPath, 'utf8');

      const origBody = extractBody(origRaw);
      const migBody = extractBody(migRaw);

      // 1. Mermaid diagram preservation (lossless guarantee: migrated must have at least as many diagrams as original)
      const origDiagrams = countOccurrences(origRaw, /```mermaid/g);
      const migDiagrams = countOccurrences(migRaw, /```mermaid/g);
      assert.ok(
        migDiagrams >= origDiagrams,
        `Mermaid regression on ${slug}: orig=${origDiagrams}, mig=${migDiagrams}`
      );

      // 2. Word count preservation (lossless guarantee: migrated must not drop below 90% of original)
      const origWords = origBody.split(/\s+/).filter(Boolean).length;
      const migWords = migBody.split(/\s+/).filter(Boolean).length;
      const ratio = migWords / origWords;
      assert.ok(
        ratio >= 0.90,
        `Word count regression on ${slug}: orig=${origWords}, mig=${migWords}, ratio=${ratio.toFixed(3)}`
      );
    });
  }
});
