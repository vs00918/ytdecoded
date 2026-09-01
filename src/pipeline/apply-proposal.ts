import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { fileURLToPath } from 'node:url';
import { computeFileHash, type SynthesisProposal } from './synthesis-candidate.ts';
import type { AuditEvent } from './proposal-types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const topicsDir = path.join(codexRoot, 'src', 'content', 'topics');
const ledgerPath = path.join(codexRoot, 'data', 'proposals-ledger.json');
const auditLogPath = path.join(codexRoot, 'data', 'audit-log.json');

export interface ApplyResult {
  success: boolean;
  proposal_id: string;
  target_file: string;
  state: 'APPLIED' | 'FAILED';
  hash_before: string;
  hash_after: string;
  error?: string;
}

export function loadProposalsLedger(): SynthesisProposal[] {
  if (!fs.existsSync(ledgerPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  } catch {
    return [];
  }
}

export function saveProposalsLedger(proposals: SynthesisProposal[]) {
  if (!fs.existsSync(path.dirname(ledgerPath))) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(proposals, null, 2), 'utf8');
}

export function recordAuditEvent(event: AuditEvent) {
  let log: AuditEvent[] = [];
  if (fs.existsSync(auditLogPath)) {
    try {
      log = JSON.parse(fs.readFileSync(auditLogPath, 'utf8'));
    } catch {
      log = [];
    }
  }
  log.push(event);
  if (!fs.existsSync(path.dirname(auditLogPath))) {
    fs.mkdirSync(path.dirname(auditLogPath), { recursive: true });
  }
  fs.writeFileSync(auditLogPath, JSON.stringify(log, null, 2), 'utf8');
}

export function applyProposal(
  proposalId: string,
  options?: {
    action?: 'APPROVE' | 'EDIT' | 'REJECT';
    editedSnippet?: string;
    reviewerNotes?: string;
  }
): ApplyResult {
  const ledger = loadProposalsLedger();
  const proposalIndex = ledger.findIndex((p) => p.proposal_id === proposalId);

  if (proposalIndex === -1) {
    throw new Error(`Proposal ID "${proposalId}" not found in proposals ledger.`);
  }

  const proposal = ledger[proposalIndex];
  const prevState = proposal.state;

  // Handle REJECTION
  if (options?.action === 'REJECT') {
    proposal.state = 'REJECTED';
    proposal.human_notes = options.reviewerNotes || 'Rejected by curator during review';
    proposal.updated_at = new Date().toISOString();
    saveProposalsLedger(ledger);

    recordAuditEvent({
      audit_id: `AUD-${Date.now()}`,
      proposal_id: proposal.proposal_id,
      timestamp: new Date().toISOString(),
      previous_state: prevState,
      new_state: 'REJECTED',
      action: 'REJECT',
      target_topic_slug: proposal.target_topic_slug,
      reviewer_notes: options.reviewerNotes
    });

    return {
      success: true,
      proposal_id: proposalId,
      target_file: proposal.target_topic_slug ? `${proposal.target_topic_slug}.md` : 'NEW_TOPIC',
      state: 'APPLIED', // Action completed
      hash_before: proposal.target_content_hash_before || '',
      hash_after: proposal.target_content_hash_before || ''
    };
  }

  // Handle HUMAN EDITING
  if (options?.editedSnippet) {
    proposal.proposed_diff.proposed_snippet = options.editedSnippet;
    proposal.provenance_mode = 'HUMAN_EDITED';
    proposal.state = 'EDITED';
  }

  // If Target is an Existing Topic
  if (proposal.target_topic_slug) {
    const targetFile = path.join(topicsDir, `${proposal.target_topic_slug}.md`);
    if (!fs.existsSync(targetFile)) {
      proposal.state = 'FAILED';
      saveProposalsLedger(ledger);
      throw new Error(`Target file does not exist: ${targetFile}`);
    }

    const currentContent = fs.readFileSync(targetFile, 'utf8');
    const currentHash = computeFileHash(currentContent);

    // Stale proposal protection: Ensure target file hasn't mutated under us
    if (proposal.target_content_hash_before && currentHash !== proposal.target_content_hash_before) {
      proposal.state = 'FAILED';
      saveProposalsLedger(ledger);
      throw new Error(
        `STALE_PROPOSAL: Target topic "${proposal.target_topic_slug}" has been modified since proposal creation (Expected hash: ${proposal.target_content_hash_before.slice(0, 8)}, Current hash: ${currentHash.slice(0, 8)}). Application aborted.`
      );
    }

    // Construct new content non-destructively
    const snippetToInsert = `\n\n${proposal.proposed_diff.proposed_snippet.trim()}\n`;
    const newContent = currentContent.trimEnd() + snippetToInsert;

    // Validate frontmatter and markdown schema
    try {
      const parsed = matter(newContent);
      if (!parsed.data.title || !parsed.data.volume) {
        throw new Error('Frontmatter validation failed on proposed content.');
      }
    } catch (err: any) {
      proposal.state = 'FAILED';
      saveProposalsLedger(ledger);
      throw new Error(`Schema validation error during application: ${err.message}`);
    }

    // Atomic Write
    proposal.previous_content_backup = currentContent;
    fs.writeFileSync(targetFile, newContent, 'utf8');

    const newHash = computeFileHash(newContent);
    proposal.target_content_hash_after = newHash;
    proposal.state = 'APPLIED';
    proposal.applied_at = new Date().toISOString();
    proposal.updated_at = new Date().toISOString();
    saveProposalsLedger(ledger);

    recordAuditEvent({
      audit_id: `AUD-${Date.now()}`,
      proposal_id: proposal.proposal_id,
      timestamp: new Date().toISOString(),
      previous_state: prevState,
      new_state: 'APPLIED',
      action: options?.editedSnippet ? 'EDIT' : 'APPLY',
      target_topic_slug: proposal.target_topic_slug,
      target_content_hash_before: currentHash,
      target_content_hash_after: newHash,
      reviewer_notes: options?.reviewerNotes
    });

    return {
      success: true,
      proposal_id: proposalId,
      target_file: targetFile,
      state: 'APPLIED',
      hash_before: currentHash,
      hash_after: newHash
    };
  }

  // If Target is a NEW TOPIC (Draft creation)
  const newSlug = proposal.video_id ? `draft-${proposal.video_id}` : `draft-new-topic-${Date.now()}`;
  const targetFile = path.join(topicsDir, `${newSlug}.md`);
  fs.writeFileSync(targetFile, proposal.proposed_diff.proposed_snippet, 'utf8');

  const newHash = computeFileHash(proposal.proposed_diff.proposed_snippet);
  proposal.target_topic_slug = newSlug;
  proposal.target_content_hash_after = newHash;
  proposal.state = 'APPLIED';
  proposal.applied_at = new Date().toISOString();
  saveProposalsLedger(ledger);

  recordAuditEvent({
    audit_id: `AUD-${Date.now()}`,
    proposal_id: proposal.proposal_id,
    timestamp: new Date().toISOString(),
    previous_state: prevState,
    new_state: 'APPLIED',
    action: 'APPLY',
    target_topic_slug: newSlug,
    target_content_hash_after: newHash
  });

  return {
    success: true,
    proposal_id: proposalId,
    target_file: targetFile,
    state: 'APPLIED',
    hash_before: 'EMPTY',
    hash_after: newHash
  };
}
