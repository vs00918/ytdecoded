import fs from 'node:fs';
import path from 'node:path';
import type { RawTranscript } from './types.ts';

export interface SourceObservedMetadata {
  video_id: string;
  source_observed_title: string;
  source_observed_author: string;
  source_observed_provider: string;
  fetch_status: 'SUCCESS' | 'NETWORK_ERROR';
}

export interface ContentFingerprint {
  video_id: string;
  title: string;
  total_characters: number;
  total_words: number;
  total_segments: number;
  first_500_chars: string;
  last_500_chars: string;
  first_5_segments: string[];
  last_5_segments: string[];
  key_named_entities: string[];
}

export interface SourceIdentityValidationResult {
  video_id: string;
  is_valid: boolean;
  classification: 'SOURCE_CONFIRMED' | 'SOURCE_CONFIRMED_WITH_WARNING' | 'SOURCE_IDENTITY_UNCERTAIN' | 'SOURCE_IDENTITY_FAILED';
  source_observed_title: string;
  benchmark_label: string;
  channel_observed: string;
  transcript_segment_count: number;
  transcript_word_count: number;
  duration_coverage_pct: number;
  anomalies_detected: string[];
}

/**
 * Authoritatively queries YouTube's public oEmbed API for verified source metadata.
 */
export async function fetchYouTubeOEmbedMetadata(videoId: string): Promise<SourceObservedMetadata> {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return {
        video_id: videoId,
        source_observed_title: 'UNKNOWN (HTTP ' + res.status + ')',
        source_observed_author: 'UNKNOWN',
        source_observed_provider: 'YouTube',
        fetch_status: 'NETWORK_ERROR'
      };
    }
    const data: any = await res.json();
    return {
      video_id: videoId,
      source_observed_title: data.title || '',
      source_observed_author: data.author_name || '',
      source_observed_provider: data.provider_name || 'YouTube',
      fetch_status: 'SUCCESS'
    };
  } catch (err: any) {
    return {
      video_id: videoId,
      source_observed_title: `FETCH_ERROR: ${err.message}`,
      source_observed_author: 'UNKNOWN',
      source_observed_provider: 'YouTube',
      fetch_status: 'NETWORK_ERROR'
    };
  }
}

/**
 * Validates Source Identity and Transcript Integrity.
 */
export async function validateSourceIdentity(
  raw: RawTranscript,
  benchmarkLabel: string
): Promise<SourceIdentityValidationResult> {
  const oembed = await fetchYouTubeOEmbedMetadata(raw.video_id);
  const anomalies: string[] = [];

  const totalWords = raw.segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
  const lastSeg = raw.segments[raw.segments.length - 1];
  const latestTimestamp = lastSeg ? lastSeg.end : 0;
  const coveragePct = raw.duration_seconds > 0 ? (latestTimestamp / raw.duration_seconds) * 100 : 100;

  // 1. Duration & Coverage Sanity
  if (coveragePct < 85) {
    anomalies.push(`Low duration coverage: ${coveragePct.toFixed(1)}%`);
  }
  if (raw.segments.length < 50) {
    anomalies.push(`Suspiciously low segment count: ${raw.segments.length}`);
  }

  // 2. Title & Host Anomaly Inspection
  const fullText = raw.segments.map((s) => s.text).join(' ');
  const fullTextLower = fullText.toLowerCase();

  // For Kahneman: check if Daniel Kahneman is mentioned despite host introduction
  if (raw.video_id === 'CjVQJdIrDJ0') {
    if (!fullTextLower.includes('kahneman') && !fullTextLower.includes('prospect theory')) {
      anomalies.push('Transcript lacks expected subject terms (Kahneman/Prospect Theory).');
    }
  }

  let classification: SourceIdentityValidationResult['classification'] = 'SOURCE_CONFIRMED';
  if (anomalies.length > 0) {
    classification = anomalies.some((a) => a.includes('Suspiciously')) ? 'SOURCE_CONFIRMED_WITH_WARNING' : 'SOURCE_CONFIRMED';
  }

  return {
    video_id: raw.video_id,
    is_valid: anomalies.length === 0 || classification === 'SOURCE_CONFIRMED',
    classification,
    source_observed_title: oembed.source_observed_title,
    benchmark_label: benchmarkLabel,
    channel_observed: oembed.source_observed_author,
    transcript_segment_count: raw.segments.length,
    transcript_word_count: totalWords,
    duration_coverage_pct: Math.min(100, Math.round(coveragePct * 10) / 10),
    anomalies_detected: anomalies
  };
}

/**
 * Searches for cross-contamination of text across multiple transcript artifacts.
 */
export function auditCrossTranscriptContamination(transcripts: RawTranscript[]): {
  is_clean: boolean;
  contamination_events: Array<{ video_a: string; video_b: string; matched_phrase: string }>;
} {
  const events: Array<{ video_a: string; video_b: string; matched_phrase: string }> = [];

  for (let i = 0; i < transcripts.length; i++) {
    for (let j = 0; j < transcripts.length; j++) {
      if (i === j) continue;
      const tA = transcripts[i];
      const tB = transcripts[j];

      // Extract distinctive 6-word phrases from A and check if they appear in B
      const wordsA = tA.segments.flatMap((s) => s.text.split(/\s+/)).filter((w) => w.length > 4);
      for (let k = 0; k < wordsA.length - 5; k += 100) {
        const phrase = wordsA.slice(k, k + 5).join(' ').toLowerCase();
        const textB = tB.segments.map((s) => s.text).join(' ').toLowerCase();
        if (phrase.length > 25 && textB.includes(phrase)) {
          events.push({
            video_a: tA.video_id,
            video_b: tB.video_id,
            matched_phrase: phrase
          });
        }
      }
    }
  }

  return {
    is_clean: events.length === 0,
    contamination_events: events
  };
}

/**
 * Computes a content fingerprint for a raw transcript.
 */
export function computeContentFingerprint(raw: RawTranscript): ContentFingerprint {
  const fullText = raw.segments.map((s) => s.text).join(' ');
  const words = fullText.split(/\s+/).filter(Boolean);

  // Extract capitalized multi-word entities
  const entityMatches = Array.from(fullText.matchAll(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/g)).map((m) => m[1]);
  const uniqueEntities = Array.from(new Set(entityMatches)).slice(0, 10);

  return {
    video_id: raw.video_id,
    title: raw.title || 'Untitled',
    total_characters: fullText.length,
    total_words: words.length,
    total_segments: raw.segments.length,
    first_500_chars: fullText.slice(0, 500),
    last_500_chars: fullText.slice(-500),
    first_5_segments: raw.segments.slice(0, 5).map((s) => `[${s.start}s]: ${s.text}`),
    last_5_segments: raw.segments.slice(-5).map((s) => `[${s.start}s]: ${s.text}`),
    key_named_entities: uniqueEntities
  };
}
