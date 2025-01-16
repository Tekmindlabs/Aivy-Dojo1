// memory-manager.ts

import { MemoryService } from './memory-service';
import { MemoryTierType } from './memory-schemas';
import { MemoryEvolution } from './evolution/memory-evolution';
import { MemoryConsolidator } from './consolidation/memory-consolidator';
import { MEMORY_CONFIG } from '../../config/memory-config';

interface MemoryStats {
  totalMemories: number;
  tierDistribution: Record<MemoryTierType, number>;
  averageImportance: number;
  consolidationCount: number;
}

export class MemoryManager {
  private memoryService: MemoryService;
  private evolution: MemoryEvolution;
  private consolidator: MemoryConsolidator;
  private stats: MemoryStats;
  private config: typeof MEMORY_CONFIG;

  constructor(
    memoryService: MemoryService,
    config = MEMORY_CONFIG
  ) {
    this.memoryService = memoryService;
    this.evolution = new MemoryEvolution();
    this.consolidator = new MemoryConsolidator();
    this.config = config;
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

  // Main processing loop
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

  // Tier-aware processing
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

  // Memory evolution handling
  private async evolveMemories(): Promise<void> {
    const memories = await this.memoryService.getAllMemories();
    
    for (const memory of memories) {
      const evolved = await this.evolution.evolveMemory(memory);
      if (evolved !== memory) {
        await this.memoryService.updateMemory(evolved);
      }
    }
  }

  // Consolidation management
  private async checkConsolidationTriggers(): Promise<void> {
    const shouldConsolidate = await this.evaluateConsolidationNeed();
    
    if (shouldConsolidate) {
      await this.consolidator.consolidateMemories();
      this.stats.consolidationCount++;
    }
  }

  // Tier transition logic
  private async evaluateTierTransition(memory: any): Promise<MemoryTierType> {
    const currentImportance = await this.calculateCurrentImportance(memory);
    
    // Promotion rules
    if (memory.tierType === 'background' && currentImportance > this.config.tiers.activeThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && currentImportance > this.config.tiers.coreThreshold) {
      return 'core';
    }
    
    // Demotion rules
    if (memory.tierType === 'core' && currentImportance < this.config.tiers.coreThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && currentImportance < this.config.tiers.activeThreshold) {
      return 'background';
    }
    
    return memory.tierType;
  }

  // Tier transition implementation
  private async transitionTier(memory: any, newTier: MemoryTierType): Promise<void> {
    try {
      await this.memoryService.transitionTier(memory, newTier);
      this.stats.tierDistribution[memory.tierType]--;
      this.stats.tierDistribution[newTier]++;
      
      // Log transition for monitoring
      console.log(`Memory ${memory.id} transitioned from ${memory.tierType} to ${newTier}`);
    } catch (error) {
      console.error(`Error transitioning memory ${memory.id}:`, error);
      throw error;
    }
  }

  // Cleanup routines
  private async cleanup(): Promise<void> {
    await this.cleanupBackgroundMemories();
    await this.cleanupStaleMemories();
    await this.optimizeStorage();
  }

  // Helper methods
  private async calculateCurrentImportance(memory: any): Promise<number> {
    const factors = {
      baseImportance: memory.importance,
      recency: this.calculateRecencyScore(memory.timestamp),
      accessFrequency: this.calculateAccessFrequencyScore(memory.accessCount),
      relevance: memory.metadata.contextRelevance || 0
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

  private async cleanupBackgroundMemories(): Promise<void> {
    const oldMemories = await this.memoryService.getOldBackgroundMemories(
      this.config.cleanup.maxAge
    );
    
    for (const memory of oldMemories) {
      if (memory.importance < this.config.cleanup.importanceThreshold) {
        await this.memoryService.deleteMemory(memory.id);
        this.stats.totalMemories--;
        this.stats.tierDistribution.background--;
      }
    }
  }

  private async cleanupStaleMemories(): Promise<void> {
    // Implement stale memory cleanup logic
  }

  private async optimizeStorage(): Promise<void> {
    // Implement storage optimization logic
  }

  private async updateStats(): Promise<void> {
    // Update memory statistics
    const memories = await this.memoryService.getAllMemories();
    this.stats.totalMemories = memories.length;
    
    // Reset tier distribution
    this.stats.tierDistribution = {
      core: 0,
      active: 0,
      background: 0
    };

    // Calculate new distribution and average importance
    let totalImportance = 0;
    for (const memory of memories) {
      this.stats.tierDistribution[memory.tierType]++;
      totalImportance += memory.importance;
    }

    this.stats.averageImportance = totalImportance / memories.length;
  }

  private getTimeSinceLastConsolidation(): number {
    // Implementation to track time since last consolidation
    return Date.now() - (this.lastConsolidationTime || 0);
  }

  // Public methods for external interaction
  public async getStats(): Promise<MemoryStats> {
    return this.stats;
  }

  public async forceConsolidation(): Promise<void> {
    await this.consolidator.consolidateMemories();
    this.stats.consolidationCount++;
  }
}