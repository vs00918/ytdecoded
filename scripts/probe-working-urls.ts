import { fetchRawTranscript } from '../src/pipeline/fetch-transcript.ts';

async function findWorkingVideos() {
  const candidateIds = [
    // Stoicism / Philosophy
    { name: 'Stoicism - Ryan Holiday / Daily Stoic', id: 'mS_1U5dG8Z4' },
    { name: 'Epictetus - Massimo Pigliucci TED-Ed / Talk', id: 'u399XmkjeXU' },
    { name: 'Stoicism Philosophy Course - Michael Sugrue', id: 'u4kM1qKkK-U' },
    { name: 'Marcus Aurelius Stoicism - Einzelgänger 2', id: 'f_4V1xXG-p0' },
    { name: 'Stoicism - Daily Stoic Guide', id: 'DjhV_3gA8wU' },
    
    // Physiology / Long-Form Interview
    { name: 'Galpin - 6 Steps to Build Endurance (Huberman Clip)', id: '40Dydq8tE5k' },
    { name: 'Peter Attia - Centenarian Decathlon', id: 'j4mXyv-jZhs' },
    { name: 'Matthew Walker - Sleep & Memory (TED Talk)', id: '5MuIMqhT8DM' }
  ];

  for (const c of candidateIds) {
    try {
      const raw = await fetchRawTranscript(c.id);
      const totalWords = raw.segments.reduce((acc, s) => acc + s.text.split(/\s+/).filter(Boolean).length, 0);
      console.log(`✅ FOUND LIVE: [${c.id}] "${c.name}" - ${raw.segments.length} segments, ${totalWords} words, ${raw.duration_seconds}s (${(raw.duration_seconds/60).toFixed(1)}m)`);
    } catch (e: any) {
      console.log(`❌ Disabled/Invalid: [${c.id}] "${c.name}" - ${e.message}`);
    }
  }
}

findWorkingVideos();
