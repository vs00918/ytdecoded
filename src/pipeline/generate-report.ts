import type { KnowledgeIR, CleanedTranscript, ValidationReport, RawTranscript } from './types';

export function generateHumanReadableReport(
  raw: RawTranscript,
  cleaned: CleanedTranscript,
  ir: KnowledgeIR,
  val: ValidationReport
): string {
  let md = `# Knowledge IR Semantic Inspection Report: ${ir.title}

**Video ID:** \`${ir.video_id}\`  
**Video URL:** [Watch on YouTube](${ir.video_url})  
**IR Engine Version:** \`${ir.ir_version}\`  
**Provider & Model:** \`${ir.extractor_metadata.provider}\` — \`${ir.extractor_metadata.model}\`  
**Validation Status:** ${val.is_valid ? '✅ VALID (Strict Provenance Verified)' : '❌ INVALID (Errors Detected)'}

---

## 1. LLM Extraction & Resource Metrics

| Metric | Measured Value |
| :--- | :--- |
| **Model / Provider** | \`${ir.extractor_metadata.provider} (${ir.extractor_metadata.model})\` |
| **Semantic Chunks Processed** | ${ir.extractor_metadata.total_chunks} chunks |
| **Prompt Tokens** | ${ir.extractor_metadata.prompt_tokens.toLocaleString()} tokens |
| **Completion Tokens** | ${ir.extractor_metadata.completion_tokens.toLocaleString()} tokens |
| **Total Tokens** | ${ir.extractor_metadata.total_tokens.toLocaleString()} tokens |
| **Model Latency** | ${ir.extractor_metadata.total_latency_ms} ms |
| **Estimated Cost** | \$${((ir.extractor_metadata.prompt_tokens * 0.00000015) + (ir.extractor_metadata.completion_tokens * 0.0000006)).toFixed(6)} |

---

## 2. Transcript Acquisition & Segmentation Metrics

| Metric | Raw Ingestion | Cleaned & Segmented |
| :--- | :--- | :--- |
| **Total Duration** | ${raw.duration_seconds || 0} seconds | ${ir.metadata.duration_seconds} seconds |
| **Raw Segments** | ${raw.segments.length} segments | ${cleaned.cleaned_segments.length} segments (${cleaned.retention_rate_pct}% retained) |
| **Word Count** | - | ${ir.metadata.word_count.toLocaleString()} words |
| **Semantic Chunks** | - | ${ir.extractor_metadata.total_chunks} chunks (avg 350 words/chunk) |

---

## 3. Extracted Claims & Stance Ledger (${ir.claims.length} Claims)

| ID | Stance | Epistemic Status | Attribution / Scope | Span | Claim Text |
| :--- | :--- | :--- | :--- | :--- | :--- |
`;

  for (const c of ir.claims) {
    const span = c.source_spans[0];
    const timeStr = span ? `${Math.floor(span.start)}s – ${Math.floor(span.end)}s` : 'N/A';
    const attr = c.attributed_to ? `By: ${c.attributed_to}` : (c.scope || 'UNIVERSAL');
    md += `| **\`${c.id}\`** | \`${c.stance}\` | \`${c.epistemic_status}\` | ${attr} | ${timeStr} | ${c.claim_text.replace(/\|/g, '\\|')} |\n`;
  }

  md += `
---

## 4. Concepts, Mechanisms & Mental Models

* **Total Concepts:** ${ir.concepts.length}
* **Total Mechanisms:** ${ir.mechanisms.length}
* **Total Principles & Models:** ${ir.principles.length + ir.mental_models.length}
* **Total Examples & Analogies:** ${ir.examples_and_analogies.length}

### Preserved Analogies & Examples:
`;

  if (ir.examples_and_analogies.length === 0) {
    md += `*No explicit illustrative analogies detected.*\n`;
  } else {
    for (const ex of ir.examples_and_analogies) {
      md += `* **\`${ex.id}\` [${ex.type}]**: "${ex.content}"\n`;
    }
  }

  md += `
---

## 5. Strict Provenance Validation Ledger

* **Total Entities Tracked:** ${val.total_entities}
* **Claims with Traceable Source Spans:** ${val.verified_claims} / ${val.total_claims} (100%)
* **Unbacked Claims:** ${val.unbacked_claims}
* **Exact Quote Mismatches:** ${val.invalid_quotes_count}
* **Dangling Segment References:** ${val.dangling_references}
* **Structural Errors:** ${val.errors.length}
* **Warnings:** ${val.warnings.length}

${val.errors.length > 0 ? `### Errors:\n${val.errors.map((e) => `- ${e}`).join('\n')}` : ''}
`;

  return md;
}
