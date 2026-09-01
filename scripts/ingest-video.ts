import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Dynamically resolve YoutubeTranscript from codex/node_modules or standard node_modules
let YoutubeTranscript: any;
try {
  YoutubeTranscript = require('youtube-transcript').YoutubeTranscript;
} catch (_) {
  try {
    const codexPath = path.join(process.cwd(), 'codex/node_modules/youtube-transcript/dist/commonjs/index.js');
    YoutubeTranscript = require(codexPath).YoutubeTranscript;
  } catch (err: any) {
    throw new Error(`Failed to load youtube-transcript package: ${err.message}`);
  }
}

export interface VideoMetadata {
  videoId: string;
  url: string;
  title: string;
  author: string;
  authorUrl: string;
  durationSeconds: number;
  segmentCount: number;
}

export interface IngestedTranscriptResult {
  metadata: VideoMetadata;
  transcriptText: string;
  timestampedParagraphs: Array<{ timestamp: string; seconds: number; text: string }>;
  cachePath?: string;
}

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

export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\n+/g, ' ')
    .trim();
}

export async function fetchPublicMetadata(videoId: string): Promise<{ title: string; author: string; authorUrl: string }> {
  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
  try {
    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`);
    if (res.ok) {
      const data = await res.json() as any;
      if (data && data.title) {
        return {
          title: data.title || `YouTube Video ${videoId}`,
          author: data.author_name || 'Unknown Creator',
          authorUrl: data.author_url || `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }
  } catch (_) {}

  // Fallback to youtube oembed
  try {
    const res2 = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(targetUrl)}&format=json`);
    if (res2.ok) {
      const data2 = await res2.json() as any;
      if (data2 && data2.title) {
        return {
          title: data2.title || `YouTube Video ${videoId}`,
          author: data2.author_name || 'Unknown Creator',
          authorUrl: data2.author_url || `https://www.youtube.com/watch?v=${videoId}`
        };
      }
    }
  } catch (_) {}

  return {
    title: `YouTube Video ${videoId}`,
    author: 'Unknown Creator',
    authorUrl: targetUrl
  };
}

export async function ingestVideo(urlOrId: string): Promise<IngestedTranscriptResult> {
  const videoId = extractVideoId(urlOrId);
  if (!videoId) {
    throw new Error(`Invalid YouTube URL or Video ID: "${urlOrId}"`);
  }

  const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;

  // 1. Fetch metadata
  const meta = await fetchPublicMetadata(videoId);

  // 2. Fetch transcript segments
  let rawSegments: any[] = [];
  try {
    rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
  } catch (_) {
    // Fallback without lang filter
    try {
      rawSegments = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (err: any) {
      throw new Error(`Failed to retrieve public transcript for ${videoId}: ${err.message}`);
    }
  }

  if (!rawSegments || rawSegments.length === 0) {
    throw new Error(`Transcript for video ${videoId} returned 0 segments.`);
  }

  // 3. Conservative normalization & Paragraph grouping
  const paragraphs: Array<{ timestamp: string; seconds: number; text: string }> = [];
  let currentGroupText: string[] = [];
  let currentGroupStart = 0;

  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i];
    const cleanText = decodeHtmlEntities(seg.text);
    if (!cleanText) continue;

    const startSec = Math.round(seg.offset / 1000);

    if (currentGroupText.length === 0) {
      currentGroupStart = startSec;
    }

    currentGroupText.push(cleanText);

    const timeDelta = startSec - currentGroupStart;
    const isSentenceEnd = /[.!?]$/.test(cleanText);

    if (timeDelta >= 45 || (timeDelta >= 25 && isSentenceEnd) || i === rawSegments.length - 1) {
      paragraphs.push({
        timestamp: formatTimestamp(currentGroupStart),
        seconds: currentGroupStart,
        text: currentGroupText.join(' ')
      });
      currentGroupText = [];
    }
  }

  const fullText = paragraphs.map(p => `[${p.timestamp}] ${p.text}`).join('\n\n');
  const maxEnd = rawSegments[rawSegments.length - 1]
    ? Math.round((rawSegments[rawSegments.length - 1].offset + rawSegments[rawSegments.length - 1].duration) / 1000)
    : 0;

  const metadata: VideoMetadata = {
    videoId,
    url: standardUrl,
    title: meta.title,
    author: meta.author,
    authorUrl: meta.authorUrl,
    durationSeconds: maxEnd,
    segmentCount: rawSegments.length
  };

  // Cache transcript to disk
  const cacheDir = path.join(process.cwd(), '.cache', 'transcripts');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const cachePath = path.join(cacheDir, `${videoId}.json`);
  fs.writeFileSync(cachePath, JSON.stringify({ metadata, paragraphs, fullText }, null, 2), 'utf8');

  return {
    metadata,
    transcriptText: fullText,
    timestampedParagraphs: paragraphs,
    cachePath
  };
}

// CLI Execution Support
if (process.argv[1] && process.argv[1].includes('ingest-video')) {
  const targetUrl = process.argv[2];
  if (!targetUrl) {
    console.error('Usage: npx tsx scripts/ingest-video.ts <YouTube-URL-or-ID>');
    process.exit(1);
  }

  console.log(`🎬 Fetching transcript & public metadata for: ${targetUrl}...`);
  ingestVideo(targetUrl)
    .then((res) => {
      console.log('\n============================================================');
      console.log('✅ TRANSCRIPT ACQUISITION SUCCESSFUL');
      console.log('============================================================');
      console.log(`Title:    ${res.metadata.title}`);
      console.log(`Author:   ${res.metadata.author}`);
      console.log(`URL:      ${res.metadata.url}`);
      console.log(`Duration: ${Math.floor(res.metadata.durationSeconds / 60)}m ${res.metadata.durationSeconds % 60}s (${res.metadata.segmentCount} raw segments)`);
      console.log(`Cache:    ${res.cachePath}`);
      console.log('============================================================\n');
      console.log('--- TRANSCRIPT PREVIEW (First 500 chars) ---');
      console.log(res.transcriptText.slice(0, 500) + '...\n');
    })
    .catch((err) => {
      console.error(`❌ Ingestion failed: ${err.message}`);
      process.exit(1);
    });
}
