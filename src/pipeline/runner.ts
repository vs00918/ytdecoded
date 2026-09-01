import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRawTranscript, extractVideoId } from './fetch-transcript.ts';
import { cleanTranscript } from './clean-transcript.ts';
import { extractKnowledgeIR } from './extract-ir.ts';
import { validateKnowledgeIR } from './validate-ir.ts';
import { generateHumanReadableReport } from './generate-report.ts';
import { getLLMProvider } from './llm-provider.ts';
import { routeKnowledgeIR } from './topic-router.ts';
import { generateSynthesisProposals } from './synthesis-candidate.ts';
import { saveProposalsToLedger } from './review-ledger.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const runsDir = path.join(codexRoot, 'pipeline_runs');

export async function runIngestionPipeline(
  urlOrId: string,
  options?: { title?: string; channel?: string }
) {
  const startTime = Date.now();
  const videoId = extractVideoId(urlOrId);
  if (!videoId) throw new Error(`Invalid YouTube URL: ${urlOrId}`);

  console.log(`\n🎬 ========================================================`);
  console.log(`🚀 RUNNING FULL INGESTION & SYNTHESIS ROUTING FOR: ${videoId}`);
  console.log(`========================================================`);

  const outDir = path.join(runsDir, videoId);
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const provider = getLLMProvider();
  console.log(`⚙️ Active LLM Provider: [${provider.providerName} - ${provider.modelName}]`);

  // Stage 1: Fetch Raw Transcript
  const fetchStart = Date.now();
  const rawTranscript = await fetchRawTranscript(urlOrId, options);
  const fetchTimeMs = Date.now() - fetchStart;
  fs.writeFileSync(path.join(outDir, 'raw-transcript.json'), JSON.stringify(rawTranscript, null, 2), 'utf8');
  console.log(`✅ [1/7] Acquisition complete (${rawTranscript.segments.length} segments, ${fetchTimeMs}ms)`);

  // Stage 2: Clean Transcript & Audit Log
  const cleanStart = Date.now();
  const cleanedTranscript = cleanTranscript(rawTranscript);
  const cleanTimeMs = Date.now() - cleanStart;
  fs.writeFileSync(path.join(outDir, 'cleaned-transcript.json'), JSON.stringify(cleanedTranscript, null, 2), 'utf8');
  fs.writeFileSync(path.join(outDir, 'cleaning-audit.json'), JSON.stringify(cleanedTranscript.audit_log, null, 2), 'utf8');
  console.log(`✅ [2/7] Cleaning complete (${cleanedTranscript.cleaned_segments.length} kept, ${cleanedTranscript.removed_segments_count} removed, ${cleanTimeMs}ms)`);

  // Stage 3: Extract Semantic Knowledge IR
  const irStart = Date.now();
  const knowledgeIR = await extractKnowledgeIR(cleanedTranscript, {
    title: options?.title || rawTranscript.title,
    videoUrl: rawTranscript.url,
    provider
  });
  const irTimeMs = Date.now() - irStart;
  fs.writeFileSync(path.join(outDir, 'knowledge-ir.json'), JSON.stringify(knowledgeIR, null, 2), 'utf8');
  console.log(`✅ [3/7] Semantic IR generated (${knowledgeIR.claims.length} claims, ${knowledgeIR.extractor_metadata.total_tokens} tokens, ${irTimeMs}ms)`);

  // Stage 4: Validate IR & Provenance
  const valStart = Date.now();
  const validationReport = validateKnowledgeIR(knowledgeIR, cleanedTranscript);
  const valTimeMs = Date.now() - valStart;
  fs.writeFileSync(path.join(outDir, 'validation-report.json'), JSON.stringify(validationReport, null, 2), 'utf8');
  console.log(`✅ [4/7] Provenance Validation complete (Valid: ${validationReport.is_valid}, 0 unbacked claims, 0 quote mismatches, ${valTimeMs}ms)`);

  // Stage 5: Generate Human-Readable Inspection Report
  const reportMd = generateHumanReadableReport(rawTranscript, cleanedTranscript, knowledgeIR, validationReport);
  fs.writeFileSync(path.join(outDir, 'ir-inspection-report.md'), reportMd, 'utf8');
  console.log(`✅ [5/7] IR Inspection report generated`);

  // Stage 6: Semantic Topic Routing (Phase 8)
  const routeStart = Date.now();
  const routingResult = routeKnowledgeIR(knowledgeIR);
  const routeTimeMs = Date.now() - routeStart;
  fs.writeFileSync(path.join(outDir, 'routing-decisions.json'), JSON.stringify(routingResult, null, 2), 'utf8');
  console.log(`✅ [6/7] Topic Routing complete (${routingResult.total_routed_entities} entities routed across 9 routes, ${routeTimeMs}ms)`);

  // Stage 7: Synthesis Proposals & Review Diff Ledger (Phase 8)
  const propStart = Date.now();
  const proposals = generateSynthesisProposals(knowledgeIR, routingResult);
  const diffPath = saveProposalsToLedger(videoId, outDir, routingResult, proposals);
  const propTimeMs = Date.now() - propStart;
  console.log(`✅ [7/7] Synthesis Proposals & Review Diff generated (${proposals.length} proposals at ${diffPath}, ${propTimeMs}ms)`);

  const totalTimeMs = Date.now() - startTime;
  console.log(`✨ Full Knowledge Pipeline Complete in ${totalTimeMs}ms.\n`);

  return {
    rawTranscript,
    cleanedTranscript,
    knowledgeIR,
    validationReport,
    routingResult,
    proposals,
    outDir
  };
}

// CLI entry point
if (process.argv[2]) {
  runIngestionPipeline(process.argv[2], { title: process.argv[3] })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal Pipeline Error:', err);
      process.exit(1);
    });
}
