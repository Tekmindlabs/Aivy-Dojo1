// /tests/memory/performance/memory-performance.test.ts

import { TestUtils } from '../helpers/test-utils';
import { MemoryService } from '../../../lib/memory/memory-service';

describe('Memory Performance Tests', () => {
  let memoryService: MemoryService;

  beforeEach(() => {
    memoryService = new MemoryService(
      new MemoryCache(mockConfig),
      new MemoryConsolidator(mockConfig),
      new MemoryEvolution(mockConfig)
    );
  });

  test('should handle bulk memory operations efficiently', async () => {
    const memories = Array(1000).fill(null).map(() => 
      TestUtils.generateMockMemory()
    );

    const performance = await TestUtils.measurePerformance(async () => {
      for (const memory of memories) {
        await memoryService.createMemory(memory.content);
      }
    });

    expect(performance.duration).toBeLessThan(5000); // 5 seconds max
    expect(performance.memoryUsage).toBeLessThan(50 * 1024 * 1024); // 50MB max
  });

  test('should perform consolidation within time limits', async () => {
    const memories = testScenarios.consolidation.similarMemories;
    
    const performance = await TestUtils.measurePerformance(async () => {
      await memoryService.consolidateMemories(
        memories.map(m => m.id)
      );
    });

    expect(performance.duration).toBeLessThan(1000); // 1 second max
  });
});