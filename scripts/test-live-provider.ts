import { getLiveProviderFromConfig, GeminiLLMProvider, OpenAILLMProvider, sanitizeErrorMessage } from '../src/pipeline/llm-provider.ts';
import { validateKnowledgeIR } from '../src/pipeline/validate-ir.ts';
import type { CleanedTranscript, KnowledgeIR } from '../src/pipeline/types.ts';

async function runPreflight() {
  console.log('\n======================================================');
  console.log('🔬 PHASE 10.7.1: LIVE LLM PROVIDER PREFLIGHT AUDIT');
  console.log('======================================================\n');

  // 1. Check Configuration & Environment
  const providerType = process.env.LLM_PROVIDER || 'gemini';
  const geminiModel = process.env.GEMINI_MODEL || '[NOT SET - EXPLICIT CONFIG REQUIRED]';
  const openaiModel = process.env.OPENAI_MODEL || '[NOT SET - EXPLICIT CONFIG REQUIRED]';
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY);

  console.log('📋 1. CONFIGURATION & CREDENTIAL STATUS:');
  console.log(`- Configured Provider Mode: ${providerType}`);
  console.log(`- Gemini Model Target:     ${geminiModel}`);
  console.log(`- OpenAI Model Target:     ${openaiModel}`);
  console.log(`- GEMINI_API_KEY Present:  ${hasGeminiKey ? '✅ YES' : '❌ NO'}`);
  console.log(`- OPENAI_API_KEY Present:  ${hasOpenAIKey ? '✅ YES' : '❌ NO'}`);

  // 2. Secret-Safety Verification
  console.log('\n🔒 2. SECRET-SAFETY & ERROR SANITIZATION VERIFICATION:');
  const dummySecret = 'AIzaSySecretApiKey1234567890';
  const sampleError = `API request failed with key ${dummySecret}: Invalid token`;
  const sanitized = sanitizeErrorMessage(sampleError, dummySecret);
  const isSanitized = !sanitized.includes(dummySecret) && sanitized.includes('[REDACTED_API_KEY]');
  console.log(`- Sanitizer Redaction Test: ${isSanitized ? '✅ PASSED (Secrets safely redacted)' : '❌ FAILED'}`);

  // 3. Failure Handling Verification (Missing Key & Missing Model)
  console.log('\n🛡️ 3. FAILURE HANDLING & CONFIGURATION VALIDATION:');
  try {
    new GeminiLLMProvider('', 'gemini-3.7-flash');
    console.log('- Missing Key Exception:   ❌ FAILED (Did not throw)');
  } catch (err: any) {
    console.log(`- Missing Key Exception:   ✅ PASSED (${err.message})`);
  }

  try {
    new GeminiLLMProvider('test-key', '');
    console.log('- Missing Model Exception: ❌ FAILED (Did not throw)');
  } catch (err: any) {
    console.log(`- Missing Model Exception: ✅ PASSED (${err.message})`);
  }

  // 4. Evidence Validator Integrity Test
  console.log('\n🔍 4. EVIDENCE VALIDATOR INTEGRITY TEST:');
  const mockCleanTranscript: CleanedTranscript = {
    video_id: 'test-preflight',
    cleaned_segments: [
      { id: 'seg-01', start: 0, end: 5, duration: 5, text: 'I avoid difficult tasks because uncertainty makes me uncomfortable.', density_tier: 'HIGH', status: 'PRESERVED' }
    ],
    audit_log: [],
    total_raw_segments: 1,
    total_cleaned_segments: 1,
    removed_segments_count: 0,
    retention_rate_pct: 100
  };

  const validIR: KnowledgeIR = {
    ir_version: '2.0.0',
    video_id: 'test-preflight',
    video_url: 'https://youtube.com',
    title: 'Preflight Test',
    generated_at: new Date().toISOString(),
    extractor_metadata: { provider: 'Test', model: 'Test', total_chunks: 1, prompt_tokens: 10, completion_tokens: 10, total_tokens: 20, total_latency_ms: 5 },
    metadata: { duration_seconds: 5, word_count: 10, high_density_segment_count: 1 },
    claims: [{
      id: 'CLM-01',
      claim_text: 'Uncertainty causes task avoidance',
      stance: 'ASSERTED',
      epistemic_status: 'SOURCE_EXTRACTED',
      confidence: 'HIGH',
      source_spans: [{ start: 0, end: 5, segment_ids: ['seg-01'], quoted_text: 'I avoid difficult tasks because uncertainty makes me uncomfortable.' }]
    }],
    concepts: [],
    mechanisms: [],
    principles: [],
    mental_models: [],
    examples_and_analogies: [],
    arguments: [],
    uncertainties: []
  };

  const fabricatedIR: KnowledgeIR = {
    ...validIR,
    claims: [{
      ...validIR.claims[0],
      source_spans: [{ start: 0, end: 5, segment_ids: ['seg-01'], quoted_text: 'This hallucinated quotation does not exist in audio.' }]
    }]
  };

  const validCheck = validateKnowledgeIR(validIR, mockCleanTranscript);
  const fabricatedCheck = validateKnowledgeIR(fabricatedIR, mockCleanTranscript);

  console.log(`- Exact Verbatim Quote Span: ${validCheck.is_valid ? '✅ PASSED (Valid evidence accepted)' : '❌ FAILED'}`);
  console.log(`- Fabricated Quote Span:    ${!fabricatedCheck.is_valid && fabricatedCheck.invalid_quotes_count === 1 ? '✅ PASSED (Hallucination rejected & quarantined)' : '❌ FAILED'}`);

  // 5. Active Live Provider Execution Check
  console.log('\n🚀 5. ACTIVE LIVE PROVIDER EXECUTION CHECK:');
  const activeProvider = getLiveProviderFromConfig();

  if (!activeProvider) {
    console.log('⚠️  STOP CONDITION MET:');
    console.log('   - LIVE PROVIDER READY: YES');
    console.log('   - CREDENTIAL REQUIRED: YES');
    console.log('   - BENCHMARK NOT RUN:   Confirmed (Zero mock substitution applied)\n');
    return;
  }

  console.log(`✅ Live Provider Instantiated: [${activeProvider.providerName}] with Model: [${activeProvider.modelName}]`);
  console.log('📡 Executing minimal live authentication & structured generation check...');

  const prompt = `Input segment: [seg-01] (0.0s-5.0s): I avoid difficult tasks because uncertainty makes me uncomfortable.
Extract one structured claim JSON adhering to this schema:
{
  "claims": [
    {
      "claim_text": "string",
      "stance": "ASSERTED",
      "quoted_text": "I avoid difficult tasks because uncertainty makes me uncomfortable."
    }
  ]
}`;

  try {
    const res = await activeProvider.generateStructured<any>(prompt, {});
    console.log(`✅ Live API Request Succeeded in ${res.latencyMs}ms!`);
    console.log(`- Model: ${res.model}`);
    console.log(`- Usage: PromptTokens=${res.usage.promptTokens}, CompletionTokens=${res.usage.completionTokens}, Total=${res.usage.totalTokens}`);
    console.log('- Response Preview:', JSON.stringify(res.data, null, 2));
  } catch (err: any) {
    console.error(`❌ Live API Call Failed: ${err.message}`);
    process.exit(1);
  }
}

runPreflight().catch((err) => {
  console.error('Fatal preflight error:', err);
  process.exit(1);
});
