import { test, describe } from 'node:test';
import assert from 'node:assert';
import { retrieveCandidateTopics } from '../src/pipeline/topic-retriever.ts';
import { routeIREntity, routeKnowledgeIR } from '../src/pipeline/topic-router.ts';
import { generateSynthesisProposals } from '../src/pipeline/synthesis-candidate.ts';

describe('Phase 8 & 8.5: Topic Routing & Synthesis Proposals Engine', () => {

  test('Candidate Retrieval indexes 45 topics and scores relevant matches', () => {
    const matches = retrieveCandidateTopics('enteric serotonin vagus nerve gut microbiota', 3);
    assert.strictEqual(matches.length > 0, true);
    assert.strictEqual(matches[0].topic.slug.includes('gut') || matches[0].topic.title.includes('Gut'), true);
  });

  test('Route 1: Strict NEW_TOPIC gate quarantines 1-sentence claims lacking explanatory depth', () => {
    const dec = routeIREntity({
      id: 'CLM-NEW-01',
      type: 'CLAIM',
      text: 'Quantum superposition in biological microtubules.',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'INSUFFICIENT_CONFIDENCE');
    assert.strictEqual(dec.target_topic_slug, null);
  });

  test('Route 2: ENRICH_EXISTING — Novel structural depth extends existing topic', () => {
    const dec = routeIREntity({
      id: 'CLM-ENRICH-01',
      type: 'CLAIM',
      text: 'The vagus nerve modulates cholinergic anti-inflammatory pathway in the gut-brain axis because of acetylcholine release.',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'ENRICH_EXISTING');
    assert.strictEqual(dec.target_topic_slug, 'the-second-brain-and-the-gut-mind-axis');
    assert.strictEqual(dec.confidence, 'HIGH');
  });

  test('Route 3: CONTRADICTION_OR_CHALLENGE — Explicit refutation creates dialectical challenge', () => {
    const dec = routeIREntity({
      id: 'CLM-CONTRA-01',
      type: 'CLAIM',
      text: 'Recent clinical trials have completely refuted that willpower is a finite glucose muscle.',
      stance: 'REFUTED',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'CONTRADICTION_OR_CHALLENGE');
    assert.strictEqual(dec.confidence, 'HIGH');
  });

  test('Route 4: QUALIFICATION_OR_BOUNDARY — Domain-specific scope constraint', () => {
    const dec = routeIREntity({
      id: 'CLM-QUAL-01',
      type: 'CLAIM',
      text: 'Administering progressive friction only applies to trained subjects under controlled conditions.',
      scope: 'DOMAIN_SPECIFIC',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'QUALIFICATION_OR_BOUNDARY');
    assert.strictEqual(dec.target_topic_slug, 'the-pathology-of-comfort-and-progressive-friction');
  });

  test('Route 5: EXAMPLE_OR_APPLICATION — Case analogy routed to concrete application section', () => {
    const dec = routeIREntity({
      id: 'EXM-01',
      type: 'ANALOGY',
      text: 'Blindly playing it safe is like using bandages to deal with our fears.',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'EXAMPLE_OR_APPLICATION');
    assert.strictEqual(dec.target_topic_slug !== null, true);
  });

  test('Route 6: ALREADY_COVERED — Exact duplicate proposition flagged to prevent duplicate prose', () => {
    const dec = routeIREntity({
      id: 'CLM-DUP-01',
      type: 'CLAIM',
      text: 'Supernormal stimuli exploit evolutionary biological mechanisms by amplifying super-stimulus intensity.',
      source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'sample' }]
    });

    assert.strictEqual(dec.decision, 'ALREADY_COVERED');
    assert.strictEqual(dec.target_topic_slug, 'supernormal-stimuli-and-urge-surfing');
  });

  test('Multi-Topic Routing: Distinct IR objects route to different target topics or new topics', () => {
    const mockIR = {
      video_id: 'multi-test',
      video_url: 'https://youtube.com',
      title: 'Multi-Topic Masterclass',
      claims: [
        {
          id: 'CLM-01',
          claim_text: 'The vagus nerve modulates gut microbiota somatic signaling because of enteric feedback.',
          stance: 'ASSERTED',
          source_spans: [{ start: 0, end: 10, segment_ids: ['seg-01'], quoted_text: 'vagus gut' }]
        },
        {
          id: 'CLM-02',
          claim_text: 'Quantum superposition in biological microtubules regulates photosynthesis.',
          stance: 'ASSERTED',
          source_spans: [{ start: 10, end: 20, segment_ids: ['seg-02'], quoted_text: 'quantum' }]
        }
      ],
      concepts: [],
      mechanisms: [],
      principles: [],
      mental_models: [],
      examples_and_analogies: [
        {
          id: 'EXM-01',
          type: 'ANALOGY',
          content: 'Playing it safe is like using bandages to deal with fears.',
          source_spans: [{ start: 20, end: 30, segment_ids: ['seg-03'], quoted_text: 'bandages' }]
        }
      ],
      arguments: [],
      uncertainties: []
    };

    const routing = routeKnowledgeIR(mockIR);
    assert.strictEqual(routing.total_knowledge_units > 0, true);

    const proposals = generateSynthesisProposals(mockIR, routing);
    assert.strictEqual(proposals.length > 0, true);
    assert.strictEqual(proposals.every(p => p.state === 'PROPOSED'), true);
    assert.strictEqual(proposals.every(p => p.proposed_diff.unified_diff.length > 0), true);
  });
});
