import { test, describe } from 'node:test';
import assert from 'node:assert';
import { resolveAllRelationships, getInverseRelationshipType } from '../src/utils/relationships.ts';

// Mock topic collection with intentional valid and invalid relations
const mockCorpus = [
  {
    slug: 'topic-a',
    data: {
      title: 'Topic A (Biological Foundations)',
      volume: 1,
      order_in_volume: 1,
      relationships: [
        { target_slug: 'topic-b', type: 'builds_on', confidence: 'EXPLICIT', reason: 'Expands core model' },
        { target_slug: 'topic-c', type: 'contrasts_with', confidence: 'EXPLICIT' }
      ]
    }
  },
  {
    slug: 'topic-b',
    data: {
      title: 'Topic B (Daily Systems)',
      volume: 2,
      order_in_volume: 1,
      relationships: [
        { target_slug: 'topic-c', type: 'has_prerequisite', confidence: 'EXPLICIT' }
      ]
    }
  },
  {
    slug: 'topic-c',
    data: {
      title: 'Topic C (Metacognition)',
      volume: 3,
      order_in_volume: 1,
      relationships: []
    }
  }
];

describe('Phase 5: Knowledge Model & Relationship Resolution', () => {
  test('Inverse relationship mapping is correct', () => {
    assert.strictEqual(getInverseRelationshipType('has_prerequisite'), 'prerequisite_of');
    assert.strictEqual(getInverseRelationshipType('prerequisite_of'), 'has_prerequisite');
    assert.strictEqual(getInverseRelationshipType('builds_on'), 'extended_by');
    assert.strictEqual(getInverseRelationshipType('extended_by'), 'builds_on');
    assert.strictEqual(getInverseRelationshipType('contrasts_with'), 'contrasts_with');
    assert.strictEqual(getInverseRelationshipType('applies_to'), 'applied_in');
  });

  test('Bidirectional resolution resolves forward and reverse links accurately', () => {
    const { bundleMap, validationErrors } = resolveAllRelationships(mockCorpus);
    assert.strictEqual(validationErrors.length, 0);

    // Topic A builds_on Topic B -> Topic B must receive extended_by Topic A (reverse)
    const bundleA = bundleMap.get('topic-a');
    assert.strictEqual(bundleA.buildsOn.length, 1);
    assert.strictEqual(bundleA.buildsOn[0].targetSlug, 'topic-b');
    assert.strictEqual(bundleA.buildsOn[0].isReverse, false);

    const bundleB = bundleMap.get('topic-b');
    assert.strictEqual(bundleB.extendedBy.length, 1);
    assert.strictEqual(bundleB.extendedBy[0].targetSlug, 'topic-a');
    assert.strictEqual(bundleB.extendedBy[0].isReverse, true);

    // Topic B has_prerequisite Topic C -> Topic C must receive prerequisite_for Topic B (reverse)
    const bundleC = bundleMap.get('topic-c');
    assert.strictEqual(bundleC.prerequisiteFor.length, 1);
    assert.strictEqual(bundleC.prerequisiteFor[0].targetSlug, 'topic-b');

    // Topic A contrasts_with Topic C -> Topic C must receive contrasts_with Topic A
    assert.strictEqual(bundleC.contrastsWith.length, 1);
    assert.strictEqual(bundleC.contrastsWith[0].targetSlug, 'topic-a');
  });

  test('Detects missing target slug error', () => {
    const badCorpus = [
      {
        slug: 'topic-x',
        data: {
          title: 'Topic X',
          volume: 1,
          order_in_volume: 1,
          relationships: [{ target_slug: 'non-existent-topic', type: 'builds_on', confidence: 'EXPLICIT' }]
        }
      }
    ];

    const { validationErrors } = resolveAllRelationships(badCorpus);
    assert.strictEqual(validationErrors.length, 1);
    assert.strictEqual(validationErrors[0].includes('Missing target slug'), true);
  });

  test('Detects self-reference error', () => {
    const selfCorpus = [
      {
        slug: 'topic-y',
        data: {
          title: 'Topic Y',
          volume: 1,
          order_in_volume: 1,
          relationships: [{ target_slug: 'topic-y', type: 'contrasts_with', confidence: 'EXPLICIT' }]
        }
      }
    ];

    const { validationErrors } = resolveAllRelationships(selfCorpus);
    assert.strictEqual(validationErrors.length, 1);
    assert.strictEqual(validationErrors[0].includes('Self-reference error'), true);
  });

  test('Detects circular prerequisite cycles', () => {
    const cyclicCorpus = [
      {
        slug: 'node-1',
        data: {
          title: 'Node 1',
          volume: 1,
          order_in_volume: 1,
          relationships: [{ target_slug: 'node-2', type: 'has_prerequisite', confidence: 'EXPLICIT' }]
        }
      },
      {
        slug: 'node-2',
        data: {
          title: 'Node 2',
          volume: 1,
          order_in_volume: 2,
          relationships: [{ target_slug: 'node-1', type: 'has_prerequisite', confidence: 'EXPLICIT' }]
        }
      }
    ];

    const { validationErrors } = resolveAllRelationships(cyclicCorpus);
    assert.strictEqual(validationErrors.some(e => e.includes('Circular prerequisite cycle')), true);
  });
});
