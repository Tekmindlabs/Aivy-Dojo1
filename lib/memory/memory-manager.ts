import { MemoryService } from '../memory/memory-service';
import { MemoryTierType } from '../memory/memory-schemas';
import { MemoryEvolution } from '../memory/evolution/memory-evolution';
import { MemoryConsolidator } from '../memory/consolidation/memory-consolidator';
import { MEMORY_CONFIG } from '../../config/memory-config';

interface MemoryConfig {
  tiers: {
    activeThreshold: number;
    coreThreshold: number;
  };
  recencyDecayRate: number;
  maxAccessCount: number;
  consolidation: {
    memoryThreshold: number;
    timeThreshold: number;
  };
  cleanup: {
    maxAge: number;
    importanceThreshold: number;
  };
}

interface MemoryStats {
  totalMemories: number;
  tierDistribution: Record<MemoryTierType, number>;
  averageImportance: number;
  consolidationCount: number;
}

interface Memory {
  id: string;
  content: string;
  embedding: number[];
  tierType: MemoryTierType;
  importance: number;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  metadata: {
    emotional_value?: number;
    context_relevance?: number;
    source?: string;
  };
}

export class MemoryManager {
  private memoryService: MemoryService;
  private evolution: MemoryEvolution;
  private consolidator: MemoryConsolidator;
  private stats: MemoryStats;
  private config: MemoryConfig;
  private lastConsolidationTime: number;

  constructor(
    memoryService: MemoryService,
    config: MemoryConfig = MEMORY_CONFIG as MemoryConfig
  ) {
    this.memoryService = memoryService;
    this.evolution = new MemoryEvolution();
    this.consolidator = new MemoryConsolidator();
    this.config = config;
    this.lastConsolidationTime = Date.now();
    this.stats = {
      totalMemories: 0,
      tierDistribution: {
        core: 0,
        active: 0,
        background: 0
      },
      averageImportance: 0,
      consolidationCount: 0
    };
  }

  async processMemories(): Promise<void> {
    try {
      await this.updateStats();
      await this.checkConsolidationTriggers();
      await this.evolveMemories();
      await this.manageTiers();
      await this.cleanup();
    } catch (error) {
      console.error('Error in memory processing:', error);
      throw error;
    }
  }

  async manageTiers(): Promise<void> {
    const tiers: MemoryTierType[] = ['core', 'active', 'background'];
    
    for (const tier of tiers) {
      const memories = await this.memoryService.getMemoriesByTier(tier);
      
      for (const memory of memories) {
        const newTier = await this.evaluateTierTransition(memory);
        if (newTier !== memory.tierType) {
          await this.transitionTier(memory, newTier);
        }
      }
    }
  }

  private async evolveMemories(): Promise<void> {
    const memories = await this.memoryService.getMemories();
    
    for (const memory of memories) {
      const evolved = await this.evolution.evolveMemory(memory);
      if (evolved !== memory) {
        await this.memoryService.update(evolved);
      }
    }
  }

  private async checkConsolidationTriggers(): Promise<void> {
    const shouldConsolidate = await this.evaluateConsolidationNeed();
    
    if (shouldConsolidate) {
      const memories = await this.memoryService.getMemories();
      await this.consolidator.consolidateMemories(memories);
      this.lastConsolidationTime = Date.now();
      this.stats.consolidationCount++;
    }
  }

  private async evaluateTierTransition(memory: Memory): Promise<MemoryTierType> {
    const currentImportance = await this.calculateCurrentImportance(memory);
    
    if (memory.tierType === 'background' && currentImportance > this.config.tiers.activeThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && currentImportance > this.config.tiers.coreThreshold) {
      return 'core';
    }
    if (memory.tierType === 'core' && currentImportance < this.config.tiers.coreThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && currentImportance < this.config.tiers.activeThreshold) {
      return 'background';
    }
    
    return memory.tierType;
  }

  private async transitionTier(memory: Memory, newTier: MemoryTierType): Promise<void> {
    try {
      await this.memoryService.transitionMemoryTier(memory, newTier);
      this.stats.tierDistribution[memory.tierType]--;
      this.stats.tierDistribution[newTier]++;
      
      console.log(`Memory ${memory.id} transitioned from ${memory.tierType} to ${newTier}`);
    } catch (error) {
      console.error(`Error transitioning memory ${memory.id}:`, error);
      throw error;
    }
  }

  private async calculateCurrentImportance(memory: Memory): Promise<number> {
    const factors = {
      baseImportance: memory.importance,
      recency: this.calculateRecencyScore(memory.timestamp),
      accessFrequency: this.calculateAccessFrequencyScore(memory.accessCount),
      relevance: memory.metadata.context_relevance || 0
    };

    return (
      factors.baseImportance * 0.4 +
      factors.recency * 0.3 +
      factors.accessFrequency * 0.2 +
      factors.relevance * 0.1
    );
  }

  private calculateRecencyScore(timestamp: number): number {
    const age = Date.now() - timestamp;
    return Math.exp(-age / this.config.recencyDecayRate);
  }

  private calculateAccessFrequencyScore(accessCount: number): number {
    return Math.min(accessCount / this.config.maxAccessCount, 1);
  }

  private async evaluateConsolidationNeed(): Promise<boolean> {
    return (
      this.stats.totalMemories > this.config.consolidation.memoryThreshold ||
      this.getTimeSinceLastConsolidation() > this.config.consolidation.timeThreshold
    );
  }

  private async cleanup(): Promise<void> {
    await this.cleanupBackgroundMemories();
    await this.cleanupStaleMemories();
    await this.optimizeStorage();
  }

  private async cleanupBackgroundMemories(): Promise<void> {
    const oldMemories = await this.memoryService.getOldMemories(
      'background',
      this.config.cleanup.maxAge
    );
    
    for (const memory of oldMemories) {
      if (memory.importance < this.config.cleanup.importanceThreshold) {
        await this.memoryService.delete(memory.id);
        this.stats.totalMemories--;
        this.stats.tierDistribution.background--;
      }
    }
  }

  private async cleanupStaleMemories(): Promise<void> {
    // Implementation for stale memory cleanup
  }

  private async optimizeStorage(): Promise<void> {
    // Implementation for storage optimization
  }

  private async updateStats(): Promise<void> {
    const memories = await this.memoryService.getMemories();
    this.stats.totalMemories = memories.length;
    
    this.stats.tierDistribution = {
      core: 0,
      active: 0,
      background: 0
    };

    let totalImportance = 0;
    for (const memory of memories) {
      this.stats.tierDistribution[memory.tierType]++;
      totalImportance += memory.importance;
    }

    this.stats.averageImportance = totalImportance / memories.length;
  }

  private getTimeSinceLastConsolidation(): number {
    return Date.now() - this.lastConsolidationTime;
  }

  public async getStats(): Promise<MemoryStats> {
    return this.stats;
  }

  public async forceConsolidation(): Promise<void> {
    const memories = await this.memoryService.getMemories();
    await this.consolidator.consolidateMemories(memories);
    this.lastConsolidationTime = Date.now();
    this.stats.consolidationCount++;
  }
}