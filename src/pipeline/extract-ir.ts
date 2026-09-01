import type { CleanedTranscript, KnowledgeIR, IRClaim, IRConcept, IRMechanism, IRPrinciple, IRMentalModel, IRExampleOrAnalogy, IRArgument, IRUncertainty } from './types.ts';
import { segmentTranscriptSemantically } from './semantic-segmenter.ts';
import { getLLMProvider, type LLMProvider } from './llm-provider.ts';

const SYSTEM_EXTRACTION_PROMPT = `
You are an expert Epistemic Knowledge Extraction Engine.
Your task is to analyze spoken educational transcripts and extract structured, verifiable Knowledge IR JSON.

CRITICAL EPISTEMIC RULES:
1. DISTINGUISH STANCE:
   - 'ASSERTED': Speaker presents statement as established truth/thesis.
   - 'REFUTED': Speaker explicitly denies, disproves, or retracts a statement ("X is NOT true", "recent studies refuted X").
   - 'HYPOTHETICAL': Conditional / counterfactual ("If X were true, Y might happen").
   - 'POSSIBLE': Speculative conjecture ("It might be that X").
   - 'UNCERTAIN': Speaker expresses explicit doubt ("We don't know for sure whether X").
   - 'QUOTED_OTHER' / 'ATTRIBUTED': Speaker describes someone else's argument ("Dr. Smith argues X", "Opponents claim Y").
   - 'QUESTION': Rhetorical or exploratory question.
   - 'EXAMPLE_ONLY': Single personal story or anecdote without universal claim.

2. VERBATIM PROVENANCE:
   - For every extracted claim, concept, mechanism, or analogy, you MUST provide 'source_spans'.
   - 'quoted_text' MUST be an EXACT, VERBATIM substring copied directly from the referenced segments.
   - Never invent or fabricate quotes.

3. DYNAMIC MECHANISMS:
   - Only extract a mechanism if the speaker explicitly explains a multi-step causal sequence.
   - Extract the real causal steps described by the speaker. Never use generic placeholders.

4. NO FORCED METADATA:
   - If no formal concept definition or counterargument is present, leave those arrays empty.
`;

