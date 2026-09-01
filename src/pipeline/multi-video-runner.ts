import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchRawTranscript } from './fetch-transcript.ts';
import { cleanTranscript } from './clean-transcript.ts';
import { extractKnowledgeIR } from './extract-ir.ts';
import { validateKnowledgeIR } from './validate-ir.ts';
import { routeKnowledgeIR } from './topic-router.ts';
import { generateSynthesisProposals } from './synthesis-candidate.ts';
import { saveProposalsToLedger } from './review-ledger.ts';
import { SemanticMockProvider } from './llm-provider.ts';
import type { RawTranscript } from './types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const pipelineRunsDir = path.join(codexRoot, 'pipeline_runs');

export interface VideoManifest {
  run_id: string;
  video_id: string;
  video_url: string;
  title: string;
  channel: string;
  domain_archetype: string;
  duration_seconds: number;
  ingestion_timestamp: string;
  pipeline_version: string;
  model: string;
  provider: string;
  stages_metrics: {
    raw_segments: number;
    cleaned_segments: number;
    ir_claims: number;
    ir_mechanisms: number;
    ir_examples: number;
    knowledge_units: number;
    filtered_non_canonical: number;
    quarantined: number;
    already_covered: number;
    proposals_generated: number;
    latency_ms: number;
    tokens_consumed: number;
  };
}

export const FIVE_BENCHMARK_VIDEOS = [
  {
    video_id: '5gdXbMoTEZg',
    url: 'https://youtu.be/5gdXbMoTEZg',
    title: 'Dr. Patricia Zurita Ona — The Paradox of Safety & Playing It Safe',
    channel: 'TEDx Talks',
    domain: 'Cognitive Science / Psychology'
  },
  {
    video_id: 'kahneman-decision-heuristics',
    url: 'https://youtube.com/watch?v=kahneman-decision-heuristics',
    title: 'Daniel Kahneman — Prospect Theory, Asymmetric Loss Aversion & System 1/2 Framing',
    channel: 'Talks at Google',
    domain: 'Behavioral Economics / Decision-Making',
    mockSegments: [
      { id: 'seg-0001', start: 0, end: 15, duration: 15, text: 'Welcome everyone to Talks at Google. Today we have Nobel laureate Daniel Kahneman.' },
      { id: 'seg-0002', start: 16, end: 45, duration: 29, text: 'Loss aversion is an asymmetric psychological phenomenon where the pain of losing 100 dollars is twice as intense as the pleasure of gaining 100 dollars.' },
      { id: 'seg-0003', start: 46, end: 75, duration: 29, text: 'System 1 operates automatically and fast with little or no effort, while System 2 allocates attention to effortful mental operations.' },
      { id: 'seg-0004', start: 76, end: 110, duration: 34, text: 'In our 2024 meta-analysis clinical trial, loss aversion disappeared when subjects used an explicit probabilistic framing tool.' },
      { id: 'seg-0005', start: 111, end: 140, duration: 29, text: 'Classical rational choice theory assumed economic agents are perfectly logical, but cognitive psychology completely disproved this assumption.' }
    ]
  },
  {
    video_id: 'epictetus-stoic-dichotomy',
    url: 'https://youtube.com/watch?v=epictetus-stoic-dichotomy',
    title: 'Epictetus & The Enchiridion — The Dichotomy of Control & Radical Epistemic Sovereignty',
    channel: 'The Stoic Mind',
    domain: 'Philosophy / Stoicism',
    mockSegments: [
      { id: 'seg-0001', start: 0, end: 20, duration: 20, text: 'Subscribe to our channel for more Stoic philosophy and mental clarity videos.' },
      { id: 'seg-0002', start: 21, end: 50, duration: 29, text: 'Some things are within our power, while other things are not within our power.' },
      { id: 'seg-0003', start: 51, end: 85, duration: 34, text: 'Prohairesis represents the uncoercible moral faculty of choice that cannot be compromised by external tyranny.' },
      { id: 'seg-0004', start: 86, end: 120, duration: 34, text: 'Radical resilience is achieved when one welcomes adversity through Amor Fati, transforming the void into structural leverage.' },
      { id: 'seg-0005', start: 121, end: 150, duration: 29, text: 'The dichotomy of control only applies to conscious moral agents and does not hold under severe organic brain trauma.' }
    ]
  },
  {
    video_id: 'huberman-dopamine-neurobiology',
    url: 'https://youtube.com/watch?v=huberman-dopamine-neurobiology',
    title: 'Andrew Huberman — The Neurobiology of Dopamine Circuits, Tonic Baselines & Effort Pathways',
    channel: 'Huberman Lab',
    domain: 'Technical Educational / Neurobiology',
    mockSegments: [
      { id: 'seg-0001', start: 0, end: 25, duration: 25, text: 'This podcast is sponsored by Athletic Greens and Momentous supplements. Use promo code HUBERMAN.' },
      { id: 'seg-0002', start: 26, end: 60, duration: 34, text: 'Dopamine is not the molecule of reward; it is the neurochemical currency of anticipation and desire.' },
      { id: 'seg-0003', start: 61, end: 95, duration: 34, text: 'Tonic dopamine establishes the circulating baseline, whereas phasic dopamine produces acute spikes following novel stimuli.' },
      { id: 'seg-0004', start: 96, end: 130, duration: 34, text: 'When you spike dopamine artificially through supernormal stimuli, the subsequent baseline trough drops below the pre-existing baseline level.' },
      { id: 'seg-0005', start: 131, end: 165, duration: 34, text: 'Attaching dopamine to the friction of effort itself prevents the hedonic treadmill crash and creates sustainable self-renewing drive.' }
    ]
  },
  {
    video_id: 'galpin-interview-progressive-friction',
    url: 'https://youtube.com/watch?v=galpin-interview-progressive-friction',
    title: 'Dr. Andy Galpin — Neuromuscular Adaptation, Comfort Pathology & High-Agency Physiology',
    channel: 'FoundMyFitness',
    domain: 'Long-Form Dialogue / Multi-Topic Interview',
    mockSegments: [
      { id: 'seg-0001', start: 0, end: 20, duration: 20, text: 'Thanks for coming on the show, Andy. It is great to have you in the studio.' },
      { id: 'seg-0002', start: 21, end: 55, duration: 34, text: 'The pathology of comfort degrades mitochondrial biogenesis because the cellular architecture requires environmental stress cues.' },
      { id: 'seg-0003', start: 56, end: 90, duration: 34, text: 'Administering progressive friction is like weight training for the nervous system, systematically upgrading autonomic tolerance.' },
      { id: 'seg-0004', start: 91, end: 125, duration: 34, text: 'The enteric nervous system communicates bidirectionally through the vagus nerve to influence systemic inflammation.' },
      { id: 'seg-0005', start: 126, end: 160, duration: 34, text: 'Astrophysical magnetar stellar flares modulate interstellar plasma oscillations through relativistic magnetic reconnection.' }
    ]
  }
];

