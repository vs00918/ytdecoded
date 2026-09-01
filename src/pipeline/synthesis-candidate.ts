import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { KnowledgeIR } from './types.ts';
import type { VideoRoutingResult, UnitRoutingDecision } from './topic-router.ts';
import type { SynthesisProposal, ProposalState, ProvenanceMode } from './proposal-types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const topicsDir = path.join(codexRoot, 'src', 'content', 'topics');

export function computeFileHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

export function generateSynthesisProposals(
  ir: KnowledgeIR,
  routingResult: VideoRoutingResult
): SynthesisProposal[] {
  const proposals: SynthesisProposal[] = [];
  let proposalSeq = 1;

  for (const dec of routingResult.decisions) {
    if (
      dec.decision === 'ALREADY_COVERED' ||
      dec.decision === 'FILTERED_NON_CANONICAL' ||
      dec.decision === 'INSUFFICIENT_CONFIDENCE'
    ) {
      continue;
    }

    const isNewTopic = dec.decision === 'NEW_TOPIC';
    const targetSlug = isNewTopic ? null : dec.target_topic_slug;
    const targetTitle = isNewTopic ? `Proposed New Topic for ${ir.title}` : dec.target_topic_title;

    let targetHashBefore = '';
    let existingContent = '';

    if (targetSlug) {
      const topicPath = path.join(topicsDir, `${targetSlug}.md`);
      if (fs.existsSync(topicPath)) {
        existingContent = fs.readFileSync(topicPath, 'utf8');
        targetHashBefore = computeFileHash(existingContent);
      }
    }

    const evidenceList = dec.source_spans.map((span, idx) => ({
      entity_id: dec.constituent_entity_ids[idx] || dec.unit_id,
      start: span.start,
      end: span.end,
      quoted_text: span.quoted_text
    }));

    let sectionName = '## Empirical Nuance & Boundary Conditions';
    let action: 'APPEND_SECTION' | 'INSERT_QUALIFICATION' | 'CREATE_TOPIC_STUB' = 'APPEND_SECTION';
    let proposedMarkdownSnippet = '';

    if (isNewTopic) {
      action = 'CREATE_TOPIC_STUB';
      sectionName = 'Draft Article';
      proposedMarkdownSnippet = `---
title: "${ir.title}"
volume: 9
order_in_volume: 1
archetype: "CONCEPTUAL_SYNTHESIS"
summary_15s: "Autonomous extraction candidate derived from ${ir.video_url}."
tags: ["synthesis-candidate", "new-domain"]
mental_models: []
---

# ${ir.title}

## Core Mechanics
- **Core Thesis**: ${dec.core_thesis}

## Source Provenance & Evidence
- **Source Video:** [Watch on YouTube](${ir.video_url})
${evidenceList.map((e) => `  - [${Math.floor(e.start)}s-${Math.floor(e.end)}s]: "${e.quoted_text}"`).join('\n')}
`;
    } else if (dec.decision === 'CONTRADICTION_OR_CHALLENGE') {
      sectionName = '## Dialectical Tensions & Refutations';
      action = 'INSERT_QUALIFICATION';
      proposedMarkdownSnippet = `
### Contradiction & Challenge from Audio Ingestion
- **Challenge Proposition**: ${dec.core_thesis}
- **Evidence Reference**: [${ir.video_id}](${ir.video_url})
- **Quoted Source**: "${evidenceList[0]?.quoted_text || 'See provenance'}"
`;
    } else if (dec.decision === 'EXAMPLE_OR_APPLICATION') {
      sectionName = '## Tactical Applications & Concrete Analogies';
      proposedMarkdownSnippet = `
### Preserved Case Analogy
> "${dec.core_thesis}"
> — *Source: [${ir.video_id} (${Math.floor(evidenceList[0]?.start || 0)}s)](${ir.video_url})*
`;
    } else if (dec.decision === 'QUALIFICATION_OR_BOUNDARY') {
      sectionName = '## Boundary Conditions & Operational Scope';
      proposedMarkdownSnippet = `
### Operational Boundary Condition
- **Qualification**: ${dec.core_thesis} *(Source: [${ir.video_id}](${ir.video_url}))*
`;
    } else {
      // ENRICH_EXISTING
      sectionName = '## Extended Mechanical Insights';
      proposedMarkdownSnippet = `
### Extended Mechanical Insight
- **Mechanic**: ${dec.core_thesis} *(Source: [${ir.video_id}](${ir.video_url}))*
`;
    }

    const unifiedDiff = `--- a/${targetSlug ? `src/content/topics/${targetSlug}.md` : 'NEW_TOPIC.md'}
+++ b/${targetSlug ? `src/content/topics/${targetSlug}.md` : 'NEW_TOPIC.md'}
@@ -0,0 +1,${proposedMarkdownSnippet.trim().split('\n').length} @@
+${proposedMarkdownSnippet.trim().split('\n').join('\n+')}
`;

    proposals.push({
      proposal_id: `PROP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${String(proposalSeq++).padStart(3, '0')}`,
      created_at: new Date().toISOString(),
      state: 'PROPOSED',
      provenance_mode: 'AI_GENERATED',
      video_id: ir.video_id,
      video_title: ir.title,
      video_url: ir.video_url,
      unit_id: dec.unit_id,
      target_topic_slug: targetSlug,
      target_topic_title: targetTitle,
      target_content_hash_before: targetHashBefore || undefined,
      routing_decision: dec.decision,
      confidence: dec.confidence,
      confidence_score: dec.confidence_score,
      rationale: dec.rationale,
      supporting_evidence: evidenceList,
      previous_content_backup: existingContent || undefined,
      proposed_diff: {
        section_name: sectionName,
        action,
        original_snippet: '<!-- Existing canonical content untouched -->',
        proposed_snippet: proposedMarkdownSnippet.trim(),
        unified_diff: unifiedDiff
      }
    });
  }

  return proposals;
}
export type { SynthesisProposal, ProposalState, ProvenanceMode };
