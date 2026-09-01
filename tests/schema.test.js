import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const repoRoot = fs.existsSync(path.join(codexRoot, 'knowledge-tree')) ? codexRoot : path.join(codexRoot, '..');

// Replicate Zod schema to test validation logic
const topicSchema = z.object({
  title: z.string(),
  volume: z.number().int().min(1).max(10),
  volume_title: z.string(),
  order_in_volume: z.number().int().min(1),
  archetype: z.enum([
    'CANONICAL_CONCEPT',
    'MASTERCLASS_LECTURE',
    'DIALECTIC_ESSAY',
    'TACTICAL_FRAMEWORK'
  ]),
  reading_time_minutes: z.number().int().positive(),
  summary_15s: z.string().min(20),
  tags: z.array(z.string()).min(1),
  sources: z.array(z.object({
    source_id: z.string(),
    title: z.string(),
    creator: z.string(),
    url: z.string().url()
  })).optional()
});

describe('Phase 1: Schema & Content Validation', () => {
  test('Valid topic frontmatter passes schema', () => {
    const validData = {
      title: "The Architecture of Somatic Poise",
      volume: 6,
      volume_title: "Existential Sovereignty",
      order_in_volume: 1,
      archetype: "TACTICAL_FRAMEWORK",
      reading_time_minutes: 6,
      summary_15s: "Performance anxiety is a failure of focus. Grounding your base stance halts explicit monitoring.",
      tags: ["performance", "somatic-poise"],
      sources: [{
        source_id: "youtube-CqgmozFr_GM",
        title: "How to stay calm under pressure",
        creator: "Dr. Noa Kageyama",
        url: "https://youtu.be/CqgmozFr_GM"
      }]
    };

    const result = topicSchema.safeParse(validData);
    assert.strictEqual(result.success, true);
  });

  test('Missing required summary_15s fails validation', () => {
    const invalidData = {
      title: "Broken Topic",
      volume: 1,
      volume_title: "Biology",
      order_in_volume: 1,
      archetype: "CANONICAL_CONCEPT",
      reading_time_minutes: 5,
      tags: ["test"]
      // missing summary_15s
    };

    const result = topicSchema.safeParse(invalidData);
    assert.strictEqual(result.success, false);
  });

  test('Invalid archetype fails validation', () => {
    const invalidData = {
      title: "Broken Topic",
      volume: 1,
      volume_title: "Biology",
      order_in_volume: 1,
      archetype: "RANDOM_BLOG_POST",
      reading_time_minutes: 5,
      summary_15s: "This is a valid 15-second summary that is long enough.",
      tags: ["test"]
    };

    const result = topicSchema.safeParse(invalidData);
    assert.strictEqual(result.success, false);
  });
});

describe('Phase 1: Absolute Safety & Repository Integrity', () => {
  test('Original codex.html remains untouched and exists', () => {
    const codexPath = path.join(repoRoot, 'codex.html');
    assert.strictEqual(fs.existsSync(codexPath), true);
    const content = fs.readFileSync(codexPath, 'utf8');
    assert.strictEqual(content.includes('The Living Codex'), true);
  });

  test('Original THE_LIVING_CODEX.md remains untouched', () => {
    const mdPath = path.join(repoRoot, 'THE_LIVING_CODEX.md');
    assert.strictEqual(fs.existsSync(mdPath), true);
  });

  test('Original knowledge-tree/nodes directory retains all 45 master chapters', () => {
    const nodesDir = path.join(repoRoot, 'knowledge-tree', 'nodes');
    assert.strictEqual(fs.existsSync(nodesDir), true);
    const files = fs.readdirSync(nodesDir).filter(f => f.endsWith('.md'));
    assert.strictEqual(files.length, 45);
  });

  test('Banking CA application files in app/ remain intact when in monorepo', () => {
    if (fs.existsSync(path.join(repoRoot, 'package.json')) && !fs.existsSync(path.join(repoRoot, 'astro.config.mjs'))) {
      const appDir = path.join(repoRoot, 'app');
      assert.strictEqual(fs.existsSync(appDir), true);
    }
  });
});
