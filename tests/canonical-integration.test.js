import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyProposal, loadProposalsLedger, saveProposalsLedger } from '../src/pipeline/apply-proposal.ts';
import { rollbackProposal } from '../src/pipeline/rollback-proposal.ts';
import { computeFileHash } from '../src/pipeline/synthesis-candidate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..');
const topicsDir = path.join(codexRoot, 'src', 'content', 'topics');
const targetTopicSlug = 'the-architecture-of-social-connectivity';
const targetFilePath = path.join(topicsDir, `${targetTopicSlug}.md`);

describe('Phase 9: Controlled Canonical Integration & Rehearsal Suite', () => {

  const initialContent = fs.readFileSync(targetFilePath, 'utf8');
  const initialHash = computeFileHash(initialContent);

  test('Rehearsal 1: Atomic Application & Rollback of an Approved Proposal', () => {
    const testProposal = {
      proposal_id: 'PROP-TEST-001',
      created_at: new Date().toISOString(),
      state: 'PROPOSED',
      provenance_mode: 'AI_GENERATED',
      video_id: '5gdXbMoTEZg',
      video_title: 'Dr. Patricia Zurita Ona - Paradox of Safety',
      video_url: 'https://youtube.com/watch?v=5gdXbMoTEZg',
      unit_id: 'KU-004',
      target_topic_slug: targetTopicSlug,
      target_topic_title: 'The Architecture of Social Connectivity',
      target_content_hash_before: initialHash,
      routing_decision: 'EXAMPLE_OR_APPLICATION',
      confidence: 'HIGH',
      confidence_score: 0.90,
      rationale: 'Illustrative case application of social friction.',
      supporting_evidence: [{
        entity_id: 'EXM-002',
        start: 291.0,
        end: 297.0,
        quoted_text: 'He struggles with the fear of saying the wrong thing at parties.'
      }],
      proposed_diff: {
        section_name: '## Tactical Applications & Concrete Analogies',
        action: 'APPEND_SECTION',
        original_snippet: '<!-- original -->',
        proposed_snippet: '### Preserved Case Analogy\n> "He struggles with the fear of saying the wrong thing at parties."\n> — *Source: [5gdXbMoTEZg (291s)](https://youtube.com/watch?v=5gdXbMoTEZg)*',
        unified_diff: '+ ### Preserved Case Analogy'
      }
    };

    // Save test proposal to ledger
    const ledger = loadProposalsLedger();
    ledger.push(testProposal);
    saveProposalsLedger(ledger);

    // Apply proposal
    const result = applyProposal('PROP-TEST-001');
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.state, 'APPLIED');

    // Verify content on disk changed and contains new section
    const appliedContent = fs.readFileSync(targetFilePath, 'utf8');
    assert.strictEqual(appliedContent.includes('### Preserved Case Analogy'), true);

    // Perform Rollback
    const rollResult = rollbackProposal('PROP-TEST-001');
    assert.strictEqual(rollResult.success, true);
    assert.strictEqual(rollResult.state, 'REVERTED');

    // Verify content on disk restored byte-for-byte
    const restoredContent = fs.readFileSync(targetFilePath, 'utf8');
    assert.strictEqual(restoredContent, initialContent);
    assert.strictEqual(computeFileHash(restoredContent), initialHash);
  });

  test('Rehearsal 2: Rejection preserves canonical content without mutation', () => {
    const testProposal = {
      proposal_id: 'PROP-TEST-002',
      created_at: new Date().toISOString(),
      state: 'PROPOSED',
      provenance_mode: 'AI_GENERATED',
      video_id: '5gdXbMoTEZg',
      video_url: 'https://youtube.com',
      unit_id: 'KU-005',
      target_topic_slug: targetTopicSlug,
      target_topic_title: 'The Architecture of Social Connectivity',
      target_content_hash_before: initialHash,
      routing_decision: 'EXAMPLE_OR_APPLICATION',
      confidence: 'HIGH',
      confidence_score: 0.85,
      rationale: 'Test proposal for rejection rehearsal.',
      supporting_evidence: [],
      proposed_diff: {
        section_name: '## Test',
        action: 'APPEND_SECTION',
        original_snippet: '',
        proposed_snippet: 'Should never be written.',
        unified_diff: ''
      }
    };

    const ledger = loadProposalsLedger();
    ledger.push(testProposal);
    saveProposalsLedger(ledger);

    const result = applyProposal('PROP-TEST-002', { action: 'REJECT', reviewerNotes: 'Not relevant to core thesis' });
    assert.strictEqual(result.success, true);

    // Verify ledger state
    const updatedLedger = loadProposalsLedger();
    const rejectedProp = updatedLedger.find((p) => p.proposal_id === 'PROP-TEST-002');
    assert.strictEqual(rejectedProp.state, 'REJECTED');

    // Verify disk content unchanged
    const currentContent = fs.readFileSync(targetFilePath, 'utf8');
    assert.strictEqual(currentContent, initialContent);
  });

  test('Rehearsal 3: Stale Proposal Detection aborts application when hash mismatches', () => {
    const staleProposal = {
      proposal_id: 'PROP-TEST-003',
      created_at: new Date().toISOString(),
      state: 'PROPOSED',
      provenance_mode: 'AI_GENERATED',
      video_id: '5gdXbMoTEZg',
      video_url: 'https://youtube.com',
      unit_id: 'KU-006',
      target_topic_slug: targetTopicSlug,
      target_topic_title: 'The Architecture of Social Connectivity',
      target_content_hash_before: 'STALE_OUTDATED_HASH_1234567890abcdef', // Mismatched hash
      routing_decision: 'ENRICH_EXISTING',
      confidence: 'HIGH',
      confidence_score: 0.90,
      rationale: 'Stale test proposal.',
      supporting_evidence: [],
      proposed_diff: {
        section_name: '## Stale Section',
        action: 'APPEND_SECTION',
        original_snippet: '',
        proposed_snippet: 'Stale content.',
        unified_diff: ''
      }
    };

    const ledger = loadProposalsLedger();
    ledger.push(staleProposal);
    saveProposalsLedger(ledger);

    assert.throws(
      () => applyProposal('PROP-TEST-003'),
      /STALE_PROPOSAL/
    );

    // Ensure topic was not modified
    const currentContent = fs.readFileSync(targetFilePath, 'utf8');
    assert.strictEqual(currentContent, initialContent);
  });
});
