import type { CollectionEntry } from 'astro:content';

export type RelationshipType =
  | 'has_prerequisite'
  | 'prerequisite_of'
  | 'builds_on'
  | 'extended_by'
  | 'contrasts_with'
  | 'applies_to'
  | 'applied_in';

export type RelationshipConfidence = 'EXPLICIT' | 'DERIVED' | 'PROPOSED';

export interface ResolvedRelationship {
  sourceSlug: string;
  sourceTitle: string;
  targetSlug: string;
  targetTitle: string;
  type: RelationshipType;
  confidence: RelationshipConfidence;
  reason?: string;
  isReverse: boolean;
}

export interface TopicRelationshipBundle {
  prerequisites: ResolvedRelationship[];
  prerequisiteFor: ResolvedRelationship[];
  buildsOn: ResolvedRelationship[];
  extendedBy: ResolvedRelationship[];
  contrastsWith: ResolvedRelationship[];
  appliesTo: ResolvedRelationship[];
}

/**
 * Returns inverse relationship type for bidirectional resolution.
 */
export function getInverseRelationshipType(type: string): RelationshipType {
  switch (type) {
    case 'has_prerequisite':
      return 'prerequisite_of';
    case 'prerequisite_of':
      return 'has_prerequisite';
    case 'builds_on':
      return 'extended_by';
    case 'extended_by':
      return 'builds_on';
    case 'contrasts_with':
      return 'contrasts_with';
    case 'applies_to':
      return 'applied_in';
    default:
      return 'builds_on';
  }
}

/**
 * Validates relationships and resolves bidirectional connections at build time.
 */
export function resolveAllRelationships(
  allTopics: CollectionEntry<'topics'>[]
): {
  bundleMap: Map<string, TopicRelationshipBundle>;
  validationErrors: string[];
} {
  const topicMap = new Map<string, CollectionEntry<'topics'>>();
  const bundleMap = new Map<string, TopicRelationshipBundle>();
  const validationErrors: string[] = [];

  for (const t of allTopics) {
    topicMap.set(t.slug, t);
    bundleMap.set(t.slug, {
      prerequisites: [],
      prerequisiteFor: [],
      buildsOn: [],
      extendedBy: [],
      contrastsWith: [],
      appliesTo: []
    });
  }

  // 1. Process forward declared relationships
  for (const topic of allTopics) {
    const rawRels = topic.data.relationships || [];
    const seenTargets = new Set<string>();

    for (const rel of rawRels) {
      if (rel.target_slug === topic.slug) {
        validationErrors.push(`Self-reference error in ${topic.slug}: cannot connect to self.`);
        continue;
      }

      if (seenTargets.has(`${rel.target_slug}:${rel.type}`)) {
        validationErrors.push(`Duplicate relationship error in ${topic.slug}: multiple ${rel.type} to ${rel.target_slug}.`);
        continue;
      }
      seenTargets.add(`${rel.target_slug}:${rel.type}`);

      const targetTopic = topicMap.get(rel.target_slug);
      if (!targetTopic) {
        // Target does not exist in current corpus
        validationErrors.push(`Missing target slug in ${topic.slug}: target '${rel.target_slug}' does not exist.`);
        continue;
      }

      const forwardItem: ResolvedRelationship = {
        sourceSlug: topic.slug,
        sourceTitle: topic.data.title,
        targetSlug: targetTopic.slug,
        targetTitle: targetTopic.data.title,
        type: rel.type as RelationshipType,
        confidence: rel.confidence as RelationshipConfidence,
        reason: rel.reason,
        isReverse: false
      };

      const sourceBundle = bundleMap.get(topic.slug)!;
      if (rel.type === 'has_prerequisite') sourceBundle.prerequisites.push(forwardItem);
      else if (rel.type === 'prerequisite_of') sourceBundle.prerequisiteFor.push(forwardItem);
      else if (rel.type === 'builds_on') sourceBundle.buildsOn.push(forwardItem);
      else if (rel.type === 'extended_by') sourceBundle.extendedBy.push(forwardItem);
      else if (rel.type === 'contrasts_with') sourceBundle.contrastsWith.push(forwardItem);
      else if (rel.type === 'applies_to') sourceBundle.appliesTo.push(forwardItem);

      // 2. Generate reverse bidirectional link
      const invType = getInverseRelationshipType(rel.type);
      const reverseItem: ResolvedRelationship = {
        sourceSlug: targetTopic.slug,
        sourceTitle: targetTopic.data.title,
        targetSlug: topic.slug,
        targetTitle: topic.data.title,
        type: invType,
        confidence: rel.confidence as RelationshipConfidence,
        reason: rel.reason,
        isReverse: true
      };

      const targetBundle = bundleMap.get(targetTopic.slug)!;
      if (invType === 'prerequisite_of') targetBundle.prerequisiteFor.push(reverseItem);
      else if (invType === 'has_prerequisite') targetBundle.prerequisites.push(reverseItem);
      else if (invType === 'extended_by') targetBundle.extendedBy.push(reverseItem);
      else if (invType === 'builds_on') targetBundle.buildsOn.push(reverseItem);
      else if (invType === 'contrasts_with') targetBundle.contrastsWith.push(reverseItem);
      else if (invType === 'applied_in') targetBundle.appliesTo.push(reverseItem);
    }
  }

  // 3. Detect Circular Prerequisites (DAG validation)
  for (const topic of allTopics) {
    const visited = new Set<string>();
    const stack = new Set<string>();

    function checkCycle(currentSlug: string): boolean {
      visited.add(currentSlug);
      stack.add(currentSlug);

      const bundle = bundleMap.get(currentSlug);
      if (bundle) {
        for (const req of bundle.prerequisites) {
          if (!req.isReverse) {
            if (!visited.has(req.targetSlug) && checkCycle(req.targetSlug)) return true;
            if (stack.has(req.targetSlug)) return true;
          }
        }
      }

      stack.delete(currentSlug);
      return false;
    }

    if (checkCycle(topic.slug)) {
      validationErrors.push(`Circular prerequisite cycle detected originating from ${topic.slug}`);
    }
  }

  return { bundleMap, validationErrors };
}
