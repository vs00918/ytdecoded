import { fetchRawTranscript } from '../src/pipeline/fetch-transcript.ts';

async function testLiveFetch() {
  const testIds = [
    { name: 'Video 1 (Zurita Ona)', id: '5gdXbMoTEZg' },
    { name: 'Video 2 (Kahneman Google Talk)', id: 'CjVQJdIrDJ0' }, // Daniel Kahneman: "Thinking, Fast and Slow" | Talks at Google
    { name: 'Video 3 (Stoicism - Einzelgänger)', id: '2bguEiUgDA4' }, // Stoicism - How to not care what people think
    { name: 'Video 4 (Huberman - Dopamine)', id: 'QmOF0crdyRU' }, // Controlling Your Dopamine for Motivation, Focus & Satisfaction | Huberman Lab Podcast #39
    { name: 'Video 5 (Galpin - Huberman Lab)', id: 'BGf0E_u0tX0' } // Dr. Andy Galpin: How to Build Physical Endurance & Neuromuscular Recovery
  ];

  for (const item of testIds) {
    console.log(`\n========================================`);
    console.log(`Testing Live Fetch: ${item.name} (${item.id})`);
    try {
      const startTime = Date.now();
      const raw = await fetchRawTranscript(item.id);
      const latency = Date.now() - startTime;
      const totalWords = raw.segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
      const totalChars = raw.segments.reduce((acc, s) => acc + s.text.length, 0);
      const firstSeg = raw.segments[0];
      const lastSeg = raw.segments[raw.segments.length - 1];

      console.log(`✅ SUCCESS in ${latency}ms`);
      console.log(`- Video ID: ${raw.video_id}`);
      console.log(`- Segments: ${raw.segments.length}`);
      console.log(`- Total Words: ${totalWords}`);
      console.log(`- Total Chars: ${totalChars}`);
      console.log(`- Duration (est from segments): ${raw.duration_seconds}s (${(raw.duration_seconds / 60).toFixed(1)} mins)`);
      console.log(`- First Segment [${firstSeg.start}s-${firstSeg.end}s]: "${firstSeg.text}"`);
      console.log(`- Last Segment [${lastSeg.start}s-${lastSeg.end}s]: "${lastSeg.text}"`);
    } catch (err: any) {
      console.error(`❌ FAILED: ${err.message}`);
    }
  }
}

testLiveFetch();