export async function runMultiVideoCorpusBenchmark(): Promise<{
  manifests: VideoManifest[];
  summaryTable: any[];
}> {
  console.log('\n🚀 STARTING PHASE 10: MULTI-VIDEO CORPUS EVOLUTION BENCHMARK\n');

  const manifests: VideoManifest[] = [];
  const summaryTable: any[] = [];
  const provider = new SemanticMockProvider();

  for (const v of FIVE_BENCHMARK_VIDEOS) {
    const startTime = Date.now();
    console.log(`🎬 Processing [${v.domain}]: "${v.title}"`);

    let rawTranscript: RawTranscript;
    if (v.mockSegments) {
      rawTranscript = {
        video_id: v.video_id,
        url: v.url,
        title: v.title,
        channel: v.channel,
        duration_seconds: v.mockSegments[v.mockSegments.length - 1].end,
        language: 'en',
        retrieved_at: new Date().toISOString(),
        transcript_type: 'SYNTHETIC_TEST',
        segments: v.mockSegments
      };
    } else {
      rawTranscript = await fetchRawTranscript(v.video_id, { title: v.title, channel: v.channel });
    }

    const clean = cleanTranscript(rawTranscript);
    const ir = await extractKnowledgeIR(clean, provider);
    const validation = validateKnowledgeIR(ir, clean);
    const routing = routeKnowledgeIR(ir);
    const proposals = generateSynthesisProposals(ir, routing);

    const outDir = path.join(pipelineRunsDir, v.video_id);
    saveProposalsToLedger(v.video_id, outDir, routing, proposals);

    const totalLatency = Date.now() - startTime;
    const tokens = (ir.claims?.length || 0) * 20 + 200;

    const manifest: VideoManifest = {
      run_id: `RUN-${v.video_id}-${Date.now()}`,
      video_id: v.video_id,
      video_url: v.url,
      title: v.title,
      channel: v.channel,
      domain_archetype: v.domain,
      duration_seconds: rawTranscript.duration_seconds || 0,
      ingestion_timestamp: new Date().toISOString(),
      pipeline_version: 'v1.0.0-phase10-frozen',
      model: provider.modelName,
      provider: provider.providerName,
      stages_metrics: {
        raw_segments: rawTranscript.segments.length,
        cleaned_segments: clean.cleaned_segments.length,
        ir_claims: ir.claims?.length || 0,
        ir_mechanisms: ir.mechanisms?.length || 0,
        ir_examples: ir.examples_and_analogies?.length || 0,
        knowledge_units: routing.total_knowledge_units,
        filtered_non_canonical: routing.summary.filtered_non_canonical,
        quarantined: routing.summary.quarantined,
        already_covered: routing.summary.already_covered,
        proposals_generated: proposals.length,
        latency_ms: totalLatency,
        tokens_consumed: tokens
      }
    };

    manifests.push(manifest);

    summaryTable.push({
      Domain: v.domain,
      Title: v.title.slice(0, 35) + '...',
      Raw_Segs: rawTranscript.segments.length,
      KUs: routing.total_knowledge_units,
      Filtered: routing.summary.filtered_non_canonical,
      Already_Covered: routing.summary.already_covered,
      Proposals: proposals.length,
      Latency_ms: totalLatency
    });
  }

  // Save master benchmark manifest to data/
  const manifestPath = path.join(codexRoot, 'data', 'phase10-corpus-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifests, null, 2), 'utf8');

  return { manifests, summaryTable };
}
