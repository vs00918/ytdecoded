import { YoutubeTranscript } from 'youtube-transcript';
import type { RawTranscript, TranscriptSegment } from './types';

export function extractVideoId(input: string): string | null {
  const clean = input.trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(clean)) return clean;

  const urlPatterns = [
    /(?:youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/,
    /youtube\.com\/shorts\/([^#&?]*).*/
  ];

  for (const pattern of urlPatterns) {
    const match = clean.match(pattern);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }

  return null;
}

export async function fetchRawTranscript(
  urlOrId: string,
  options?: { title?: string; channel?: string; lang?: string }
): Promise<RawTranscript> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL or Video ID: "${urlOrId}"`);
  }

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const lang = options?.lang || 'en';
  console.log(`📡 Fetching transcript for Video ID: ${videoId} (lang: ${lang})...`);

  try {
    let rawSegments;
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
    } catch (_) {
      // Fallback without explicit lang filter if specific lang fails
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    }

    if (!rawSegments || rawSegments.length === 0) {
      throw new Error(`No transcript segments returned for video: ${videoId}`);
    }

    const segments: TranscriptSegment[] = rawSegments.map((seg, idx) => {
      const startSec = Math.round((seg.offset / 1000) * 100) / 100;
      const durationSec = Math.round((seg.duration / 1000) * 100) / 100;
      const endSec = Math.round((startSec + durationSec) * 100) / 100;

      return {
        id: `seg-${String(idx + 1).padStart(4, '0')}`,
        start: startSec,
        end: endSec,
        duration: durationSec,
        text: seg.text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
      };
    });

    const maxEnd = segments[segments.length - 1]?.end || 0;

    return {
      video_id: videoId,
      url: standardUrl,
      title: options?.title || `YouTube Video ${videoId}`,
      channel: options?.channel || 'Unknown Channel',
      duration_seconds: maxEnd,
      language: lang,
      retrieved_at: new Date().toISOString(),
      transcript_type: 'OFFICIAL',
      segments
    };
  } catch (err: any) {
    throw new Error(`Transcript acquisition failed for ${videoId}: ${err.message}`);
  }
}
