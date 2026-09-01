export type EpistemicStatus = 
  | 'SOURCE_EXTRACTED'    // Directly asserted by speaker
  | 'SOURCE_DERIVED'      // Direct structural implication
  | 'MODEL_INTERPRETATION';// Higher-level AI abstraction

export type ClaimStance =
  | 'ASSERTED'            // Speaker presents as true
  | 'REFUTED'             // Speaker explicitly denies/disproves
  | 'HYPOTHETICAL'        // Counterfactual / conditional condition
  | 'POSSIBLE'            // Speculative / unproven possibility
  | 'UNCERTAIN'           // Speaker expresses explicit doubt
  | 'QUOTED_OTHER'        // Speaker quotes another party
  | 'ATTRIBUTED'          // Stated by third-party researcher/author
  | 'QUESTION'            // Rhetorical or exploratory question
  | 'EXAMPLE_ONLY';       // Single anecdote without universal claim

export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'UNCERTAIN';

export type DensityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface TranscriptSegment {
  id: string;
  start: number; // in seconds
  end: number;   // in seconds
  duration: number;
  text: string;
}

export interface RawTranscript {
  video_id: string;
  url: string;
  title?: string;
  channel?: string;
  duration_seconds?: number;
  language: string;
  retrieved_at: string;
  transcript_type: 'OFFICIAL' | 'AUTO_GENERATED' | 'SYNTHETIC_TEST';
  segments: TranscriptSegment[];
}

export interface CleanedSegment extends TranscriptSegment {
  density_tier: DensityTier;
  status: 'PRESERVED' | 'NORMALIZED';
}

export interface CleaningAuditEntry {
  segment_id: string;
  start: number;
  end: number;
  original_text: string;
  action: 'NORMALIZED' | 'REMOVED';
  reason: string;
}

export interface CleanedTranscript {
  video_id: string;
  cleaned_segments: CleanedSegment[];
  audit_log: CleaningAuditEntry[];
  total_raw_segments: number;
  total_cleaned_segments: number;
  removed_segments_count: number;
  retention_rate_pct: number;
}

export interface SourceSpan {
  start: number;
  end: number;
  segment_ids: string[];
  quoted_text: string; // Verbatim text verified against segments
}

export interface IRClaim {
  id: string;
  claim_text: string;
  stance: ClaimStance;
  epistemic_status: EpistemicStatus;
  confidence: ConfidenceLevel;
  speaker?: string;
  attributed_to?: string;
  is_speaker_endorsement?: boolean;
  scope?: 'UNIVERSAL' | 'INDIVIDUAL' | 'DOMAIN_SPECIFIC';
  source_spans: SourceSpan[];
  rationale?: string;
}

export interface IRConcept {
  id: string;
  name: string;
  definition: string;
  epistemic_status: EpistemicStatus;
  source_spans: SourceSpan[];
}

export interface IRMechanismStep {
  step_num: number;
  action: string;
  result: string;
}

export interface IRMechanism {
  id: string;
  title: string;
  trigger: string;
  steps: IRMechanismStep[];
  outcome: string;
  source_spans: SourceSpan[];
}

export interface IRPrinciple {
  id: string;
  statement: string;
  domain: string;
  source_spans: SourceSpan[];
}

export interface IRMentalModel {
  id: string;
  name: string;
  core_heuristic: string;
  source_spans: SourceSpan[];
}

export interface IRExampleOrAnalogy {
  id: string;
  type: 'CONCRETE_EXAMPLE' | 'PERSONAL_STORY' | 'ANALOGY' | 'HYPOTHETICAL';
  content: string;
  concept_id?: string;
  source_spans: SourceSpan[];
}

export interface IRArgument {
  id: string;
  thesis: string;
  premises: string[];
  counterarguments?: string[];
  conclusion: string;
  source_spans: SourceSpan[];
}

export interface IRUncertainty {
  id: string;
  issue: string;
  reason: string;
  source_spans: SourceSpan[];
}

export interface KnowledgeIR {
  ir_version: string;
  video_id: string;
  video_url: string;
  title: string;
  generated_at: string;
  extractor_metadata: {
    provider: string;
    model: string;
    total_chunks: number;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    total_latency_ms: number;
  };
  metadata: {
    duration_seconds: number;
    word_count: number;
    high_density_segment_count: number;
  };
  claims: IRClaim[];
  concepts: IRConcept[];
  mechanisms: IRMechanism[];
  principles: IRPrinciple[];
  mental_models: IRMentalModel[];
  examples_and_analogies: IRExampleOrAnalogy[];
  arguments: IRArgument[];
  uncertainties: IRUncertainty[];
}

export interface ValidationReport {
  is_valid: boolean;
  video_id: string;
  total_claims: number;
  verified_claims: number;
  unbacked_claims: number;
  invalid_quotes_count: number;
  dangling_references: number;
  total_entities: number;
  errors: string[];
  warnings: string[];
}
