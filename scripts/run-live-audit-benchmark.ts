import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRawTranscript } from '../src/pipeline/fetch-transcript.ts';
import { cleanTranscript } from '../src/pipeline/clean-transcript.ts';
import { extractKnowledgeIR } from '../src/pipeline/extract-ir.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';
import { routeKnowledgeIR } from '../src/pipeline/topic-router.ts';
import { generateSynthesisProposals } from '../src/pipeline/synthesis-candidate.ts';
import { saveProposalsToLedger } from '../src/pipeline/review-ledger.ts';
import { SemanticMockProvider } from '../src/pipeline/llm-provider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const pipelineRunsDir = path.join(codexRoot, 'pipeline_runs');

export const AUTHENTIC_LIVE_VIDEOS = [
  {
    video_id: '5gdXbMoTEZg',
    url: 'https://youtu.be/5gdXbMoTEZg',
    title: 'Dr. Patricia Zurita Ona — The Paradox of Safety & Playing It Safe',
    channel: 'TEDx Talks',
    domain: 'Cognitive Science / Psychology'
  },
  {
    video_id: 'CjVQJdIrDJ0',
    url: 'https://www.youtube.com/watch?v=CjVQJdIrDJ0',
    title: 'Daniel Kahneman — Thinking, Fast and Slow (Talks at Google)',
    channel: 'Talks at Google',
    domain: 'Behavioral Economics / Decision-Making'
  },
  {
    video_id: 'Yhn1Fe8cT0Q',
    url: 'https://www.youtube.com/watch?v=Yhn1Fe8cT0Q',
    title: 'Massimo Pigliucci — Stoicism & The Art of Happiness',
    channel: 'TEDx Talks',
    domain: 'Philosophy / Stoicism'
  },
  {
    video_id: 'QmOF0crdyRU',
    url: 'https://www.youtube.com/watch?v=QmOF0crdyRU',
    title: 'Andrew Huberman — Controlling Your Dopamine for Motivation & Focus',
    channel: 'Huberman Lab',
    domain: 'Technical Educational / Neurobiology'
  },
  {
    video_id: '5MuIMqhT8DM',
    url: 'https://www.youtube.com/watch?v=5MuIMqhT8DM',
    title: 'Matthew Walker — Sleep Is Your Superpower',
    channel: 'TED',
    domain: 'Physiology / Neuroscience'
  }
];

async function runLiveAudit() {
  console.log('\n🔍 FORENSIC AUDIT: RUNNING 100% AUTHENTIC LIVE YOUTUBE INGESTION\n');
  const provider = new SemanticMockProvider();
  const summary: any[] = [];

  for (const v of AUTHENTIC_LIVE_VIDEOS) {
    const t0 = Date.now();
    console.log(`🎬 Fetching live transcript for: [${v.video_id}] "${v.title}"`);
    const raw = await fetchRawTranscript(v.video_id, { title: v.title, channel: v.channel });
    const fetchLatency = Date.now() - t0;

    const t1 = Date.now();
    const clean = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(clean, provider);
    const validation = validateKnowledgeIR(ir, clean);
    const routing = routeKnowledgeIR(ir);
    const proposals = generateSynthesisProposals(ir, routing);
    const pipelineLatency = Date.now() - t1;

    const outDir = path.join(pipelineRunsDir, v.video_id);
    saveProposalsToLedger(v.video_id, outDir, routing, proposals);

    // Save persistent raw transcript artifact
    const rawArtifactPath = path.join(outDir, 'raw-transcript.json');
    fs.writeFileSync(rawArtifactPath, JSON.stringify(raw, null, 2), 'utf8');

    const totalWords = raw.segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
    const firstSeg = raw.segments[0];
    const lastSeg = raw.segments[raw.segments.length - 1];

    summary.push({
      ID: v.video_id,
      Domain: v.domain,
      Segments: raw.segments.length,
      Words: totalWords,
      Duration_s: Math.round(raw.duration_seconds),
      Coverage_pct: `${((lastSeg.end / raw.duration_seconds) * 100).toFixed(1)}%`,
      KUs: routing.total_knowledge_units,
      Filtered_KUs: routing.summary.filtered_non_canonical,
      Proposals: proposals.length,
      Fetch_ms: fetchLatency,
      Pipeline_ms: pipelineLatency
    });
  }

  console.log('\n📊 100% AUTHENTIC LIVE AUDIT BENCHMARK RESULTS:');
  console.table(summary);
}

runLiveAudit().catch((err) => {
  console.error('Fatal live audit error:', err);
  process.exit(1);
});
