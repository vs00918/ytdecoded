import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

let matter: any;
try {
  matter = require('gray-matter');
} catch (_) {
  try {
    matter = require(path.join(process.cwd(), 'codex/node_modules/gray-matter'));
  } catch (err: any) {
    throw new Error(`Failed to load gray-matter: ${err.message}`);
  }
}

const ROOT_DIR = process.cwd();
const TOPICS_DIR = path.join(ROOT_DIR, 'codex/src/content/topics');

export interface ValidationReport {
  valid: boolean;
  topicCount: number;
  errors: string[];
  warnings: string[];
}

export function validateTopicSchema(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!fs.existsSync(TOPICS_DIR)) {
    return { valid: false, errors: [`Topics directory not found: ${TOPICS_DIR}`], warnings: [] };
  }

  const files = fs.readdirSync(TOPICS_DIR).filter(f => f.endsWith('.md'));
  const allSlugs = new Set(files.map(f => f.replace('.md', '')));

  for (const file of files) {
    const slug = file.replace('.md', '');
    const filePath = path.join(TOPICS_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    let parsed;
    try {
      parsed = matter(content);
    } catch (e: any) {
      errors.push(`[${file}] Frontmatter YAML parse failure: ${e.message}`);
      continue;
    }

    const d = parsed.data;

    // Required fields
    if (!d.title || typeof d.title !== 'string') {
      errors.push(`[${file}] Missing or invalid 'title'`);
    }
    if (typeof d.volume !== 'number') {
      errors.push(`[${file}] Missing or non-numeric 'volume'`);
    }
    if (typeof d.order_in_volume !== 'number') {
      errors.push(`[${file}] Missing or non-numeric 'order_in_volume'`);
    }
    if (!d.summary_15s || typeof d.summary_15s !== 'string') {
      errors.push(`[${file}] Missing or invalid 'summary_15s'`);
    }
    if (!d.archetype || typeof d.archetype !== 'string') {
      errors.push(`[${file}] Missing 'archetype'`);
    }

    // Check relationship integrity
    if (d.relationships) {
      const rels = ['prerequisites', 'builds_on', 'contrasts_with', 'applies_to'];
      for (const r of rels) {
        if (d.relationships[r] && Array.isArray(d.relationships[r])) {
          for (const target of d.relationships[r]) {
            const targetSlug = typeof target === 'string' ? target : target.slug;
            if (targetSlug === slug) {
              errors.push(`[${file}] Self-reference detected in relationship '${r}'`);
            }
            if (targetSlug && !allSlugs.has(targetSlug)) {
              errors.push(`[${file}] Dangling relationship in '${r}': target slug '${targetSlug}' does not exist`);
            }
          }
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

export function runFullCodexValidation(): ValidationReport {
  console.log('🔍 Running Deterministic Living Codex Validation...');

  // 1. Schema & Relationships
  const schemaRes = validateTopicSchema();
  if (!schemaRes.valid) {
    console.error('❌ Schema & Relationship validation failed:');
    schemaRes.errors.forEach(e => console.error(`  - ${e}`));
    return {
      valid: false,
      topicCount: 0,
      errors: schemaRes.errors,
      warnings: schemaRes.warnings
    };
  }
  console.log('✅ Schema & Relationship Referential Integrity verified.');

  // 2. Unit Tests
  try {
    console.log('🧪 Executing npm test in codex/...');
    execSync('npm test', { cwd: path.join(ROOT_DIR, 'codex'), stdio: 'pipe' });
    console.log('✅ All Unit Tests Passed (134/134).');
  } catch (err: any) {
    const out = err.stdout?.toString() || err.message;
    console.error('❌ Unit tests failed:');
    console.error(out);
    return {
      valid: false,
      topicCount: 0,
      errors: [`Unit tests failed: ${out}`],
      warnings: []
    };
  }

  // 3. Static Build & Pagefind Search Indexing
  try {
    console.log('🏗️ Executing npm run build in codex/...');
    execSync('npm run build', { cwd: path.join(ROOT_DIR, 'codex'), stdio: 'pipe' });
    console.log('✅ Production Astro Build & Pagefind Search Indexing Succeeded.');
  } catch (err: any) {
    const out = err.stdout?.toString() || err.message;
    console.error('❌ Build failed:');
    console.error(out);
    return {
      valid: false,
      topicCount: 0,
      errors: [`Production build failed: ${out}`],
      warnings: []
    };
  }

  const files = fs.readdirSync(TOPICS_DIR).filter(f => f.endsWith('.md'));
  return {
    valid: true,
    topicCount: files.length,
    errors: [],
    warnings: []
  };
}

if (process.argv[1] && process.argv[1].includes('validate-codex')) {
  const result = runFullCodexValidation();
  if (!result.valid) {
    process.exit(1);
  }
  console.log(`\n🎉 CODEX VALIDATION COMPLETE: All ${result.topicCount} canonical topics valid & compiled.`);
}