export async function extractKnowledgeIR(
  cleaned: CleanedTranscript,
  options?: { title?: string; videoUrl?: string; provider?: LLMProvider }
): Promise<KnowledgeIR> {
  const provider = options?.provider || getLLMProvider();
  const startTime = Date.now();

  const chunks = segmentTranscriptSemantically(cleaned);

  const allClaims: IRClaim[] = [];
  const allConcepts: IRConcept[] = [];
  const allMechanisms: IRMechanism[] = [];
  const allPrinciples: IRPrinciple[] = [];
  const allModels: IRMentalModel[] = [];
  const allExamples: IRExampleOrAnalogy[] = [];
  const allArguments: IRArgument[] = [];
  const allUncertainties: IRUncertainty[] = [];

  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let claimIdCounter = 1;
  let conceptIdCounter = 1;
  let mechIdCounter = 1;
  let modelIdCounter = 1;
  let exIdCounter = 1;
  let argIdCounter = 1;

  for (const chunk of chunks) {
    const chunkPrompt = `
Analyze the following transcript section from a video titled "${options?.title || cleaned.video_id}".
${chunk.previousContextSummary ? `PREVIOUS CONTEXT: "${chunk.previousContextSummary}"\n` : ''}

TRANSCRIPT SEGMENTS:
${chunk.formattedPromptText}

Extract all explicit claims, concepts, mechanisms, principles, and examples into structured JSON.
`;

    try {
      const response = await provider.generateStructured<any>(
        chunkPrompt,
        {},
        SYSTEM_EXTRACTION_PROMPT
      );

      totalPromptTokens += response.usage.promptTokens;
      totalCompletionTokens += response.usage.completionTokens;

      const data = response.data;

      // Normalize Claims
      if (Array.isArray(data.claims)) {
        for (const c of data.claims) {
          allClaims.push({
            id: `CLM-${String(claimIdCounter++).padStart(3, '0')}`,
            claim_text: c.claim_text || '',
            stance: c.stance || 'ASSERTED',
            epistemic_status: c.epistemic_status || 'SOURCE_EXTRACTED',
            confidence: c.confidence || 'HIGH',
            speaker: c.speaker,
            attributed_to: c.attributed_to,
            is_speaker_endorsement: c.is_speaker_endorsement ?? (c.stance === 'ASSERTED'),
            scope: c.scope || 'UNIVERSAL',
            source_spans: Array.isArray(c.source_spans) ? c.source_spans : [],
            rationale: c.rationale
          });
        }
      }

      // Normalize Concepts
      if (Array.isArray(data.concepts)) {
        for (const cpt of data.concepts) {
          allConcepts.push({
            id: `CPT-${String(conceptIdCounter++).padStart(3, '0')}`,
            name: cpt.name || '',
            definition: cpt.definition || '',
            epistemic_status: cpt.epistemic_status || 'SOURCE_EXTRACTED',
            source_spans: Array.isArray(cpt.source_spans) ? cpt.source_spans : []
          });
        }
      }

      // Normalize Mechanisms
      if (Array.isArray(data.mechanisms)) {
        for (const m of data.mechanisms) {
          allMechanisms.push({
            id: `MEC-${String(mechIdCounter++).padStart(3, '0')}`,
            title: m.title || `Causal Sequence in Chunk ${chunk.id}`,
            trigger: m.trigger || '',
            steps: Array.isArray(m.steps) ? m.steps : [],
            outcome: m.outcome || '',
            source_spans: Array.isArray(m.source_spans) ? m.source_spans : []
          });
        }
      }

      // Normalize Examples & Analogies
      if (Array.isArray(data.examples_and_analogies)) {
        for (const ex of data.examples_and_analogies) {
          allExamples.push({
            id: `EXM-${String(exIdCounter++).padStart(3, '0')}`,
            type: ex.type || 'CONCRETE_EXAMPLE',
            content: ex.content || '',
            concept_id: ex.concept_id,
            source_spans: Array.isArray(ex.source_spans) ? ex.source_spans : []
          });
        }
      }

      // Normalize Arguments
      if (Array.isArray(data.arguments)) {
        for (const arg of data.arguments) {
          allArguments.push({
            id: `ARG-${String(argIdCounter++).padStart(3, '0')}`,
            thesis: arg.thesis || '',
            premises: Array.isArray(arg.premises) ? arg.premises : [],
            counterarguments: Array.isArray(arg.counterarguments) ? arg.counterarguments : [],
            conclusion: arg.conclusion || '',
            source_spans: Array.isArray(arg.source_spans) ? arg.source_spans : []
          });
        }
      }
    } catch (err: any) {
      allUncertainties.push({
        id: `UNC-${chunk.id}`,
        issue: `Chunk ${chunk.id} model extraction failure`,
        reason: err.message,
        source_spans: [{
          start: chunk.start,
          end: chunk.end,
          segment_ids: chunk.segmentIds,
          quoted_text: chunk.segments[0]?.text || ''
        }]
      });
    }
  }

  const durationSec = cleaned.cleaned_segments.length > 0 
    ? Math.ceil(cleaned.cleaned_segments[cleaned.cleaned_segments.length - 1].end) 
    : 0;

  const totalWords = cleaned.cleaned_segments.reduce(
    (acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 
    0
  );

  return {
    ir_version: '3.0.0-semantic',
    video_id: cleaned.video_id,
    video_url: options?.videoUrl || `https://www.youtube.com/watch?v=${cleaned.video_id}`,
    title: options?.title || `Semantic IR for ${cleaned.video_id}`,
    generated_at: new Date().toISOString(),
    extractor_metadata: {
      provider: provider.providerName,
      model: provider.modelName,
      total_chunks: chunks.length,
      prompt_tokens: totalPromptTokens,
      completion_tokens: totalCompletionTokens,
      total_tokens: totalPromptTokens + totalCompletionTokens,
      total_latency_ms: Date.now() - startTime
    },
    metadata: {
      duration_seconds: durationSec,
      word_count: totalWords,
      high_density_segment_count: cleaned.cleaned_segments.filter((s) => s.density_tier === 'HIGH').length
    },
    claims: allClaims,
    concepts: allConcepts,
    mechanisms: allMechanisms,
    principles: allPrinciples,
    mental_models: allModels,
    examples_and_analogies: allExamples,
    arguments: allArguments,
    uncertainties: allUncertainties
  };
}
