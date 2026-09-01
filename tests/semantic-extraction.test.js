import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTranscript } from '../src/pipeline/clean-transcript.ts';
import { extractKnowledgeIR } from '../src/pipeline/extract-ir.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';
import { segmentTranscriptSemantically } from '../src/pipeline/semantic-segmenter.ts';
import { SemanticMockProvider, getLLMProvider } from '../src/pipeline/llm-provider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenBenchmarkPath = path.join(__dirname, 'golden-benchmark.json');
const goldenBenchmark = JSON.parse(fs.readFileSync(goldenBenchmarkPath, 'utf8'));

function createSyntheticTranscript(id, text) {
  return {
    video_id: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Semantic Test ${id}`,
    duration_seconds: 60,
    language: 'en',
    retrieved_at: new Date().toISOString(),
    transcript_type: 'SYNTHETIC_TEST',
    segments: [
      { id: 'seg-0001', start: 0.0, end: 15.0, duration: 15.0, text }
    ]
  };
}

describe('Phase 7: Semantic Extraction Engine & Golden Benchmark', () => {

  test('LLM Provider abstraction returns structured response with token metrics', async () => {
    const provider = new SemanticMockProvider();
    const res = await provider.generateStructured('[seg-0001] (0.0s-10.0s): Dopamine baseline governs focus.', {});

    assert.strictEqual(res.provider, 'SemanticMock');
    assert.strictEqual(res.usage.totalTokens > 0, true);
    assert.strictEqual(res.data.claims.length > 0, true);
  });

  test('Semantic Segmenter constructs coherent chunks with timestamps', () => {
    const raw = {
      video_id: 'seg-test',
      url: 'https://youtube.com',
      duration_seconds: 120,
      language: 'en',
      retrieved_at: new Date().toISOString(),
      transcript_type: 'SYNTHETIC_TEST',
      segments: Array.from({ length: 20 }, (_, i) => ({
        id: `seg-${String(i + 1).padStart(4, '0')}`,
        start: i * 5,
        end: (i + 1) * 5,
        duration: 5,
        text: `This is sentence number ${i + 1} explaining cognitive mechanics.`
      }))
    };

    const cleaned = cleanTranscript(raw);
    const chunks = segmentTranscriptSemantically(cleaned, { targetWordCount: 50 });

    assert.strictEqual(chunks.length > 0, true);
    assert.strictEqual(chunks[0].segmentIds.length > 0, true);
    assert.strictEqual(chunks[0].formattedPromptText.includes('[seg-0001]'), true);
  });

  test('Golden Benchmark: Stance & Epistemic Status Validation', async () => {
    const provider = new SemanticMockProvider();

    for (const item of goldenBenchmark) {
      const raw = createSyntheticTranscript(item.id, item.text);
      const cleaned = cleanTranscript(raw);
      const ir = await extractKnowledgeIR(cleaned, { provider });

      if (item.expected_stance) {
        const claim = ir.claims[0];
        assert.strictEqual(claim !== undefined, true, `Missing claim for ${item.id}`);
        assert.strictEqual(claim.stance, item.expected_stance, `Stance mismatch in ${item.id}: expected ${item.expected_stance}, got ${claim.stance}`);
      }

      if (item.expected_type === 'ANALOGY') {
        const analogy = ir.examples_and_analogies[0];
        assert.strictEqual(analogy !== undefined, true, `Missing analogy for ${item.id}`);
        assert.strictEqual(analogy.type, 'ANALOGY');
      }
    }
  });

  test('Exact Substring Provenance: Verbatim quote passes, fabricated quote fails', async () => {
    const raw = createSyntheticTranscript('quote-test', 'Dr. Smith argues that neural feedback loops govern all executive functioning.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned, { provider: new SemanticMockProvider() });

    // Verbatim quote must pass validation
    const validReport = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(validReport.is_valid, true);
    assert.strictEqual(validReport.invalid_quotes_count, 0);

    // Corrupt the quoted_text to simulate LLM hallucination
    ir.claims[0].source_spans[0].quoted_text = 'Completely fabricated fake text that does not appear in transcript';
    const invalidReport = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(invalidReport.is_valid, false);
    assert.strictEqual(invalidReport.invalid_quotes_count, 1);
    assert.strictEqual(invalidReport.errors.some(e => e.includes('INVALID_PROVENANCE_QUOTE_MISMATCH')), true);
  });
});
