import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTranscript } from '../src/pipeline/clean-transcript.ts';
import { extractKnowledgeIR } from '../src/pipeline/extract-ir.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';
import { SemanticMockProvider } from '../src/pipeline/llm-provider.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const goldenPath = path.join(__dirname, 'golden-dataset-v2.json');
const goldenDataset = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));

function makeTestTranscript(id, text) {
  return {
    video_id: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Adversarial Benchmark ${id}`,
    duration_seconds: 60,
    language: 'en',
    retrieved_at: new Date().toISOString(),
    transcript_type: 'SYNTHETIC_TEST',
    segments: [{ id: 'seg-0001', start: 0.0, end: 15.0, duration: 15.0, text }]
  };
}

describe('Phase 7.5: 30-Category Adversarial Benchmark & Epistemic Evaluation', () => {

  const provider = new SemanticMockProvider();

  // Test across all golden benchmark items
  for (const item of goldenDataset) {
    test(`Golden Case [${item.id} - ${item.domain}]: Stance & Scope Validation`, async () => {
      const raw = makeTestTranscript(item.id, item.text);
      const cleaned = cleanTranscript(raw);
      const ir = await extractKnowledgeIR(cleaned, { provider });

      // 1. Referential & Exact Quote Provenance Validation
      const report = validateKnowledgeIR(ir, cleaned);
      assert.strictEqual(report.is_valid, true, `Validation failed for ${item.id}: ${report.errors.join(', ')}`);
      assert.strictEqual(report.invalid_quotes_count, 0);

      // 2. Check Extracted Entity Stance
      const claim = ir.claims[0];
      if (item.expected_category === 'ANALOGY') {
        assert.strictEqual(ir.examples_and_analogies.length > 0, true, `Expected analogy in ${item.id}`);
      } else if (claim) {
        assert.strictEqual(claim.stance, item.expected_stance, `Stance mismatch in ${item.id}: expected ${item.expected_stance}, got ${claim.stance}`);
      }
    });
  }

  // Adversarial Fail-Closed Tests
  test('Fail-Closed: Fabricated quote triggers INVALID_PROVENANCE error', async () => {
    const raw = makeTestTranscript('fail-close-1', 'The vagus nerve communicates bidirectional somatic state.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned, { provider });

    // Simulate LLM hallucination
    ir.claims[0].source_spans[0].quoted_text = 'Fabricated hallucinated quotation';
    const report = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(report.is_valid, false);
    assert.strictEqual(report.errors.some(e => e.includes('INVALID_PROVENANCE_QUOTE_MISMATCH')), true);
  });

  test('Fail-Closed: Dangling segment reference triggers validation rejection', async () => {
    const raw = makeTestTranscript('fail-close-2', 'Enteric serotonin governs local motility.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned, { provider });

    ir.claims[0].source_spans[0].segment_ids = ['seg-99999'];
    const report = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(report.is_valid, false);
    assert.strictEqual(report.dangling_references >= 1, true);
  });
});
