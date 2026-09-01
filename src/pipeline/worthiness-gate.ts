import type { SourceSpan } from './types.ts';

export type WorthinessClass =
  | 'SUBSTANTIVE_KNOWLEDGE'
  | 'SUPPORTING_DETAIL'
  | 'EXAMPLE_ONLY'
  | 'CONTEXT_ONLY'
  | 'NOISE'
  | 'UNCERTAIN';

export interface WorthinessAssessment {
  entity_id: string;
  classification: WorthinessClass;
  reusability_score: number;      // 0.0 to 1.0 (utility outside this specific video)
  explanatory_depth: number;      // 0.0 to 1.0 (mechanisms, principles, causal sequences)
  conceptual_coherence: number;   // 0.0 to 1.0 (standalone intellectual unit)
  rationale: string;
}

const BIOGRAPHY_AND_CONTEXT_PATTERNS = [
  /i grew up drinking/i,
  /my coffee maker/i,
  /when completing my doctoral/i,
  /as a graduate student/i,
  /as an immigrant/i,
  /i was on a limited budget/i,
  /i drove myself to a store/i,
  /she looked at me and said/i,
  /welcome back to the channel/i,
  /in this talk/i,
  /have you been in my shoes/i,
  /let me introduce/i,
  /thanks for having me/i,
  /subscribe to our channel/i,
  /promo code/i,
  /brought to you by/i,
  /my friend bob/i,
  /i agree to be this/i
];

export function assessKnowledgeWorthiness(entity: {
  id: string;
  text: string;
  type: 'CLAIM' | 'CONCEPT' | 'MECHANISM' | 'ANALOGY' | 'PRINCIPLE';
  stance?: string;
  scope?: string;
}): WorthinessAssessment {
  const text = entity.text.trim();
  const textLower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // 1. Check for NOISE / Sponsor / Meta-Talk
  if (
    textLower.includes('promo code') ||
    textLower.includes('brought to you by') ||
    textLower.includes('subscribe') ||
    textLower.includes('sponsor') ||
    textLower.includes('welcome back to the channel') ||
    wordCount < 4
  ) {
    return {
      entity_id: entity.id,
      classification: 'NOISE',
      reusability_score: 0.0,
      explanatory_depth: 0.0,
      conceptual_coherence: 0.0,
      rationale: 'Sponsor, call to action, conversational filler, or trivial segment.'
    };
  }

  // 2. Check for BIOGRAPHY / PERSONAL INTRO / CONTEXT_ONLY
  for (const pattern of BIOGRAPHY_AND_CONTEXT_PATTERNS) {
    if (pattern.test(textLower)) {
      return {
        entity_id: entity.id,
        classification: 'CONTEXT_ONLY',
        reusability_score: 0.1,
        explanatory_depth: 0.1,
        conceptual_coherence: 0.2,
        rationale: 'Autobiographical narrative, personal introduction, or conversational framing with zero independent canonical utility.'
      };
    }
  }

  // 3. Check for EXAMPLE / ANALOGY
  if (
    entity.type === 'ANALOGY' ||
    entity.stance === 'EXAMPLE_ONLY' ||
    textLower.startsWith('for example') ||
    textLower.includes('is like ') ||
    textLower.includes('bandages') ||
    textLower.includes('advisory board')
  ) {
    return {
      entity_id: entity.id,
      classification: 'EXAMPLE_ONLY',
      reusability_score: 0.5,
      explanatory_depth: 0.4,
      conceptual_coherence: 0.6,
      rationale: 'Concrete illustration, case study, or metaphor. Subordinate to a parent concept.'
    };
  }

  // 4. Check for SUBSTANTIVE KNOWLEDGE
  const hasMechanisticOrConceptualTerms =
    textLower.includes('because') ||
    textLower.includes('mechanism') ||
    textLower.includes('system') ||
    textLower.includes('principle') ||
    textLower.includes('cause') ||
    textLower.includes('regulate') ||
    textLower.includes('modulate') ||
    textLower.includes('pathway') ||
    textLower.includes('feedback') ||
    textLower.includes('framework') ||
    textLower.includes('heuristic') ||
    textLower.includes('equilibrium') ||
    textLower.includes('stimuli') ||
    textLower.includes('cortex') ||
    textLower.includes('dopamine') ||
    textLower.includes('serotonin') ||
    textLower.includes('repetition') ||
    textLower.includes('conduit') ||
    textLower.includes('concurrency') ||
    textLower.includes('superposition') ||
    textLower.includes('coherence') ||
    textLower.includes('paradox');

  if (wordCount >= 8 && (hasMechanisticOrConceptualTerms || entity.type === 'MECHANISM' || entity.type === 'CONCEPT')) {
    return {
      entity_id: entity.id,
      classification: 'SUBSTANTIVE_KNOWLEDGE',
      reusability_score: 0.85,
      explanatory_depth: entity.type === 'MECHANISM' ? 0.95 : 0.8,
      conceptual_coherence: 0.85,
      rationale: 'Contains structured explanatory mechanics, principled heuristics, or actionable conceptual distinctions.'
    };
  }

  // 5. Short or isolated claims -> SUPPORTING_DETAIL
  if (wordCount >= 6) {
    return {
      entity_id: entity.id,
      classification: 'SUPPORTING_DETAIL',
      reusability_score: 0.4,
      explanatory_depth: 0.3,
      conceptual_coherence: 0.4,
      rationale: 'Secondary detail or observation without standalone conceptual depth.'
    };
  }

  return {
    entity_id: entity.id,
    classification: 'UNCERTAIN',
    reusability_score: 0.2,
    explanatory_depth: 0.2,
    conceptual_coherence: 0.2,
    rationale: 'Ambiguous or underspecified fragment.'
  };
}
