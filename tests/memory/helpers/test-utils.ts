// /tests/memory/helpers/test-utils.ts

import { MemoryTierType } from '../../../lib/memory/memory-schemas';

export class TestUtils {
  static async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static generateMockMemory(overrides = {}) {
    return {
      id: crypto.randomUUID(),
      content: 'Test memory',
      embedding: new Array(384).fill(0.1),
      timestamp: Date.now(),
      tierType: 'active' as MemoryTierType,
      importance: 0.5,
      lastAccessed: Date.now(),
      accessCount: 0,
      metadata: {},
      ...overrides
    };
  }

  static async measurePerformance(fn: () => Promise<any>): Promise<{
    duration: number;
    memoryUsage: number;
  }> {
    const startMemory = process.memoryUsage().heapUsed;
    const startTime = Date.now();
    
    await fn();
    
    return {
      duration: Date.now() - startTime,
      memoryUsage: process.memoryUsage().heapUsed - startMemory
    };
  }
}