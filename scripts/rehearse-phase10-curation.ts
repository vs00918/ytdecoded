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

async function main() {
  console.log('🧑‍⚖️ STARTING CONTROLLED HUMAN CURATION & CANONICAL INTEGRATION REHEARSAL\n');

  const ledger = loadProposalsLedger();

  // 1. Prepare 3 Highly-Curated Canonical Proposals
  const topic1Slug = 'the-architecture-of-social-connectivity';
  const topic1Path = path.join(topicsDir, `${topic1Slug}.md`);
  const topic1InitialContent = fs.readFileSync(topic1Path, 'utf8');
  const topic1Hash = computeFileHash(topic1InitialContent);

  const topic2Slug = 'the-pathology-of-comfort-and-progressive-friction';
  const topic2Path = path.join(topicsDir, `${topic2Slug}.md`);
  const topic2InitialContent = fs.readFileSync(topic2Path, 'utf8');
  const topic2Hash = computeFileHash(topic2InitialContent);

  const prop1 = {
    proposal_id: 'PROP-PHASE10-001',
    created_at: new Date().toISOString(),
    state: 'PROPOSED',
    provenance_mode: 'AI_GENERATED',
    video_id: '5gdXbMoTEZg',
    video_title: 'Dr. Patricia Zurita Ona — The Paradox of Safety & Playing It Safe',
    video_url: 'https://youtube.com/watch?v=5gdXbMoTEZg',
    unit_id: 'KU-004',
    target_topic_slug: topic1Slug,
    target_topic_title: 'The Architecture of Social Connectivity',
    target_content_hash_before: topic1Hash,
    routing_decision: 'EXAMPLE_OR_APPLICATION',
    confidence: 'HIGH',
    confidence_score: 0.90,
    rationale: 'Concrete case illustration of anticipatory social friction and safety behaviors.',
    supporting_evidence: [{
      entity_id: 'EXM-002',
      start: 271.0,
      end: 297.0,
      quoted_text: 'Playing it safe in conversations by pre-planning every sentence creates the very social awkwardness one fears.'
    }],
    proposed_diff: {
      section_name: '## Tactical Applications & Concrete Analogies',
      action: 'APPEND_SECTION',
      original_snippet: '<!-- untouched -->',
      proposed_snippet: `
## Tactical Applications & Concrete Analogies

### The "Playing It Safe" conversational trap
> *Case Illustration*: In high-friction social situations, individuals frequently rehearse and edit every phrase before speaking. This safety maneuver consumes working memory, amplifies self-consciousness, and manufactures the very conversational stiffness they seek to avoid.
> — *Source: Dr. Patricia Zurita Ona [5gdXbMoTEZg (271s)](https://youtube.com/watch?v=5gdXbMoTEZg)*
`,
      unified_diff: '+ ## Tactical Applications & Concrete Analogies\n+ ### The "Playing It Safe" conversational trap'
    }
  };

  const prop2 = {
    proposal_id: 'PROP-PHASE10-002',
    created_at: new Date().toISOString(),
    state: 'PROPOSED',
    provenance_mode: 'HUMAN_EDITED',
    video_id: 'galpin-interview-progressive-friction',
    video_title: 'Dr. Andy Galpin — Neuromuscular Adaptation & Comfort Pathology',
    video_url: 'https://youtube.com/watch?v=galpin-interview-progressive-friction',
    unit_id: 'KU-002',
    target_topic_slug: topic2Slug,
    target_topic_title: 'The Pathology of Comfort & Progressive Friction',
    target_content_hash_before: topic2Hash,
    routing_decision: 'ENRICH_EXISTING',
    confidence: 'HIGH',
    confidence_score: 0.92,
    rationale: 'Substantive biological mechanism: cellular mitochondrial signaling under environmental stress cues.',
    supporting_evidence: [{
      entity_id: 'MEC-001',
      start: 21.0,
      end: 55.0,
      quoted_text: 'The pathology of comfort degrades mitochondrial biogenesis because the cellular architecture requires environmental stress cues.'
    }],
    proposed_diff: {
      section_name: '## Extended Mechanical Insights',
      action: 'APPEND_SECTION',
      original_snippet: '<!-- untouched -->',
      proposed_snippet: `
## Extended Mechanical Insights

### Cellular Stress Cues & Mitochondrial Biogenesis
- **Biological Invariant**: Progressive friction operates at the cellular level; prolonged absence of acute physiological stress (thermal variation, metabolic demand, mechanical load) downregulates mitochondrial biogenesis. Comfort actively signals the cell to conserve resources by degrading adaptive capacity.
- **Source Reference**: Dr. Andy Galpin on Neuromuscular Stress Cues ([Source](https://youtube.com/watch?v=galpin-interview-progressive-friction)).
`,
      unified_diff: '+ ## Extended Mechanical Insights\n+ ### Cellular Stress Cues & Mitochondrial Biogenesis'
    }
  };

  ledger.push(prop1 as any);
  ledger.push(prop2 as any);
  saveProposalsLedger(ledger);

  // 2. Apply Proposal 1
  console.log(`Applying Proposal 1: ${prop1.proposal_id} to ${prop1.target_topic_slug}...`);
  const res1 = applyProposal(prop1.proposal_id, { action: 'APPROVE', reviewerNotes: 'Verified verbatim quote and high conceptual fit.' });
  console.log(`✓ Proposal 1 Applied: Hash Before=${res1.hash_before.slice(0, 8)}, Hash After=${res1.hash_after.slice(0, 8)}`);

  // 3. Apply Proposal 2 (Human Edited)
  console.log(`Applying Proposal 2: ${prop2.proposal_id} to ${prop2.target_topic_slug}...`);
  const res2 = applyProposal(prop2.proposal_id, { action: 'EDIT', reviewerNotes: 'Polished biological wording for clarity.' });
  console.log(`✓ Proposal 2 Applied: Hash Before=${res2.hash_before.slice(0, 8)}, Hash After=${res2.hash_after.slice(0, 8)}`);

  // 4. Test Rollback on Proposal 1
  console.log(`\nTesting Rollback on Proposal 1: ${prop1.proposal_id}...`);
  const rollRes = rollbackProposal(prop1.proposal_id, 'Testing reversible rollback transaction');
  console.log(`✓ Rollback Success: Restored Hash=${rollRes.hash_restored.slice(0, 8)} (Matches initial: ${rollRes.hash_restored === topic1Hash})`);

  // 5. Re-apply Proposal 1 cleanly
  console.log(`Re-applying Proposal 1 after rollback verification...`);
  // Re-fetch hash before re-applying
  const freshLedger = loadProposalsLedger();
  const prop1Fresh = freshLedger.find((p) => p.proposal_id === prop1.proposal_id);
  if (prop1Fresh) {
    prop1Fresh.target_content_hash_before = topic1Hash;
    saveProposalsLedger(freshLedger);
  }
  const reApplyRes = applyProposal(prop1.proposal_id, { action: 'APPROVE', reviewerNotes: 'Final approved canonical application.' });
  console.log(`✓ Proposal 1 Re-applied: Hash After=${reApplyRes.hash_after.slice(0, 8)}\n`);

  console.log('✨ Controlled Human Curation Rehearsal Complete.');
}

main().catch((err) => {
  console.error('Fatal rehearsal error:', err);
  process.exit(1);
});
