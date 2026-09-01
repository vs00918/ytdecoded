import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadProposalsLedger, saveProposalsLedger, recordAuditEvent } from './apply-proposal.ts';
import { computeFileHash } from './synthesis-candidate.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const topicsDir = path.join(codexRoot, 'src', 'content', 'topics');

export interface RollbackResult {
  success: boolean;
  proposal_id: string;
  target_file: string;
  state: 'REVERTED' | 'FAILED';
  hash_restored: string;
  error?: string;
}

export function rollbackProposal(proposalId: string, reviewerNotes?: string): RollbackResult {
  const ledger = loadProposalsLedger();
  const proposal = ledger.find((p) => p.proposal_id === proposalId);

  if (!proposal) {
    throw new Error(`Proposal ID "${proposalId}" not found in proposals ledger.`);
  }

  if (proposal.state !== 'APPLIED') {
    throw new Error(`Proposal "${proposalId}" is in state "${proposal.state}", not "APPLIED". Rollback cannot proceed.`);
  }

  if (!proposal.target_topic_slug) {
    throw new Error(`Proposal "${proposalId}" has no target topic slug.`);
  }

  const targetFile = path.join(topicsDir, `${proposal.target_topic_slug}.md`);
  if (!fs.existsSync(targetFile)) {
    throw new Error(`Target file does not exist for rollback: ${targetFile}`);
  }

  // If this was a new draft file creation
  if (proposal.target_topic_slug.startsWith('draft-')) {
    fs.unlinkSync(targetFile);
    proposal.state = 'REVERTED';
    proposal.updated_at = new Date().toISOString();
    saveProposalsLedger(ledger);

    recordAuditEvent({
      audit_id: `AUD-${Date.now()}`,
      proposal_id: proposal.proposal_id,
      timestamp: new Date().toISOString(),
      previous_state: 'APPLIED',
      new_state: 'REVERTED',
      action: 'REVERT',
      target_topic_slug: proposal.target_topic_slug,
      reviewer_notes: reviewerNotes || 'New topic draft deleted during rollback'
    });

    return {
      success: true,
      proposal_id: proposalId,
      target_file: targetFile,
      state: 'REVERTED',
      hash_restored: 'DELETED'
    };
  }

  // If this was an enrichment of an existing chapter
  if (!proposal.previous_content_backup) {
    throw new Error(`No previous content backup stored for proposal "${proposalId}". Cannot perform safe rollback.`);
  }

  fs.writeFileSync(targetFile, proposal.previous_content_backup, 'utf8');
  const restoredHash = computeFileHash(proposal.previous_content_backup);

  proposal.state = 'REVERTED';
  proposal.updated_at = new Date().toISOString();
  saveProposalsLedger(ledger);

  recordAuditEvent({
    audit_id: `AUD-${Date.now()}`,
    proposal_id: proposal.proposal_id,
    timestamp: new Date().toISOString(),
    previous_state: 'APPLIED',
    new_state: 'REVERTED',
    action: 'REVERT',
    target_topic_slug: proposal.target_topic_slug,
    target_content_hash_after: restoredHash,
    reviewer_notes: reviewerNotes || 'Rolled back to previous canonical content'
  });

  return {
    success: true,
    proposal_id: proposalId,
    target_file: targetFile,
    state: 'REVERTED',
    hash_restored: restoredHash
  };
}
