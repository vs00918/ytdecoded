import type { KnowledgeIR, IRClaim, IRConcept, IRMechanism, IRExampleOrAnalogy, SourceSpan } from './types.ts';
import { assessKnowledgeWorthiness, type WorthinessClass, type WorthinessAssessment } from './worthiness-gate.ts';

export interface KnowledgeUnit {
  unit_id: string;
  title: string;
  core_thesis: string;
  worthiness: WorthinessClass;
  worthiness_assessment: WorthinessAssessment;
  constituent_entity_ids: string[];
  claims: IRClaim[];
  mechanisms: IRMechanism[];
  examples: IRExampleOrAnalogy[];
  source_spans: SourceSpan[];
  time_range: { start: number; end: number };
}

export function clusterKnowledgeUnits(ir: KnowledgeIR): KnowledgeUnit[] {
  const units: KnowledgeUnit[] = [];

  // Group entities by temporal proximity (within ~90 seconds of audio) or thematic keyword overlap
  const allEntities: Array<{
    id: string;
    type: 'CLAIM' | 'CONCEPT' | 'MECHANISM' | 'ANALOGY';
    text: string;
    span: SourceSpan;
    raw: any;
  }> = [];

  for (const c of ir.claims) {
    if (c.source_spans[0]) {
      allEntities.push({ id: c.id, type: 'CLAIM', text: c.claim_text, span: c.source_spans[0], raw: c });
    }
  }
  for (const m of ir.mechanisms) {
    if (m.source_spans[0]) {
      allEntities.push({ id: m.id, type: 'MECHANISM', text: `${m.title}: ${m.trigger} -> ${m.outcome}`, span: m.source_spans[0], raw: m });
    }
  }
  for (const ex of ir.examples_and_analogies) {
    if (ex.source_spans[0]) {
      allEntities.push({ id: ex.id, type: 'ANALOGY', text: ex.content, span: ex.source_spans[0], raw: ex });
    }
  }

  // Sort entities by start time
  allEntities.sort((a, b) => a.span.start - b.span.start);

  let currentCluster: typeof allEntities = [];
  let clusterStart = 0;
  let clusterEnd = 0;
  let unitCounter = 1;

  function finalizeCluster(cluster: typeof allEntities) {
    if (cluster.length === 0) return;

    const claims = cluster.filter((e) => e.type === 'CLAIM').map((e) => e.raw as IRClaim);
    const mechanisms = cluster.filter((e) => e.type === 'MECHANISM').map((e) => e.raw as IRMechanism);
    const examples = cluster.filter((e) => e.type === 'ANALOGY').map((e) => e.raw as IRExampleOrAnalogy);

    const constituentIds = cluster.map((e) => e.id);
    const spans = cluster.map((e) => e.span);
    const start = Math.min(...spans.map((s) => s.start));
    const end = Math.max(...spans.map((s) => s.end));

    // Determine representative core thesis
    const primaryClaim = claims[0]?.claim_text || mechanisms[0]?.title || examples[0]?.content || cluster[0].text;
    const combinedText = cluster.map((e) => e.text).join(' ');

    // Assess overall worthiness of the clustered KnowledgeUnit
    const worthiness = assessKnowledgeWorthiness({
      id: `KU-${String(unitCounter).padStart(3, '0')}`,
      text: combinedText,
      type: mechanisms.length > 0 ? 'MECHANISM' : 'CLAIM'
    });

    units.push({
      unit_id: `KU-${String(unitCounter++).padStart(3, '0')}`,
      title: `Knowledge Unit [${Math.floor(start)}s-${Math.floor(end)}s]: ${primaryClaim.slice(0, 60)}...`,
      core_thesis: primaryClaim,
      worthiness: worthiness.classification,
      worthiness_assessment: worthiness,
      constituent_entity_ids: constituentIds,
      claims,
      mechanisms,
      examples,
      source_spans: spans,
      time_range: { start, end }
    });
  }

  for (const entity of allEntities) {
    if (currentCluster.length === 0) {
      currentCluster.push(entity);
      clusterStart = entity.span.start;
      clusterEnd = entity.span.end;
    } else {
      const timeGap = entity.span.start - clusterEnd;
      // Cluster entities within 60 seconds of audio or max 12 entities per unit
      if (timeGap <= 60 && currentCluster.length < 12) {
        currentCluster.push(entity);
        clusterEnd = Math.max(clusterEnd, entity.span.end);
      } else {
        finalizeCluster(currentCluster);
        currentCluster = [entity];
        clusterStart = entity.span.start;
        clusterEnd = entity.span.end;
      }
    }
  }

  if (currentCluster.length > 0) {
    finalizeCluster(currentCluster);
  }

  return units;
}
