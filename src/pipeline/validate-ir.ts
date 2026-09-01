import type { KnowledgeIR, CleanedTranscript, ValidationReport, SourceSpan } from './types';

export function validateKnowledgeIR(ir: KnowledgeIR, cleaned: CleanedTranscript): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];

  const segmentMap = new Map<string, string>();
  for (const s of cleaned.cleaned_segments) {
    segmentMap.set(s.id, s.text);
  }

  const seenIds = new Set<string>();

  let totalClaims = ir.claims.length;
  let verifiedClaims = 0;
  let unbackedClaims = 0;
  let invalidQuotesCount = 0;
  let danglingReferences = 0;

  function normalizeForCompare(str: string): string {
    return str.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function verifySpanProvenance(span: SourceSpan, entityId: string) {
    if (!span) {
      errors.push(`${entityId}: Missing source span.`);
      return;
    }

    if (span.start > span.end) {
      errors.push(`${entityId}: Invalid span range (start ${span.start} > end ${span.end}).`);
    }

    if (!span.segment_ids || span.segment_ids.length === 0) {
      errors.push(`${entityId}: No segment IDs recorded in span.`);
      return;
    }

    const reconstructedSegments: string[] = [];
    for (const segId of span.segment_ids) {
      const segText = segmentMap.get(segId);
      if (!segText) {
        danglingReferences++;
        errors.push(`${entityId}: Dangling segment ID "${segId}" does not exist in cleaned transcript.`);
      } else {
        reconstructedSegments.push(segText);
      }
    }

    // Exact Substring Verification
    if (span.quoted_text && reconstructedSegments.length > 0) {
      const fullSourceText = normalizeForCompare(reconstructedSegments.join(' '));
      const targetQuote = normalizeForCompare(span.quoted_text);

      if (targetQuote.length > 10 && !fullSourceText.includes(targetQuote)) {
        invalidQuotesCount++;
        errors.push(
          `${entityId}: INVALID_PROVENANCE_QUOTE_MISMATCH — Quoted text "${span.quoted_text.slice(0, 50)}..." not found in referenced segments [${span.segment_ids.join(', ')}].`
        );
      }
    }
  }

  function checkUniqueId(id: string, type: string) {
    if (seenIds.has(id)) {
      errors.push(`Duplicate entity ID "${id}" detected in ${type}.`);
    }
    seenIds.add(id);
  }

  // 1. Validate Claims
  for (const claim of ir.claims) {
    checkUniqueId(claim.id, 'Claims');
    if (!claim.claim_text || claim.claim_text.trim().length === 0) {
      errors.push(`Claim ${claim.id} has empty claim text.`);
    }

    if (!claim.source_spans || claim.source_spans.length === 0) {
      unbackedClaims++;
      errors.push(`Claim ${claim.id} has NO source spans (unbacked claim).`);
    } else {
      verifiedClaims++;
      for (const span of claim.source_spans) {
        verifySpanProvenance(span, claim.id);
      }
    }

    const validStances = [
      'ASSERTED', 'REFUTED', 'HYPOTHETICAL', 'POSSIBLE', 
      'UNCERTAIN', 'QUOTED_OTHER', 'ATTRIBUTED', 'QUESTION', 'EXAMPLE_ONLY'
    ];
    if (!validStances.includes(claim.stance)) {
      errors.push(`Claim ${claim.id} has invalid stance: "${claim.stance}".`);
    }
  }

  // 2. Validate Concepts
  for (const concept of ir.concepts) {
    checkUniqueId(concept.id, 'Concepts');
    for (const span of concept.source_spans) verifySpanProvenance(span, concept.id);
  }

  // 3. Validate Mechanisms
  for (const mech of ir.mechanisms) {
    checkUniqueId(mech.id, 'Mechanisms');
    if (!mech.steps || mech.steps.length === 0) {
      warnings.push(`Mechanism ${mech.id} has zero steps.`);
    }
    for (const span of mech.source_spans) verifySpanProvenance(span, mech.id);
  }

  // 4. Validate Examples
  for (const ex of ir.examples_and_analogies) {
    checkUniqueId(ex.id, 'Examples');
    for (const span of ex.source_spans) verifySpanProvenance(span, ex.id);
  }

  // 5. Validate Arguments & Uncertainties
  for (const arg of ir.arguments) {
    checkUniqueId(arg.id, 'Arguments');
    for (const span of arg.source_spans) verifySpanProvenance(span, arg.id);
  }
  for (const unc of ir.uncertainties) {
    checkUniqueId(unc.id, 'Uncertainties');
    for (const span of unc.source_spans) verifySpanProvenance(span, unc.id);
  }

  const isValid = errors.length === 0;

  return {
    is_valid: isValid,
    video_id: ir.video_id,
    total_claims: totalClaims,
    verified_claims: verifiedClaims,
    unbacked_claims: unbackedClaims,
    invalid_quotes_count: invalidQuotesCount,
    dangling_references: danglingReferences,
    total_entities: seenIds.size,
    errors,
    warnings
  };
}
