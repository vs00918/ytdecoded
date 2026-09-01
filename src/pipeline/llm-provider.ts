import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isTransientHttpError, isTransientError, calculateBackoffDelay, DEFAULT_RETRY_CONFIG } from './retry-policy.ts';

// Auto-load local .env if present without logging secrets
function loadEnvFile() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const envPaths = [
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'codex', '.env'),
    path.join(__dirname, '..', '..', '.env')
  ];
  for (const p of envPaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
            const idx = trimmed.indexOf('=');
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
            if (key && !process.env[key]) {
              process.env[key] = val;
            }
          }
        }
      } catch (_) {}
    }
  }
}
loadEnvFile();

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse<T> {
  data: T;
  rawText: string;
  usage: TokenUsage;
  latencyMs: number;
  model: string;
  provider: string;
}

export interface LLMProvider {
  providerName: string;
  modelName: string;
  adapterVersion: string;
  generateStructured<T>(
    prompt: string,
    schema: Record<string, any>,
    systemPrompt?: string
  ): Promise<LLMResponse<T>>;
}

/**
 * Sanitizes strings to prevent accidental credential leakage in logs or error messages.
 */
export function sanitizeErrorMessage(message: string, keyToRedact?: string): string {
  if (!keyToRedact || keyToRedact.length < 5) return message;
  const escaped = keyToRedact.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return message.replace(new RegExp(escaped, 'g'), '[REDACTED_API_KEY]');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Google Gemini Provider (Google Generative AI)
 */
export class GeminiLLMProvider implements LLMProvider {
  providerName = 'Gemini';
  modelName: string;
  adapterVersion = '1.0.0-gemini-structured';
  private apiKey: string;
  private temperature: number;
  private maxRetries: number;

  constructor(apiKey?: string, modelName?: string, temperature?: number) {
    this.apiKey = apiKey !== undefined ? apiKey : (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is missing.');
    }

    const resolvedModel = modelName !== undefined ? modelName : process.env.GEMINI_MODEL;
    if (!resolvedModel) {
      throw new Error('GEMINI_MODEL environment variable is missing. Explicit model configuration is required.');
    }
    this.modelName = resolvedModel;
    this.temperature = temperature ?? parseFloat(process.env.LLM_TEMPERATURE || '0.1');
    this.maxRetries = parseInt(process.env.LLM_RETRY_ATTEMPTS || '3', 10);
  }

  async generateStructured<T>(
    prompt: string,
    schema: Record<string, any>,
    systemPrompt?: string
  ): Promise<LLMResponse<T>> {
    const startTime = Date.now();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: this.temperature
      }
    };

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });

        if (!res.ok) {
          const errText = await res.text();
          const safeError = sanitizeErrorMessage(errText, this.apiKey);

          if (isTransientHttpError(res.status) && attempt < this.maxRetries) {
            const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
            console.log(`⚠️ Gemini API HTTP ${res.status} transient error on attempt ${attempt}/${this.maxRetries}. Backing off with jitter for ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          throw new Error(`Gemini API error (${res.status}): ${safeError}`);
        }

        const jsonRes: any = await res.json();
        const rawText = jsonRes.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        const data = JSON.parse(rawText) as T;

        const usage: TokenUsage = {
          promptTokens: jsonRes.usageMetadata?.promptTokenCount || 0,
          completionTokens: jsonRes.usageMetadata?.candidatesTokenCount || 0,
          totalTokens: jsonRes.usageMetadata?.totalTokenCount || 0
        };

        return {
          data,
          rawText,
          usage,
          latencyMs: Date.now() - startTime,
          model: this.modelName,
          provider: this.providerName
        };
      } catch (err: any) {
        lastError = new Error(sanitizeErrorMessage(err.message, this.apiKey));
        if (isTransientError(err) && attempt < this.maxRetries) {
          const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
          console.log(`⚠️ Transient network error on attempt ${attempt}/${this.maxRetries} (${err.message}). Retrying in ${delay}ms...`);
          await sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('Gemini API call failed after retries.');
  }
}

/**
 * OpenAI Provider
 */
export class OpenAILLMProvider implements LLMProvider {
  providerName = 'OpenAI';
  modelName: string;
  adapterVersion = '1.0.0-openai-json';
  private apiKey: string;
  private temperature: number;
  private maxRetries: number;

  constructor(apiKey?: string, modelName?: string, temperature?: number) {
    this.apiKey = apiKey !== undefined ? apiKey : (process.env.OPENAI_API_KEY || '');
    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is missing.');
    }

    const resolvedModel = modelName !== undefined ? modelName : process.env.OPENAI_MODEL;
    if (!resolvedModel) {
      throw new Error('OPENAI_MODEL environment variable is missing. Explicit model configuration is required.');
    }
    this.modelName = resolvedModel;
    this.temperature = temperature ?? parseFloat(process.env.LLM_TEMPERATURE || '0.1');
    this.maxRetries = parseInt(process.env.LLM_RETRY_ATTEMPTS || '3', 10);
  }

  async generateStructured<T>(
    prompt: string,
    schema: Record<string, any>,
    systemPrompt?: string
  ): Promise<LLMResponse<T>> {
    const startTime = Date.now();
    const url = 'https://api.openai.com/v1/chat/completions';

    const messages = [
      {
        role: 'system',
        content: `${systemPrompt || 'You extract structured knowledge.'}\nYou MUST respond ONLY with valid JSON conforming to the requested schema.`
      },
      { role: 'user', content: prompt }
    ];

    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: this.modelName,
            messages,
            temperature: this.temperature,
            response_format: { type: 'json_object' }
          })
        });

        if (!res.ok) {
          const errText = await res.text();
          const safeError = sanitizeErrorMessage(errText, this.apiKey);

          if (isTransientHttpError(res.status) && attempt < this.maxRetries) {
            const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
            console.log(`⚠️ OpenAI API HTTP ${res.status} transient error on attempt ${attempt}/${this.maxRetries}. Backing off with jitter for ${delay}ms...`);
            await sleep(delay);
            continue;
          }
          throw new Error(`OpenAI API error (${res.status}): ${safeError}`);
        }

        const jsonRes: any = await res.json();
        const rawText = jsonRes.choices?.[0]?.message?.content || '{}';
        const data = JSON.parse(rawText) as T;

        const usage: TokenUsage = {
          promptTokens: jsonRes.usage?.prompt_tokens || 0,
          completionTokens: jsonRes.usage?.completion_tokens || 0,
          totalTokens: jsonRes.usage?.total_tokens || 0
        };

        return {
          data,
          rawText,
          usage,
          latencyMs: Date.now() - startTime,
          model: this.modelName,
          provider: this.providerName
        };
      } catch (err: any) {
        lastError = new Error(sanitizeErrorMessage(err.message, this.apiKey));
        if (isTransientError(err) && attempt < this.maxRetries) {
          const delay = calculateBackoffDelay(attempt, DEFAULT_RETRY_CONFIG);
          console.log(`⚠️ Transient network error on attempt ${attempt}/${this.maxRetries}. Retrying in ${delay}ms...`);
          await sleep(delay);
        } else {
          break;
        }
      }
    }

    throw lastError || new Error('OpenAI API call failed after retries.');
  }
}

/**
 * Factory that returns the configured live provider or null if no credentials exist.
 */
export function getLiveProviderFromConfig(): LLMProvider | null {
  loadEnvFile();
  const preferred = (process.env.LLM_PROVIDER || '').toLowerCase();

  if (preferred === 'gemini' || (!preferred && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY))) {
    const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (key && process.env.GEMINI_MODEL) {
      return new GeminiLLMProvider(key, process.env.GEMINI_MODEL);
    }
  }

  if (preferred === 'openai' || (!preferred && process.env.OPENAI_API_KEY)) {
    const key = process.env.OPENAI_API_KEY;
    if (key && process.env.OPENAI_MODEL) {
      return new OpenAILLMProvider(key, process.env.OPENAI_MODEL);
    }
  }

  return null;
}

/**
 * Resolves the active provider. Uses custom provider or defaults to hermetic SemanticMockProvider for safe offline unit testing.
 */
export function getLLMProvider(customProvider?: LLMProvider): LLMProvider {
  if (customProvider) return customProvider;
  return new SemanticMockProvider();
}

/**
 * Hermetic Semantic Mock Provider for Automated Tests & CI.
 */
export class SemanticMockProvider implements LLMProvider {
  providerName = 'SemanticMock';
  modelName = 'mock-semantic-engine-v2';
  adapterVersion = '2.0.0-hermetic-mock';

  async generateStructured<T>(
    prompt: string,
    schema: Record<string, any>,
    systemPrompt?: string
  ): Promise<LLMResponse<T>> {
    const startTime = Date.now();
    const claims: any[] = [];
    const concepts: any[] = [];
    const mechanisms: any[] = [];
    const analogies: any[] = [];

    const segMatches = Array.from(prompt.matchAll(/\[(seg-\d+)\]\s*\(([\d.]+)s-([\d.]+)s\):\s*([^\n]+)/g));

    for (const match of segMatches) {
      const segId = match[1];
      const start = parseFloat(match[2]);
      const end = parseFloat(match[3]);
      const text = match[4].trim();

      if (text.includes('Nobel laureates') || text.includes('we would all be CEOs') || text.includes('CEOs')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'EXAMPLE_ONLY',
          epistemic_status: 'MODEL_INTERPRETATION',
          confidence: 'LOW',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }],
          rationale: 'Rhetorical sarcasm detected'
        });
      } else if (text.endsWith('?') || text.includes('what is the nature') || text.includes('could that mean')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'QUESTION',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'MEDIUM',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.startsWith('My friend Bob') || text.includes('took a cold shower and felt')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'EXAMPLE_ONLY',
          scope: 'INDIVIDUAL',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.includes('not true') || text.includes('false') || text.includes('refuted') || text.includes('disproved') || text.includes('proves this wrong')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'REFUTED',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.includes('no causal conclusions') || text.includes('observational evidence') || text.includes('do not have sufficient') || text.includes('do not really know')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'UNCERTAIN',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.startsWith('Either ') || text.includes('could explain') || text.includes('might be that')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'POSSIBLE',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'MEDIUM',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.startsWith('If ') || text.includes('were to ') || text.includes('might happen')) {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'HYPOTHETICAL',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'MEDIUM',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.includes('Dr. ') || text.includes('opponents argue') || text.includes('researchers say') || text.includes('According to ') || text.includes('phrenologists claimed') || text.includes('Smith argues')) {
        const attr = text.includes('opponents') ? 'Ideological Opponents' : text.includes('Smith') ? 'Smith (2019)' : 'Attributed Source';
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'ATTRIBUTED',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          attributed_to: attr,
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else if (text.includes('like ') || text.includes('bandages') || text.includes('advisory board')) {
        analogies.push({
          id: `EXM-${analogies.length + 1}`,
          type: 'ANALOGY',
          content: text,
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      } else {
        claims.push({
          id: `CLM-${claims.length + 1}`,
          claim_text: text,
          stance: 'ASSERTED',
          epistemic_status: 'SOURCE_EXTRACTED',
          confidence: 'HIGH',
          source_spans: [{ start, end, segment_ids: [segId], quoted_text: text }]
        });
      }
    }

    const data = {
      claims,
      concepts,
      mechanisms,
      principles: [],
      mental_models: [],
      examples_and_analogies: analogies,
      arguments: [],
      uncertainties: []
    } as unknown as T;

    return {
      data,
      rawText: JSON.stringify(data),
      usage: {
        promptTokens: prompt.length / 4,
        completionTokens: 200,
        totalTokens: prompt.length / 4 + 200
      },
      latencyMs: Date.now() - startTime,
      model: this.modelName,
      provider: this.providerName
    };
  }
}
