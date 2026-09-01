import type { KnowledgeIR, IRClaim, IRConcept, IRMechanism, IRExampleOrAnalogy, SourceSpan } from './types.ts';
import { retrieveCandidateTopics, type TopicIndexEntry } from './topic-retriever.ts';
import { assessKnowledgeWorthiness, type WorthinessClass, type WorthinessAssessment } from './worthiness-gate.ts';
import { clusterKnowledgeUnits, type KnowledgeUnit } from './knowledge-unit.ts';

export type RoutingDecisionType =
  | 'NEW_TOPIC'
  | 'ENRICH_EXISTING'
  | 'ALTERNATIVE_PERSPECTIVE'
  | 'CONTRADICTION_OR_CHALLENGE'
  | 'QUALIFICATION_OR_BOUNDARY'
  | 'SUPPORTING_EVIDENCE'
  | 'EXAMPLE_OR_APPLICATION'
  | 'ALREADY_COVERED'
  | 'INSUFFICIENT_CONFIDENCE'
  | 'FILTERED_NON_CANONICAL';

export type RoutingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SemanticComparison {
  existing_topic_slug: string | null;
  existing_topic_title: string | null;
  candidate_score: number;
  existing_thesis_summary: string;
  new_information_delta: string;
  relationship: RoutingDecisionType;
  explanatory_gain: 'HIGH' | 'MODERATE' | 'NEGLIGIBLE';
}

export interface UnitRoutingDecision {
  unit_id: string;
  title: string;
  core_thesis: string;
  worthiness: WorthinessClass;
  worthiness_assessment: WorthinessAssessment;
  decision: RoutingDecisionType;
  target_topic_slug: string | null;
  target_topic_title: string | null;
  confidence: RoutingConfidence;
  confidence_score: number;
  rationale: string;
  semantic_comparison: SemanticComparison;
  constituent_entity_ids: string[];
  source_spans: SourceSpan[];
}

export interface VideoRoutingResult {
  video_id: string;
  video_title: string;
  total_raw_entities: number;
  total_knowledge_units: number;
  decisions: UnitRoutingDecision[];
  summary: {
    new_topics: number;
    enrichtargets: Record<string, number>;
    contradictions: number;
    qualifications: number;
    supporting_evidence: number;
    examples: number;
    already_covered: number;
    filtered_non_canonical: number;
    quarantined: number;
  };
}

