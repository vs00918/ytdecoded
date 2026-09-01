import type { RawTranscript, CleanedTranscript, CleanedSegment, CleaningAuditEntry, DensityTier } from './types';

// Patterns identifying non-substantive channel banter & sponsor calls
const SPONSOR_PATTERNS = [
  /sponsor/i, /promo code/i, /link in the description/i, /check out the link below/i,
  /hit that subscribe button/i, /like and subscribe/i, /leave a comment below/i,
  /brought to you by/i, /discount code/i, /special offer for my viewers/i
];

const INTRO_OUTRO_PATTERNS = [
  /^welcome back to the channel/i, /^hey guys welcome/i, /^thanks for watching/i,
  /^see you in the next video/i, /^don't forget to ring the bell/i
];

// Conceptual keywords for density scoring
const HIGH_DENSITY_KEYWORDS = [
  'because', 'mechanism', 'neuro', 'dopamine', 'cortex', 'system', 'principle',
  'invariant', 'feedback', 'loop', 'causes', 'effect', 'strategy', 'framework',
  'cognitive', 'bias', 'heuristic', 'protocol', 'law', 'hypothesis', 'evidence',
  'structure', 'dynamic', 'paradox', 'architecture', 'synthesis', 'friction'
];

const MEDIUM_DENSITY_KEYWORDS = [
  'for example', 'for instance', 'imagine', 'story', 'analogy', 'metaphor',
  'step', 'first', 'second', 'third', 'specifically', 'practice', 'exercise'
];

function assessDensityTier(text: string): DensityTier {
  const lower = text.toLowerCase();
  
  if (HIGH_DENSITY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'HIGH';
  }
  if (MEDIUM_DENSITY_KEYWORDS.some((kw) => lower.includes(kw))) {
    return 'MEDIUM';
  }
  return 'LOW';
}

export function cleanTranscript(raw: RawTranscript): CleanedTranscript {
  const cleanedSegments: CleanedSegment[] = [];
  const auditLog: CleaningAuditEntry[] = [];

  let previousText = '';

  for (let i = 0; i < raw.segments.length; i++) {
    const seg = raw.segments[i];
    const text = seg.text.trim();

    // 1. Check for exact duplicate consecutive ASR lines (common YouTube artifact)
    if (text.length > 0 && text.toLowerCase() === previousText.toLowerCase()) {
      auditLog.push({
        segment_id: seg.id,
        start: seg.start,
        end: seg.end,
        original_text: text,
        action: 'REMOVED',
        reason: 'Consecutive duplicate ASR transcription artifact'
      });
      continue;
    }

    // 2. Check for overt sponsor reads or calls to action
    const isSponsor = SPONSOR_PATTERNS.some((pat) => pat.test(text));
    const isIntroOutro = INTRO_OUTRO_PATTERNS.some((pat) => pat.test(text));

    if (isSponsor) {
      auditLog.push({
        segment_id: seg.id,
        start: seg.start,
        end: seg.end,
        original_text: text,
        action: 'REMOVED',
        reason: 'Promotional sponsor read / call to action'
      });
      continue;
    }

    if (isIntroOutro && (seg.start < 30 || seg.end > (raw.duration_seconds || 9999) - 45)) {
      auditLog.push({
        segment_id: seg.id,
        start: seg.start,
        end: seg.end,
        original_text: text,
        action: 'REMOVED',
        reason: 'Channel opening/closing banter without substantive concepts'
      });
      continue;
    }

    // 3. Normalization (light spacing, music token stripping e.g. [Music], (Applause))
    let normalizedText = text
      .replace(/\[Music\]|\(Music\)|\(Applause\)|\[Applause\]/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (normalizedText.length === 0) {
      auditLog.push({
        segment_id: seg.id,
        start: seg.start,
        end: seg.end,
        original_text: text,
        action: 'REMOVED',
        reason: 'Empty after non-speech audio token removal'
      });
      continue;
    }

    const wasNormalized = normalizedText !== text;
    if (wasNormalized) {
      auditLog.push({
        segment_id: seg.id,
        start: seg.start,
        end: seg.end,
        original_text: text,
        action: 'NORMALIZED',
        reason: 'Audio tags stripped and spacing normalized'
      });
    }

    const density = assessDensityTier(normalizedText);

    cleanedSegments.push({
      ...seg,
      text: normalizedText,
      density_tier: density,
      status: wasNormalized ? 'NORMALIZED' : 'PRESERVED'
    });

    previousText = normalizedText;
  }

  const retentionPct = Math.round((cleanedSegments.length / Math.max(1, raw.segments.length)) * 1000) / 10;

  return {
    video_id: raw.video_id,
    cleaned_segments: cleanedSegments,
    audit_log: auditLog,
    total_raw_segments: raw.segments.length,
    total_cleaned_segments: cleanedSegments.length,
    removed_segments_count: auditLog.filter((a) => a.action === 'REMOVED').length,
    retention_rate_pct: retentionPct
  };
}
