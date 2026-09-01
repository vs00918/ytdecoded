import type { CollectionEntry } from 'astro:content';

export interface TopicNavInfo {
  prev: CollectionEntry<'topics'> | null;
  next: CollectionEntry<'topics'> | null;
  currentVolumeTopics: CollectionEntry<'topics'>[];
  allVolumes: {
    volume: number;
    volumeTitle: string;
    topics: CollectionEntry<'topics'>[];
  }[];
}

/**
 * Sorts all topics strictly by volume ascending, then by order_in_volume ascending.
 */
export function getSortedTopics(topics: CollectionEntry<'topics'>[]): CollectionEntry<'topics'>[] {
  return [...topics].sort((a, b) => {
    if (a.data.volume !== b.data.volume) {
      return a.data.volume - b.data.volume;
    }
    return a.data.order_in_volume - b.data.order_in_volume;
  });
}

/**
 * Groups topics by volume in sorted order.
 */
export function getVolumeGroups(topics: CollectionEntry<'topics'>[]) {
  const sorted = getSortedTopics(topics);
  const volumeMap = new Map<number, { volume: number; volumeTitle: string; topics: CollectionEntry<'topics'>[] }>();

  for (const topic of sorted) {
    if (!volumeMap.has(topic.data.volume)) {
      volumeMap.set(topic.data.volume, {
        volume: topic.data.volume,
        volumeTitle: topic.data.volume_title,
        topics: []
      });
    }
    volumeMap.get(topic.data.volume)!.topics.push(topic);
  }

  return Array.from(volumeMap.values()).sort((a, b) => a.volume - b.volume);
}

/**
 * Resolves previous and next sequential topics for a given topic slug.
 */
export function resolveTopicNavigation(
  currentSlug: string,
  topics: CollectionEntry<'topics'>[]
): TopicNavInfo {
  const sorted = getSortedTopics(topics);
  const currentIndex = sorted.findIndex((t) => t.slug === currentSlug);

  const prev = currentIndex > 0 ? sorted[currentIndex - 1] : null;
  const next = currentIndex >= 0 && currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;

  const currentTopic = sorted[currentIndex];
  const currentVolume = currentTopic ? currentTopic.data.volume : 1;
  const currentVolumeTopics = sorted.filter((t) => t.data.volume === currentVolume);
  const allVolumes = getVolumeGroups(sorted);

  return {
    prev,
    next,
    currentVolumeTopics,
    allVolumes
  };
}
