import type { CleanedTranscript, CleanedSegment } from './types';

export interface SemanticChunk {
  id: string;
  chunkIndex: number;
  start: number;
  end: number;
  wordCount: number;
  segmentIds: string[];
  segments: CleanedSegment[];
  formattedPromptText: string;
  previousContextSummary?: string;
}

export function segmentTranscriptSemantically(
  cleaned: CleanedTranscript,
  options?: { targetWordCount?: number; overlapSegments?: number }
): SemanticChunk[] {
  const targetWords = options?.targetWordCount || 350;
  const segments = cleaned.cleaned_segments;
  const chunks: SemanticChunk[] = [];

  let currentSegments: CleanedSegment[] = [];
  let currentWordCount = 0;
  let chunkCounter = 1;
  let previousContext = '';

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const segWords = seg.text.split(/\s+/).filter(Boolean).length;

    currentSegments.push(seg);
    currentWordCount += segWords;

    const isLastSegment = i === segments.length - 1;
    const isPunctuationBoundary = /[.!?]$/.test(seg.text.trim());
    const nextSeg = segments[i + 1];
    const isTimeGap = nextSeg ? (nextSeg.start - seg.end) > 1.5 : false;

    if (currentWordCount >= targetWords && (isPunctuationBoundary || isTimeGap || currentWordCount > targetWords * 1.4) || isLastSegment) {
      const start = currentSegments[0]?.start ?? 0;
      const end = currentSegments[currentSegments.length - 1]?.end ?? 0;
      const segmentIds = currentSegments.map((s) => s.id);

      // Build structured prompt text where each segment is clearly labeled
      const formattedLines = currentSegments.map(
        (s) => `[${s.id}] (${s.start.toFixed(1)}s-${s.end.toFixed(1)}s): ${s.text}`
      );

      const formattedPromptText = formattedLines.join('\n');

      chunks.push({
        id: `chk-${String(chunkCounter++).padStart(3, '0')}`,
        chunkIndex: chunks.length,
        start,
        end,
        wordCount: currentWordCount,
        segmentIds,
        segments: [...currentSegments],
        formattedPromptText,
        previousContextSummary: previousContext || undefined
      });

      // Maintain rolling context buffer
      previousContext = currentSegments.slice(-3).map((s) => s.text).join(' ');

      currentSegments = [];
      currentWordCount = 0;
    }
  }

  return chunks;
}
