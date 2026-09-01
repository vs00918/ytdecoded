import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SynthesisProposal } from './synthesis-candidate.ts';
import type { VideoRoutingResult } from './topic-router.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const codexRoot = path.join(__dirname, '..', '..');
const ledgerPath = path.join(codexRoot, 'data', 'proposals-ledger.json');

export function saveProposalsToLedger(
  video_id: string,
  outDir: string,
  routingResult: VideoRoutingResult,
  proposals: SynthesisProposal[]
): string {
  const propDir = path.join(outDir, 'proposals');
  if (!fs.existsSync(propDir)) fs.mkdirSync(propDir, { recursive: true });

  // Save individual proposal JSON files
  for (const prop of proposals) {
    const file = path.join(propDir, `${prop.proposal_id}.json`);
    fs.writeFileSync(file, JSON.stringify(prop, null, 2), 'utf8');
  }

  // Update Global Ledger
  let globalLedger: SynthesisProposal[] = [];
  if (fs.existsSync(ledgerPath)) {
    try {
      globalLedger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    } catch {
      globalLedger = [];
    }
  }

  // Deduplicate and append
  const existingIds = new Set(globalLedger.map((p) => p.proposal_id));
  for (const p of proposals) {
    if (!existingIds.has(p.proposal_id)) {
      globalLedger.push(p);
    }
  }

  if (!fs.existsSync(path.dirname(ledgerPath))) {
    fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  }
  fs.writeFileSync(ledgerPath, JSON.stringify(globalLedger, null, 2), 'utf8');

  // Generate Review Markdown Diff Document
  let md = `# Synthesis Proposal & Review Diff: ${routingResult.video_title}

**Video ID:** \`${video_id}\`  
**Generated At:** \`${new Date().toISOString()}\`  
**Raw Entities Evaluated:** ${routingResult.total_raw_entities}  
**Clustered Knowledge Units:** ${routingResult.total_knowledge_units}  
**High-Value Proposals Generated:** ${proposals.length}  
**Review Status:** \`AWAITING_HUMAN_APPROVAL\`

---

## 1. Routing & Worthiness Summary

* **Filtered Non-Canonical (Biography/Intro/Noise):** ${routingResult.summary.filtered_non_canonical} units
* **Already Covered (Skipped Duplicate Prose):** ${routingResult.summary.already_covered} units
* **Enrichment Targets:** ${Object.keys(routingResult.summary.enrichtargets).length} canonical chapters
* **Contradictions & Refutations:** ${routingResult.summary.contradictions} units
* **Qualifications & Boundary Conditions:** ${routingResult.summary.qualifications} units
* **Examples & Case Analogies:** ${routingResult.summary.examples} units
* **New Topic Candidates:** ${routingResult.summary.new_topics} units
* **Quarantined (Low Depth / Ambiguous):** ${routingResult.summary.quarantined} units

---

## 2. Reviewable Synthesis Diff Proposals
`;

  if (proposals.length === 0) {
    md += `\n*No synthesis proposals generated (all extracted knowledge is filtered as context, already covered, or quarantined).*\n`;
  } else {
    for (const p of proposals) {
      md += `
### [${p.proposal_id}] ${p.routing_decision} $\\to$ \`${p.target_topic_slug || 'NEW_TOPIC'}\`

* **Target Topic:** ${p.target_topic_title || 'New Topic Stub'}
* **Routing Decision:** \`${p.routing_decision}\`
* **Confidence Level:** \`${p.confidence}\` (${(p.confidence_score * 100).toFixed(1)}%)
* **Routing Rationale:** ${p.rationale}
* **State Machine:** \`DRAFT\` $\\to$ \`VALIDATED\` $\\to$ **\`${p.state}\`** $\\to$ \`HUMAN_REVIEW\` $\\to$ \`APPROVED\`

#### Supporting Provenance Evidence:
${p.supporting_evidence.map((e) => `- **\`${e.entity_id}\`** [${Math.floor(e.start)}s-${Math.floor(e.end)}s]: "${e.quoted_text}"`).join('\n')}

#### Proposed Semantic Diff (Non-Destructive Minimal Delta):
\`\`\`diff
${p.proposed_diff.unified_diff}
\`\`\`

---
`;
    }
  }

  const reviewMdPath = path.join(outDir, 'synthesis-review-diff.md');
  fs.writeFileSync(reviewMdPath, md, 'utf8');

  return reviewMdPath;
}
