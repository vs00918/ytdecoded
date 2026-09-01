import { test, describe } from 'node:test';
import assert from 'node:assert';
import { cleanTranscript } from '../src/pipeline/clean-transcript.ts';
import { extractKnowledgeIR } from '../src/pipeline/extract-ir.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';

function createSyntheticVideo(id, text) {
  return {
    video_id: id,
    url: `https://www.youtube.com/watch?v=${id}`,
    title: `Adversarial Test Video ${id}`,
    duration_seconds: 60,
    language: 'en',
    retrieved_at: new Date().toISOString(),
    transcript_type: 'SYNTHETIC_TEST',
    segments: [
      { id: 'seg-0001', start: 0.0, end: 15.0, duration: 15.0, text }
    ]
  };
}

describe('Phase 6.5 & Phase 7: Knowledge IR Adversarial Stance & Provenance Tests', () => {

  test('Test 1 (Negation Stance): Correctly identifies refuted/negated propositions', async () => {
    const raw = createSyntheticVideo('adv-negation', 'People often claim high dopamine causes laziness, but this is completely false and scientifically untrue.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);
    const claim = ir.claims[0];
    assert.strictEqual(claim.stance, 'REFUTED');
    assert.strictEqual(claim.epistemic_status, 'SOURCE_EXTRACTED');
  });

  test('Test 2 (Hypothetical): Correctly identifies counterfactual / conditional claims', async () => {
    const raw = createSyntheticVideo('adv-hypo', 'If cortisol levels were to drop to zero permanently, then human motivation system might completely collapse.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);
    assert.strictEqual(ir.claims[0].stance, 'HYPOTHETICAL');
  });

  test('Test 3 (Attribution): Correctly attributes claims to third parties rather than speaker endorsement', async () => {
    const raw = createSyntheticVideo('adv-quote', 'My ideological opponents argue that cognitive feedback loops are useless and should be dismantled immediately.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);
    assert.strictEqual(ir.claims[0].stance, 'ATTRIBUTED');
    assert.strictEqual(ir.claims[0].attributed_to, 'Ideological Opponents');
  });

  test('Test 4 (Rhetorical Sarcasm): Classifies sarcastic hyperbole as rhetorical/example rather than universal truth', async () => {
    const raw = createSyntheticVideo('adv-sarcasm', 'If staring at smartphone screens for ten hours a day built cognitive genius, we would all be Nobel laureates by now.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);
    assert.strictEqual(ir.claims[0].stance, 'EXAMPLE_ONLY');
  });

  test('Test 5 (Rhetorical Question): Stance set to QUESTION rather than ASSERTED fact', async () => {
    const raw = createSyntheticVideo('adv-question', 'Could the breakdown of dopamine receptors actually be the primary cause of societal anomie?');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);
    assert.strictEqual(ir.claims[0].stance, 'QUESTION');
  });

  test('Test 6 (Analogy Recognition): Classifies metaphors and analogies separately', async () => {
    const raw = createSyntheticVideo('adv-analogy', 'The subconscious mind is like an advisory board chiming in with unsolicited suggestions.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.examples_and_analogies.length > 0, true);
    assert.strictEqual(ir.examples_and_analogies[0].type, 'ANALOGY');
  });

  test('Test 7 (Provenance Validation): Rejects invalid span ranges and dangling segment IDs', async () => {
    const raw = createSyntheticVideo('adv-prov', 'The dopamine system is the core neurochemical engine of human action.');
    const cleaned = cleanTranscript(raw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.claims.length > 0, true);

    // Corrupt IR with out-of-bounds start > end
    ir.claims[0].source_spans[0].start = 999;
    ir.claims[0].source_spans[0].end = 10;
    const report1 = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(report1.is_valid, false);
    assert.strictEqual(report1.errors.some(e => e.includes('Invalid span range')), true);

    // Corrupt IR with dangling segment ID
    ir.claims[0].source_spans[0].start = 0;
    ir.claims[0].source_spans[0].end = 10;
    ir.claims[0].source_spans[0].segment_ids = ['seg-99999'];
    const report2 = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(report2.is_valid, false);
    assert.strictEqual(report2.dangling_references >= 1, true);
  });
});
