import { test, describe } from 'node:test';
import assert from 'node:assert';
import { assessKnowledgeWorthiness } from '../src/pipeline/worthiness-gate.ts';
import { routeKnowledgeUnit } from '../src/pipeline/topic-router.ts';

function createMockUnit(id, text, options = {}) {
  const worthiness = assessKnowledgeWorthiness({
    id,
    text,
    type: options.type || 'CLAIM',
    stance: options.stance,
    scope: options.scope
  });

  return {
    unit_id: id,
    title: text.slice(0, 50),
    core_thesis: text,
    worthiness: worthiness.classification,
    worthiness_assessment: worthiness,
    constituent_entity_ids: [id],
    claims: [{
      id: `CLM-${id}`,
      claim_text: text,
      stance: options.stance || 'ASSERTED',
      epistemic_status: 'SOURCE_EXTRACTED',
      confidence: 'HIGH',
      scope: options.scope || 'UNIVERSAL',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: text }]
    }],
    mechanisms: options.hasMechanism ? [{
      id: `MEC-${id}`,
      title: 'Causal Sequence',
      trigger: 'Trigger',
      steps: [{ step_num: 1, action: 'Stimulus', result: 'Cascade' }],
      outcome: 'Result',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: text }]
    }] : [],
    examples: options.isAnalogy ? [{
      id: `EXM-${id}`,
      type: 'ANALOGY',
      content: text,
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: text }]
    }] : [],
    source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: text }],
    time_range: { start: 0, end: 10 }
  };
}

describe('Phase 8.5: Knowledge Worthiness & Semantic Routing Audit', () => {

  test('Case 1: Biography / Personal Intro filtered as non-canonical', () => {
    const unit = createMockUnit('case-01', 'When completing my doctoral dissertation as a graduate student on a limited budget, my coffee maker needed to be replaced.');
    assert.strictEqual(unit.worthiness, 'CONTEXT_ONLY');
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'FILTERED_NON_CANONICAL');
  });

  test('Case 2: Personal Anecdote isolated as non-canonical / example (does NOT create new topic)', () => {
    const unit = createMockUnit('case-02', 'My friend Bob once took a cold shower and felt energized for two hours.');
    assert.strictEqual(unit.worthiness === 'CONTEXT_ONLY' || unit.worthiness === 'EXAMPLE_ONLY', true);
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision !== 'NEW_TOPIC', true);
  });

  test('Case 3: One-sentence novel claim without explanatory depth is quarantined', () => {
    const unit = createMockUnit('case-03', 'Quantum coherence might exist in photosynthesis.', { hasMechanism: false });
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'INSUFFICIENT_CONFIDENCE');
    assert.strictEqual(dec.decision !== 'NEW_TOPIC', true);
  });

  test('Case 4: Novel coherent framework with mechanism creates NEW_TOPIC candidate', () => {
    const unit = createMockUnit('case-04', 'Astrophysical magnetar stellar flares modulate interstellar plasma oscillations through relativistic magnetic reconnection.', {
      hasMechanism: true
    });
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'NEW_TOPIC');
    assert.strictEqual(dec.target_topic_slug, null);
  });

  test('Case 5: Existing concept with novel structural mechanism triggers ENRICH_EXISTING', () => {
    const unit = createMockUnit('case-05', 'The vagus nerve modulates cholinergic anti-inflammatory pathway feedback loops in the gut-brain axis.', {
      hasMechanism: true
    });
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'ENRICH_EXISTING');
    assert.strictEqual(dec.target_topic_slug, 'the-second-brain-and-the-gut-mind-axis');
  });

  test('Case 6: Existing concept + scope restriction triggers QUALIFICATION_OR_BOUNDARY', () => {
    const unit = createMockUnit('case-06', 'Administering progressive friction only applies to trained athletes under controlled conditions.', {
      scope: 'DOMAIN_SPECIFIC'
    });
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'QUALIFICATION_OR_BOUNDARY');
    assert.strictEqual(dec.target_topic_slug, 'the-pathology-of-comfort-and-progressive-friction');
  });

  test('Case 7: Existing claim explicitly challenged triggers CONTRADICTION_OR_CHALLENGE', () => {
    const unit = createMockUnit('case-07', 'Recent clinical trials have completely refuted that willpower is a finite glucose muscle.', {
      stance: 'REFUTED'
    });
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'CONTRADICTION_OR_CHALLENGE');
  });

  test('Case 8: Empirical clinical trial data triggers SUPPORTING_EVIDENCE', () => {
    const unit = createMockUnit('case-08', 'A 2024 meta-analysis clinical trial demonstrates that active recall strengthens memory retrieval pathways.');
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'SUPPORTING_EVIDENCE');
    assert.strictEqual(dec.target_topic_slug, 'the-architecture-of-memory-and-active-recall');
  });

  test('Case 9: Same claim repeated without new information triggers ALREADY_COVERED', () => {
    const unit = createMockUnit('case-09', 'Supernormal stimuli exploit evolutionary biological mechanisms by amplifying super-stimulus intensity.');
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'ALREADY_COVERED');
    assert.strictEqual(dec.target_topic_slug, 'supernormal-stimuli-and-urge-surfing');
  });

  test('Case 10: Polite contradiction recognized as dialectical challenge', () => {
    const unit = createMockUnit('case-10', 'Classical economists believed market equilibrium is static, however modern neuroscience proves this wrong.');
    const dec = routeKnowledgeUnit(unit);
    assert.strictEqual(dec.decision, 'CONTRADICTION_OR_CHALLENGE');
  });
});
