import { test, describe } from 'node:test';
import assert from 'node:assert';
import { getSortedTopics, getVolumeGroups, resolveTopicNavigation } from '../src/utils/navigation.ts';

// Mock sample collection entries
const mockTopics = [
  {
    id: 'ch-01',
    slug: 'the-second-brain-and-the-gut-mind-axis',
    data: {
      title: 'The Second Brain — The Gut-Mind Axis',
      volume: 1,
      volume_title: 'The Biology of Mind & Energy',
      order_in_volume: 1
    }
  },
  {
    id: 'ch-18',
    slug: 'the-pathology-of-comfort-and-progressive-friction',
    data: {
      title: 'The Pathology of Comfort — Homeostasis',
      volume: 4,
      volume_title: 'High-Velocity Execution & Asymmetric Leverage',
      order_in_volume: 18
    }
  },
  {
    id: 'ch-32',
    slug: 'the-architecture-of-high-impact-pedagogy',
    data: {
      title: 'The Architecture of High-Impact Pedagogy',
      volume: 5,
      volume_title: 'The Architecture of Social Sovereignty',
      order_in_volume: 32
    }
  }
];

describe('Phase 3: Sequential Reading & Navigation Logic', () => {
  test('getSortedTopics sorts strictly by Volume then by order_in_volume', () => {
    const sorted = getSortedTopics(mockTopics);
    assert.strictEqual(sorted[0].data.volume, 1);
    assert.strictEqual(sorted[1].data.volume, 4);
    assert.strictEqual(sorted[2].data.volume, 5);
  });

  test('getVolumeGroups correctly groups topics into distinct volumes', () => {
    const groups = getVolumeGroups(mockTopics);
    assert.strictEqual(groups.length, 3);
    assert.strictEqual(groups[0].volume, 1);
    assert.strictEqual(groups[0].topics.length, 1);
    assert.strictEqual(groups[1].volume, 4);
    assert.strictEqual(groups[2].volume, 5);
  });

  test('resolveTopicNavigation handles first topic boundary (prev === null)', () => {
    const nav = resolveTopicNavigation('the-second-brain-and-the-gut-mind-axis', mockTopics);
    assert.strictEqual(nav.prev, null);
    assert.strictEqual(nav.next?.slug, 'the-pathology-of-comfort-and-progressive-friction');
  });

  test('resolveTopicNavigation handles middle topic across volume boundaries', () => {
    const nav = resolveTopicNavigation('the-pathology-of-comfort-and-progressive-friction', mockTopics);
    assert.strictEqual(nav.prev?.slug, 'the-second-brain-and-the-gut-mind-axis');
    assert.strictEqual(nav.next?.slug, 'the-architecture-of-high-impact-pedagogy');
  });

  test('resolveTopicNavigation handles last topic boundary (next === null)', () => {
    const nav = resolveTopicNavigation('the-architecture-of-high-impact-pedagogy', mockTopics);
    assert.strictEqual(nav.prev?.slug, 'the-pathology-of-comfort-and-progressive-friction');
    assert.strictEqual(nav.next, null);
  });
});
