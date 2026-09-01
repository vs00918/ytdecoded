import { fetchRawTranscript } from '../src/pipeline/fetch-transcript.ts';

async function probeTEDTalks() {
  const candidates = [
    { name: 'Massimo Pigliucci Stoicism (TEDxAthens)', id: 'Yhn1Fe8cT0Q' },
    { name: 'Carol Dweck - Mindset (TED)', id: '_X0mgOOSpLU' },
    { name: 'Barry Schwartz - Paradox of Choice (TED)', id: 'VO6XEQIsCoM' },
    { name: 'Angela Duckworth - Grit (TED)', id: 'H14bBuluwB8' },
    { name: 'Tim Urban - Procrastination (TED)', id: 'arj7oStGLkU' },
    { name: 'Kelly McGonigal - How to Make Stress Your Friend (TED)', id: 'RcGyVTAoXEU' },
    { name: 'Dan Ariely - Predictably Irrational (TED)', id: '9X68dm92HVI' },
    { name: 'Amy Cuddy - Body Language (TED)', id: 'Ks-_Mh1QhMc' }
  ];

  for (const c of candidates) {
    try {
      const raw = await fetchRawTranscript(c.id);
      const totalWords = raw.segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
      console.log(`✅ FOUND LIVE: [${c.id}] "${c.name}" - ${raw.segments.length} segments, ${totalWords} words, ${raw.duration_seconds}s (${(raw.duration_seconds/60).toFixed(1)}m)`);
    } catch (e: any) {
      console.log(`❌ Disabled: [${c.id}] "${c.name}" - ${e.message}`);
    }
  }
}

probeTEDTalks();