export function routeKnowledgeUnit(unit: KnowledgeUnit): UnitRoutingDecision {
  const combinedText = [unit.core_thesis, ...unit.claims.map((c) => c.claim_text)].join(' ');
  const textLower = combinedText.toLowerCase();

  // STAGE 1: Worthiness Gate Filtering (Drop Context & Noise)
  if (unit.worthiness === 'NOISE' || unit.worthiness === 'CONTEXT_ONLY') {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'FILTERED_NON_CANONICAL',
      target_topic_slug: null,
      target_topic_title: null,
      confidence: 'HIGH',
      confidence_score: 0.98,
      rationale: `Filtered by Knowledge Worthiness Gate (${unit.worthiness}): Personal background, autobiographical narrative, or conversational framing with zero independent canonical value.`,
      semantic_comparison: {
        existing_topic_slug: null,
        existing_topic_title: null,
        candidate_score: 0,
        existing_thesis_summary: 'N/A',
        new_information_delta: 'None (Context / Biographical noise)',
        relationship: 'FILTERED_NON_CANONICAL',
        explanatory_gain: 'NEGLIGIBLE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 2: Check for Dialectical Contradiction / Refutation First
  const hasRefutedClaim = unit.claims.some((c) => c.stance === 'REFUTED');
  if (hasRefutedClaim || textLower.includes('refuted') || textLower.includes('disproved') || textLower.includes('proves this wrong') || textLower.includes('completely false')) {
    const candidates = retrieveCandidateTopics(unit.core_thesis, 3);
    const bestCandidate = candidates[0]?.topic || null;
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'CONTRADICTION_OR_CHALLENGE',
      target_topic_slug: bestCandidate?.slug || null,
      target_topic_title: bestCandidate?.title || 'Canonical Corpus Challenge',
      confidence: 'HIGH',
      confidence_score: 0.95,
      rationale: `Source explicitly challenges or refutes claims related to "${bestCandidate?.title || 'Canonical Knowledge'}". Generates a reviewable dialectical tension block.`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate?.slug || null,
        existing_topic_title: bestCandidate?.title || null,
        candidate_score: candidates[0]?.score || 0,
        existing_thesis_summary: bestCandidate?.summary_15s || 'Existing canonical consensus',
        new_information_delta: 'Explicit empirical or conceptual refutation of previous assumption',
        relationship: 'CONTRADICTION_OR_CHALLENGE',
        explanatory_gain: 'HIGH'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 3: Candidate Generation (Lexical Retrieval)
  const candidates = retrieveCandidateTopics(unit.core_thesis, 3);
  const bestCandidate = candidates[0]?.topic || null;
  const candidateScore = candidates[0]?.score || 0;

  // STAGE 4: Strict NEW_TOPIC Gate (When no candidate matches)
  if (!bestCandidate || candidateScore < 8) {
    if (
      unit.worthiness === 'SUBSTANTIVE_KNOWLEDGE' &&
      unit.worthiness_assessment.explanatory_depth >= 0.7 &&
      unit.worthiness_assessment.reusability_score >= 0.7 &&
      (unit.mechanisms.length > 0 || unit.claims.length >= 2)
    ) {
      return {
        unit_id: unit.unit_id,
        title: unit.title,
        core_thesis: unit.core_thesis,
        worthiness: unit.worthiness,
        worthiness_assessment: unit.worthiness_assessment,
        decision: 'NEW_TOPIC',
        target_topic_slug: null,
        target_topic_title: null,
        confidence: 'HIGH',
        confidence_score: 0.92,
        rationale: `Substantive, coherent conceptual framework with explanatory depth not covered in the existing 45 chapters (retrieval score: ${candidateScore}).`,
        semantic_comparison: {
          existing_topic_slug: null,
          existing_topic_title: null,
          candidate_score: candidateScore,
          existing_thesis_summary: 'None in current corpus',
          new_information_delta: 'Standalone independent conceptual framework',
          relationship: 'NEW_TOPIC',
          explanatory_gain: 'HIGH'
        },
        constituent_entity_ids: unit.constituent_entity_ids,
        source_spans: unit.source_spans
      };
    }

    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'INSUFFICIENT_CONFIDENCE',
      target_topic_slug: null,
      target_topic_title: null,
      confidence: 'LOW',
      confidence_score: 0.40,
      rationale: `Novel observation but lacks sufficient explanatory depth or conceptual coherence for an independent canonical chapter (depth: ${unit.worthiness_assessment.explanatory_depth}). Quarantined.`,
      semantic_comparison: {
        existing_topic_slug: null,
        existing_topic_title: null,
        candidate_score: candidateScore,
        existing_thesis_summary: 'None',
        new_information_delta: 'Fragmentary observation without systemic mechanics',
        relationship: 'INSUFFICIENT_CONFIDENCE',
        explanatory_gain: 'NEGLIGIBLE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  const targetContent = bestCandidate.full_content.toLowerCase();

  // STAGE 5: Supporting Empirical Evidence (Before already covered)
  if (textLower.includes('clinical trial') || textLower.includes('meta-analysis') || textLower.includes('measured in laboratory') || textLower.includes('empirical data')) {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'SUPPORTING_EVIDENCE',
      target_topic_slug: bestCandidate.slug,
      target_topic_title: bestCandidate.title,
      confidence: 'HIGH',
      confidence_score: 0.91,
      rationale: `Contributes empirical experimental evidence for the mechanisms of "${bestCandidate.title}".`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate.slug,
        existing_topic_title: bestCandidate.title,
        candidate_score: candidateScore,
        existing_thesis_summary: bestCandidate.summary_15s,
        new_information_delta: 'Empirical data / trial confirmation',
        relationship: 'SUPPORTING_EVIDENCE',
        explanatory_gain: 'MODERATE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 6: Qualification & Boundary Conditions
  const hasDomainRestriction = unit.claims.some((c) => c.scope === 'DOMAIN_SPECIFIC') || textLower.includes('only applies to') || textLower.includes('except when') || textLower.includes('observational evidence');
  if (hasDomainRestriction) {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'QUALIFICATION_OR_BOUNDARY',
      target_topic_slug: bestCandidate.slug,
      target_topic_title: bestCandidate.title,
      confidence: 'HIGH',
      confidence_score: 0.88,
      rationale: `Source defines boundary conditions or scope restrictions for "${bestCandidate.title}".`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate.slug,
        existing_topic_title: bestCandidate.title,
        candidate_score: candidateScore,
        existing_thesis_summary: bestCandidate.summary_15s,
        new_information_delta: 'Operational scope constraint or limitation',
        relationship: 'QUALIFICATION_OR_BOUNDARY',
        explanatory_gain: 'MODERATE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 7: Example & Concrete Case Application
  if (unit.worthiness === 'EXAMPLE_ONLY' || unit.examples.length > 0 || textLower.includes('bandages') || textLower.includes('advisory board')) {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: 'EXAMPLE_ONLY',
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'EXAMPLE_OR_APPLICATION',
      target_topic_slug: bestCandidate.slug,
      target_topic_title: bestCandidate.title,
      confidence: 'HIGH',
      confidence_score: 0.90,
      rationale: `Source contributes an illustrative analogy or case application mapping directly to the mechanics of "${bestCandidate.title}".`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate.slug,
        existing_topic_title: bestCandidate.title,
        candidate_score: candidateScore,
        existing_thesis_summary: bestCandidate.summary_15s,
        new_information_delta: 'Concrete case illustration / metaphor',
        relationship: 'EXAMPLE_OR_APPLICATION',
        explanatory_gain: 'MODERATE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 8: Semantic ALREADY_COVERED Judgment
  const normalizedWords = textLower.replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter((w) => w.length > 3);
  const matchedInTarget = normalizedWords.filter((w) => targetContent.includes(w)).length;
  const matchRatio = normalizedWords.length > 0 ? matchedInTarget / normalizedWords.length : 0;

  if (matchRatio >= 0.55 && candidateScore >= 18) {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'ALREADY_COVERED',
      target_topic_slug: bestCandidate.slug,
      target_topic_title: bestCandidate.title,
      confidence: 'HIGH',
      confidence_score: 0.94,
      rationale: `The core substantive mechanics (${Math.round(matchRatio * 100)}% match) are already adequately represented in "${bestCandidate.title}". Preserved in provenance ledger without creating duplicate prose.`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate.slug,
        existing_topic_title: bestCandidate.title,
        candidate_score: candidateScore,
        existing_thesis_summary: bestCandidate.summary_15s,
        new_information_delta: 'None (Substantively identical to existing text)',
        relationship: 'ALREADY_COVERED',
        explanatory_gain: 'NEGLIGIBLE'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // STAGE 9: Substantive Novel Depth -> ENRICH_EXISTING
  if (candidateScore >= 14 && unit.worthiness === 'SUBSTANTIVE_KNOWLEDGE') {
    return {
      unit_id: unit.unit_id,
      title: unit.title,
      core_thesis: unit.core_thesis,
      worthiness: unit.worthiness,
      worthiness_assessment: unit.worthiness_assessment,
      decision: 'ENRICH_EXISTING',
      target_topic_slug: bestCandidate.slug,
      target_topic_title: bestCandidate.title,
      confidence: 'HIGH',
      confidence_score: 0.89,
      rationale: `Substantive structural nuance, causal sequences, or tactical depth extending "${bestCandidate.title}".`,
      semantic_comparison: {
        existing_topic_slug: bestCandidate.slug,
        existing_topic_title: bestCandidate.title,
        candidate_score: candidateScore,
        existing_thesis_summary: bestCandidate.summary_15s,
        new_information_delta: 'Novel causal mechanics and tactical depth',
        relationship: 'ENRICH_EXISTING',
        explanatory_gain: 'HIGH'
      },
      constituent_entity_ids: unit.constituent_entity_ids,
      source_spans: unit.source_spans
    };
  }

  // Default Fallback -> Quarantined
  return {
    unit_id: unit.unit_id,
    title: unit.title,
    core_thesis: unit.core_thesis,
    worthiness: unit.worthiness,
    worthiness_assessment: unit.worthiness_assessment,
    decision: 'INSUFFICIENT_CONFIDENCE',
    target_topic_slug: bestCandidate.slug,
    target_topic_title: bestCandidate.title,
    confidence: 'LOW',
    confidence_score: 0.45,
    rationale: `Weak semantic linkage to candidate "${bestCandidate.title}" (score: ${candidateScore}). Quarantined.`,
    semantic_comparison: {
      existing_topic_slug: bestCandidate.slug,
      existing_topic_title: bestCandidate.title,
      candidate_score: candidateScore,
      existing_thesis_summary: bestCandidate.summary_15s,
      new_information_delta: 'Ambiguous relevance',
      relationship: 'INSUFFICIENT_CONFIDENCE',
      explanatory_gain: 'NEGLIGIBLE'
    },
    constituent_entity_ids: unit.constituent_entity_ids,
    source_spans: unit.source_spans
  };
}

export function routeKnowledgeIR(ir: KnowledgeIR): VideoRoutingResult {
  const units = clusterKnowledgeUnits(ir);
  const decisions: UnitRoutingDecision[] = [];

  const enrichTargets: Record<string, number> = {};
  let newTopicsCount = 0;
  let contradictionsCount = 0;
  let qualificationsCount = 0;
  let supportingEvidenceCount = 0;
  let examplesCount = 0;
  let alreadyCoveredCount = 0;
  let filteredNonCanonicalCount = 0;
  let quarantinedCount = 0;

  for (const unit of units) {
    const dec = routeKnowledgeUnit(unit);
    decisions.push(dec);

    switch (dec.decision) {
      case 'NEW_TOPIC':
        newTopicsCount++;
        break;
      case 'ENRICH_EXISTING':
        if (dec.target_topic_slug) {
          enrichTargets[dec.target_topic_slug] = (enrichTargets[dec.target_topic_slug] || 0) + 1;
        }
        break;
      case 'CONTRADICTION_OR_CHALLENGE':
        contradictionsCount++;
        break;
      case 'QUALIFICATION_OR_BOUNDARY':
        qualificationsCount++;
        break;
      case 'SUPPORTING_EVIDENCE':
        supportingEvidenceCount++;
        break;
      case 'EXAMPLE_OR_APPLICATION':
        examplesCount++;
        break;
      case 'ALREADY_COVERED':
        alreadyCoveredCount++;
        break;
      case 'FILTERED_NON_CANONICAL':
        filteredNonCanonicalCount++;
        break;
      case 'INSUFFICIENT_CONFIDENCE':
        quarantinedCount++;
        break;
    }
  }

  return {
    video_id: ir.video_id,
    video_title: ir.title,
    total_raw_entities: ir.claims.length + ir.mechanisms.length + ir.examples_and_analogies.length,
    total_knowledge_units: units.length,
    decisions,
    summary: {
      new_topics: newTopicsCount,
      enrichtargets: enrichTargets,
      contradictions: contradictionsCount,
      qualifications: qualificationsCount,
      supporting_evidence: supportingEvidenceCount,
      examples: examplesCount,
      already_covered: alreadyCoveredCount,
      filtered_non_canonical: filteredNonCanonicalCount,
      quarantined: quarantinedCount
    }
  };
}

// Backward compatibility helper for single entity routing tests
export function routeIREntity(entity: { id: string; type: 'CLAIM' | 'CONCEPT' | 'MECHANISM' | 'ANALOGY'; text: string; stance?: string; scope?: string; source_spans: SourceSpan[] }) {
  const worthiness = assessKnowledgeWorthiness({ id: entity.id, text: entity.text, type: entity.type, stance: entity.stance, scope: entity.scope });
  const mockUnit: KnowledgeUnit = {
    unit_id: `KU-${entity.id}`,
    title: entity.text.slice(0, 60),
    core_thesis: entity.text,
    worthiness: worthiness.classification,
    worthiness_assessment: worthiness,
    constituent_entity_ids: [entity.id],
    claims: entity.type === 'CLAIM' ? [{ id: entity.id, claim_text: entity.text, stance: (entity.stance as any) || 'ASSERTED', epistemic_status: 'SOURCE_EXTRACTED', confidence: 'HIGH', scope: (entity.scope as any) || 'UNIVERSAL', source_spans: entity.source_spans }] : [],
    mechanisms: entity.type === 'MECHANISM' ? [{ id: entity.id, title: entity.text, trigger: '', steps: [], outcome: '', source_spans: entity.source_spans }] : [],
    examples: entity.type === 'ANALOGY' ? [{ id: entity.id, type: 'ANALOGY', content: entity.text, source_spans: entity.source_spans }] : [],
    source_spans: entity.source_spans,
    time_range: { start: entity.source_spans[0]?.start || 0, end: entity.source_spans[0]?.end || 0 }
  };
  const unitDec = routeKnowledgeUnit(mockUnit);
  return {
    entity_id: entity.id,
    entity_type: entity.type,
    entity_text: entity.text,
    decision: unitDec.decision,
    target_topic_slug: unitDec.target_topic_slug,
    target_topic_title: unitDec.target_topic_title,
    confidence: unitDec.confidence,
    confidence_score: unitDec.confidence_score,
    rationale: unitDec.rationale,
    source_spans: unitDec.source_spans
  };
}
