import type { SourceSpan } from './types.ts';

export type ProposalState =
  | 'DRAFT'
  | 'VALIDATED'
  | 'PROPOSED'
  | 'HUMAN_REVIEW'
  | 'EDITED'
  | 'APPROVED'
  | 'REJECTED'
  | 'APPLIED'
  | 'FAILED'
  | 'REVERTED';

export type ProvenanceMode = 'AI_GENERATED' | 'HUMAN_EDITED' | 'HUMAN_AUTHORED';

export interface ProposalDiff {
  section_name: string;
  action: 'APPEND_SECTION' | 'INSERT_QUALIFICATION' | 'CREATE_TOPIC_STUB';
  original_snippet: string;
  proposed_snippet: string;
  unified_diff: string;
}

export interface SynthesisProposal {
  proposal_id: string;
  created_at: string;
  updated_at?: string;
  applied_at?: string;
  state: ProposalState;
  provenance_mode: ProvenanceMode;
  video_id: string;
  video_title?: string;
  video_url: string;
  unit_id: string;
  target_topic_slug: string | null;
  target_topic_title: string | null;
  target_content_hash_before?: string; // SHA-256 hash of target topic at proposal creation
  target_content_hash_after?: string;  // SHA-256 hash after application
  routing_decision: string;
  confidence: string;
  confidence_score: number;
  rationale: string;
  supporting_evidence: {
    entity_id: string;
    start: number;
    end: number;
    quoted_text: string;
  }[];
  proposed_diff: ProposalDiff;
  human_notes?: string;
  previous_content_backup?: string;
}

export interface AuditEvent {
  audit_id: string;
  proposal_id: string;
  timestamp: string;
  previous_state: ProposalState;
  new_state: ProposalState;
  action: 'APPROVE' | 'EDIT' | 'REJECT' | 'APPLY' | 'REVERT' | 'FAIL';
  target_topic_slug: string | null;
  target_content_hash_before?: string;
  target_content_hash_after?: string;
  reviewer_notes?: string;
}
