import { runMultiVideoCorpusBenchmark } from '../src/pipeline/multi-video-runner.ts';

async function main() {
  const result = await runMultiVideoCorpusBenchmark();
  console.log('\n📊 PHASE 10 MULTI-VIDEO INGESTION SUMMARY:');
  console.table(result.summaryTable);
  console.log(`\n✨ Master benchmark manifest saved to codex/data/phase10-corpus-manifest.json`);
}

main().catch((err) => {
  console.error('Fatal benchmark error:', err);
  process.exit(1);
});
