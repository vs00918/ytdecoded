import { test, describe } from 'node:test';
import assert from 'node:assert';
import { extractVideoId } from '../src/pipeline/fetch-transcript.ts';
import { cleanTranscript } from '../src/pipeline/clean-transcript.ts';
import { extractKnowledgeIR } from '../src/pipeline/extract-ir.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';

// Mock synthetic raw transcript
const mockRaw = {
  video_id: 'test-vid-01',
  url: 'https://www.youtube.com/watch?v=test-vid-01',
  title: 'Test Cognitive Science Lecture',
  duration_seconds: 300,
  language: 'en',
  retrieved_at: '2026-09-01T00:00:00.000Z',
  transcript_type: 'SYNTHETIC_TEST',
  segments: [
    { id: 'seg-0001', start: 0.0, end: 4.5, duration: 4.5, text: 'Welcome back to the channel everyone!' },
    { id: 'seg-0002', start: 4.6, end: 9.0, duration: 4.4, text: 'Today we will discuss dopamine baseline mechanics.' },
    { id: 'seg-0003', start: 9.1, end: 14.0, duration: 4.9, text: 'Today we will discuss dopamine baseline mechanics.' }, // duplicate ASR
    { id: 'seg-0004', start: 14.1, end: 20.0, duration: 5.9, text: 'This video is brought to you by our sponsor promo code TEST.' },
    { id: 'seg-0005', start: 20.1, end: 28.0, duration: 7.9, text: 'The dopamine baseline is defined as the tonic level of dopamine circulating in the striatum.' },
    { id: 'seg-0006', start: 28.1, end: 36.0, duration: 7.9, text: 'Because tonic levels drop after a spike, it triggers severe craving and lethargy.' },
    { id: 'seg-0007', start: 36.1, end: 44.0, duration: 7.9, text: 'For example, imagine a rubber band being pulled taut before snapping back.' },
    { id: 'seg-0008', start: 44.1, end: 50.0, duration: 5.9, text: 'The law of dopamine states that every peak is followed by an equal trough.' }
  ]
};

describe('Phase 6: YouTube Ingestion & Knowledge IR Pipeline', () => {
  test('extractVideoId handles multiple YouTube URL formats', () => {
    assert.strictEqual(extractVideoId('nZNKnlfwuI8'), 'nZNKnlfwuI8');
    assert.strictEqual(extractVideoId('https://youtu.be/nZNKnlfwuI8?si=123'), 'nZNKnlfwuI8');
    assert.strictEqual(extractVideoId('https://www.youtube.com/watch?v=5gdXbMoTEZg'), '5gdXbMoTEZg');
    assert.strictEqual(extractVideoId('https://youtube.com/shorts/CqgmozFr_GM'), 'CqgmozFr_GM');
    assert.strictEqual(extractVideoId('invalid-url-here'), null);
  });

  test('cleanTranscript removes sponsor and ASR duplicates while preserving analogies', () => {
    const cleaned = cleanTranscript(mockRaw);

    const removedIds = cleaned.audit_log.filter(a => a.action === 'REMOVED').map(a => a.segment_id);
    assert.strictEqual(removedIds.includes('seg-0003'), true, 'Duplicate segment was not removed');
    assert.strictEqual(removedIds.includes('seg-0004'), true, 'Sponsor segment was not removed');

    const keptIds = cleaned.cleaned_segments.map(s => s.id);
    assert.strictEqual(keptIds.includes('seg-0005'), true);
    assert.strictEqual(keptIds.includes('seg-0007'), true);
  });

  test('extractKnowledgeIR extracts claims, concepts, mechanisms, and analogies with spans', async () => {
    const cleaned = cleanTranscript(mockRaw);
    const ir = await extractKnowledgeIR(cleaned);

    assert.strictEqual(ir.video_id, 'test-vid-01');
    assert.strictEqual(ir.claims.length > 0, true);

    for (const claim of ir.claims) {
      assert.strictEqual(claim.source_spans.length > 0, true);
      assert.strictEqual(claim.source_spans[0].segment_ids.length > 0, true);
    }
  });

  test('validateKnowledgeIR detects referential integrity and unbacked claims', async () => {
    const cleaned = cleanTranscript(mockRaw);
    const ir = await extractKnowledgeIR(cleaned);

    const report = validateKnowledgeIR(ir, cleaned);
    assert.strictEqual(report.is_valid, true);
    assert.strictEqual(report.unbacked_claims, 0);
    assert.strictEqual(report.dangling_references, 0);

    // Test failure case: Unbacked claim
    const badIR = {
      ...ir,
      claims: [
        ...ir.claims,
        {
          id: 'CLM-BAD',
          claim_text: 'Unsupported fake claim without provenance',
          stance: 'ASSERTED',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [] // Missing span
        }
      ]
    };

    const badReport = validateKnowledgeIR(badIR, cleaned);
    assert.strictEqual(badReport.is_valid, false);
    assert.strictEqual(badReport.unbacked_claims, 1);
  });

  test('validateKnowledgeIR detects dangling segment IDs', async () => {
    const cleaned = cleanTranscript(mockRaw);
    const ir = await extractKnowledgeIR(cleaned);

    const badIR = {
      ...ir,
      claims: [
        {
          id: 'CLM-DANGLING',
          claim_text: 'Claim pointing to non-existent segment',
          stance: 'ASSERTED',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [{ start: 10, end: 20, segment_ids: ['seg-9999'], quoted_text: 'sample' }]
        }
      ]
    };

    const badReport = validateKnowledgeIR(badIR, cleaned);
    assert.strictEqual(badReport.is_valid, false);
    assert.strictEqual(badReport.dangling_references, 1);
  });
});
