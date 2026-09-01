import { defineCollection, z } from 'astro:content';

const relationshipItemSchema = z.object({
  target_slug: z.string(),
  type: z.enum([
    'has_prerequisite',
    'prerequisite_of',
    'builds_on',
    'extended_by',
    'contrasts_with',
    'applies_to'
  ]),
  confidence: z.enum(['EXPLICIT', 'DERIVED', 'PROPOSED']).default('EXPLICIT'),
  reason: z.string().optional()
});

const relationshipsSchema = z.union([
  z.array(relationshipItemSchema),
  z.object({
    prerequisites: z.array(z.string()).nullish(),
    builds_on: z.array(z.string()).nullish(),
    contrasts_with: z.array(z.string()).nullish(),
    applies_to: z.array(z.string()).nullish()
  }).transform((obj) => {
    const list: Array<z.infer<typeof relationshipItemSchema>> = [];
    if (obj.prerequisites) {
      for (const t of obj.prerequisites) {
        if (t) list.push({ target_slug: t, type: 'has_prerequisite', confidence: 'EXPLICIT' });
      }
    }
    if (obj.builds_on) {
      for (const t of obj.builds_on) {
        if (t) list.push({ target_slug: t, type: 'builds_on', confidence: 'EXPLICIT' });
      }
    }
    if (obj.contrasts_with) {
      for (const t of obj.contrasts_with) {
        if (t) list.push({ target_slug: t, type: 'contrasts_with', confidence: 'EXPLICIT' });
      }
    }
    if (obj.applies_to) {
      for (const t of obj.applies_to) {
        if (t) list.push({ target_slug: t, type: 'applies_to', confidence: 'EXPLICIT' });
      }
    }
    return list;
  })
]).nullish().transform((val) => val ?? []);

const topicsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    id: z.string().optional(),
    legacy_id: z.string().optional(),
    title: z.string(),
    volume: z.number().int().min(1).max(10),
    volume_title: z.string(),
    order_in_volume: z.number().int().min(1),
    archetype: z.enum([
      'CANONICAL_CONCEPT',
      'MASTERCLASS_LECTURE',
      'DIALECTIC_ESSAY',
      'TACTICAL_FRAMEWORK'
    ]),
    reading_time_minutes: z.number().int().positive(),
    summary_15s: z.string().min(20),
    tags: z.array(z.string()).nullish().transform((val) => val ?? []),
    mental_models: z.array(z.string()).nullish().transform((val) => val ?? []),
    relationships: relationshipsSchema,
    sources: z.array(z.object({
      source_id: z.string(),
      title: z.string(),
      creator: z.string(),
      url: z.string().url(),
      evidence_type: z.enum([
        'EMPIRICAL_STUDY',
        'CLINICAL_TRIAL',
        'PRACTITIONER_EXPERIENCE',
        'PHILOSOPHICAL_ARGUMENT'
      ]).optional(),
      key_contributions: z.array(z.object({
        claim: z.string(),
        timestamp: z.string().optional()
      })).nullish().transform((val) => val ?? [])
    })).nullish().transform((val) => val ?? []),
    active_recall: z.array(z.object({
      question: z.string(),
      answer: z.string(),
      concept: z.string().optional()
    })).nullish().transform((val) => val ?? []),
    last_updated: z.string().optional()
  })
});

const mentalModelsCollection = defineCollection({
  type: 'content',
  schema: z.object({
    id: z.string().optional(),
    title: z.string(),
    category: z.string(),
    core_heuristic: z.string(),
    origin_discipline: z.string().optional(),
    primary_topic: z.string(),
    related_models: z.array(z.string()).nullish().transform((val) => val ?? [])
  })
});

export const collections = {
  topics: topicsCollection,
  'mental-models': mentalModelsCollection
};
