import fs from 'node:fs';
import path from 'node:path';
import type { CleanedTranscript, KnowledgeIR, IRClaim, IRConcept, IRMechanism, IRExampleOrAnalogy, SourceSpan } from './types.ts';
import { GeminiLLMProvider, OpenAILLMProvider, type LLMProvider, type LLMResponse } from './llm-provider.ts';
import { validateKnowledgeIR } from './validate-ir.ts';

export interface ChunkExtractionMetadata {
  chunk_index: number;
  start_time: number;
  end_time: number;
  word_count: number;
  claims_extracted: number;
  latency_ms: number;
  tokens_consumed: number;
}

export interface HierarchicalRunResult {
  video_id: string;
  provider_name: string;
  model_name: string;
  total_chunks: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_latency_ms: number;
  chunk_metrics: ChunkExtractionMetadata[];
  consolidated_ir: KnowledgeIR;
}

/**
 * Returns the active configured Live LLM provider, or null if no credentials exist.
 */
export function getActiveLiveLLMProvider(): LLMProvider | null {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (geminiKey) {
    return new GeminiLLMProvider(geminiKey);
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return new OpenAILLMProvider(openaiKey);
  }

  return null;
}

/**
 * Splits a transcript into coherent semantic chunks (~1200-1500 words with timestamp boundaries).
 */
export function splitIntoSemanticChunks(
  transcript: CleanedTranscript,
  maxWordsPerChunk: number = 1400
): Array<{ index: number; start: number; end: number; segments: CleanedTranscript['cleaned_segments']; text: string }> {
  const chunks: Array<{ index: number; start: number; end: number; segments: CleanedTranscript['cleaned_segments']; text: string }> = [];
  let currentSegs: CleanedTranscript['cleaned_segments'] = [];
  let currentWords = 0;
  let chunkIdx = 1;

  for (const seg of transcript.cleaned_segments) {
    const segWords = seg.text.split(/\s+/).filter(Boolean).length;
    if (currentWords + segWords > maxWordsPerChunk && currentSegs.length > 0) {
      const start = currentSegs[0].start;
      const end = currentSegs[currentSegs.length - 1].end;
      const text = currentSegs.map((s) => `[${s.id}] (${s.start}s-${s.end}s): ${s.text}`).join('\n');
      chunks.push({ index: chunkIdx++, start, end, segments: currentSegs, text });
      currentSegs = [seg];
      currentWords = segWords;
    } else {
      currentSegs.push(seg);
      currentWords += segWords;
    }
  }

  if (currentSegs.length > 0) {
    const start = currentSegs[0].start;
    const end = currentSegs[currentSegs.length - 1].end;
    const text = currentSegs.map((s) => `[${s.id}] (${s.start}s-${s.end}s): ${s.text}`).join('\n');
    chunks.push({ index: chunkIdx++, start, end, segments: currentSegs, text });
  }

  return chunks;
}

/**
 * Consolidates overlapping cross-chunk claims, mechanisms, and examples into a unified KnowledgeIR.
 */
export function consolidateHierarchicalIR(
  videoId: string,
  videoUrl: string,
  title: string,
  chunkIRs: KnowledgeIR[],
  provider: LLMProvider,
  totalLatency: number,
  promptTokens: number,
  completionTokens: number
): KnowledgeIR {
  const allClaims: IRClaim[] = [];
  const allMechanisms: IRMechanism[] = [];
  const allExamples: IRExampleOrAnalogy[] = [];
  const seenClaimTexts = new Set<string>();

  let claimSeq = 1;
  let mechSeq = 1;
  let exSeq = 1;

  for (const ir of chunkIRs) {
    for (const c of ir.claims || []) {
      const normalized = c.claim_text.toLowerCase().trim();
      // Deduplicate identical claims while merging source spans
      if (seenClaimTexts.has(normalized)) {
        const existing = allClaims.find((x) => x.claim_text.toLowerCase().trim() === normalized);
        if (existing && c.source_spans[0]) {
          existing.source_spans.push(c.source_spans[0]);
        }
      } else {
        seenClaimTexts.add(normalized);
        allClaims.push({
          ...c,
          id: `CLM-${String(claimSeq++).padStart(3, '0')}`
        });
      }
    }

    for (const m of ir.mechanisms || []) {
      allMechanisms.push({
        ...m,
        id: `MEC-${String(mechSeq++).padStart(3, '0')}`
      });
    }

    for (const ex of ir.examples_and_analogies || []) {
      allExamples.push({
        ...ex,
        id: `EXM-${String(exSeq++).padStart(3, '0')}`
      });
    }
  }

  return {
    ir_version: '2.0.0-hierarchical',
    video_id: videoId,
    video_url: videoUrl,
    title,
    generated_at: new Date().toISOString(),
    extractor_metadata: {
      provider: provider.providerName,
      model: provider.modelName,
      total_chunks: chunkIRs.length,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      total_latency_ms: totalLatency
    },
    metadata: {
      duration_seconds: 0,
      word_count: 0,
      high_density_segment_count: 0
    },
    claims: allClaims,
    concepts: [],
    mechanisms: allMechanisms,
    principles: [],
    mental_models: [],
    examples_and_analogies: allExamples,
    arguments: [],
    uncertainties: []
  };
}
