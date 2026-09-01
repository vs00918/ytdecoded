import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, '..', 'dist');

async function main() {
  console.log('\n======================================================');
  console.log('🔍 PAGEFIND OFFLINE SEARCH VERIFICATION');
  console.log('======================================================\n');

  const pagefindPath = path.join(distDir, 'pagefind', 'pagefind.js');
  if (!fs.existsSync(pagefindPath)) {
    console.error('❌ Pagefind bundle not found at:', pagefindPath);
    process.exit(1);
  }

  const pagefindUrl = pathToFileURL(pagefindPath).href;
  const pagefind = await import(pagefindUrl);
  await pagefind.init();

  const testQueries = [
    'The Neurobiology of Sleep',
    '711 genes',
    'Natural Killer',
    'Sleep Spindles',
    'Stimulus Control',
    'Gut-Mind Axis'
  ];

  for (const q of testQueries) {
    const searchRes = await pagefind.search(q);
    console.log(`🔎 Query: "${q}" -> Found ${searchRes.results.length} result(s)`);
    if (searchRes.results.length > 0) {
      const first = await searchRes.results[0].data();
      console.log(`   Top match: [${first.url}] "${first.meta.title || 'Untitled'}"`);
      console.log(`   Excerpt:   ${first.excerpt.slice(0, 120)}...`);
    } else {
      console.log('   ⚠️ No matches found.');
    }
  }
}

main().catch((err) => {
  console.error('Pagefind verification failed:', err);
  process.exit(1);
});
