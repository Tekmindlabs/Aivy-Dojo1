// /tests/memory/unit/memory-cache.test.ts

import { MemoryCache } from '../../../lib/memory/cache/memory-cache';
import { mockConfig } from '../__mocks__/mock-config';
import { mockMemories } from '../__mocks__/mock-data';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache(mockConfig);
  });

  test('should set and get cached memory', async () => {
    const memory = mockMemories[0];
    await cache.setCachedMemory(memory.id, memory);
    const cached = await cache.getCachedMemory(memory.id);
    expect(cached).toEqual(memory);
  });

  test('should handle cache miss', async () => {
    const cached = await cache.getCachedMemory('nonexistent');
    expect(cached).toBeNull();
  });

  // Add more cache tests...
});