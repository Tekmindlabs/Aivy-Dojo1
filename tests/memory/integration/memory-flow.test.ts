// /tests/memory/integration/memory-flow.test.ts

import { MemoryService } from '../../../lib/memory/memory-service';
import { MemoryCache } from '../../../lib/memory/cache/memory-cache';
import { MemoryConsolidator } from '../../../lib/memory/consolidation/memory-consolidator';
import { MemoryEvolution } from '../../../lib/memory/evolution/memory-evolution';

describe('Memory Flow Integration', () => {
  let memoryService: MemoryService;
  let cache: MemoryCache;
  let consolidator: MemoryConsolidator;
  let evolution: MemoryEvolution;

  beforeEach(() => {
    cache = new MemoryCache(mockConfig);
    consolidator = new MemoryConsolidator(mockConfig);
    evolution = new MemoryEvolution(mockConfig);
    memoryService = new MemoryService(cache, consolidator, evolution);
  });

  test('should handle complete memory lifecycle', async () => {
    // Create memory
    const memory = await memoryService.createMemory('Test content');
    
    // Access and evolve
    await memoryService.accessMemory(memory.id);
    
    // Verify evolution
    const evolved = await memoryService.getMemory(memory.id);
    expect(evolved.accessCount).toBe(1);
    
    // Test consolidation
    const similar = await memoryService.createMemory('Similar test content');
    await memoryService.consolidateMemories([memory.id, similar.id]);
    
    // Verify results
    const consolidated = await memoryService.getMemory(memory.id);
    expect(consolidated.importance).toBeGreaterThan(memory.importance);
  });
});