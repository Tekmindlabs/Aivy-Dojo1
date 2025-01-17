import { MemoryService } from '../memory/memory-service';
import { MemoryTierType } from '../memory/memory-schemas';
import { MemoryEvolution } from '../memory/evolution/memory-evolution';
import { MemoryConsolidator } from '../memory/consolidation/memory-consolidator';
import { MemoryConfig } from '../../config/memory-config';

interface ExtendedMemoryService extends MemoryService {
  logError(error: Error): Promise<void>;
  verifyIntegrity(): Promise<void>;
  rebuildIndexes(): Promise<void>;
  getStaleMemories(
    maxAge: number,
    demotionThreshold: number,
    batchSize: number,
    offset: number
  ): Promise<Memory[]>;
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
  private memoryService: ExtendedMemoryService;
  private evolution: MemoryEvolution;
  private consolidator: MemoryConsolidator;
  private stats: MemoryStats;
  private config: MemoryConfig;
  private lastConsolidationTime: number;

  constructor(
    memoryService: ExtendedMemoryService,
    config: MemoryConfig = new MemoryConfig()
  ) {
    this.validateConfig(config);
    this.memoryService = memoryService;
    this.evolution = new MemoryEvolution(config);
    this.consolidator = new MemoryConsolidator(config);
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
      await this.retryWithBackoff(async () => {
        await this.updateStats();
        await this.checkConsolidationTriggers();
        await this.evolveMemories();
        await this.manageTiers();
        await this.cleanup();
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        await this.handleProcessingError(error);
      } else {
        await this.handleProcessingError(new Error(String(error)));
      }
    }
  }

  private async retryWithBackoff(operation: () => Promise<void>, retries = 3, delay = 1000): Promise<void> {
    try {
      await operation();
    } catch (error) {
      if (retries > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(operation, retries - 1, delay * 2);
      }
      throw error;
    }
  }

  private async handleProcessingError(error: Error): Promise<void> {
    console.error('Memory processing failed:', error);
    await this.memoryService.logError(error);
    await this.recoverFromError();
  }

  private async recoverFromError(): Promise<void> {
    try {
      await this.memoryService.verifyIntegrity();
      await this.memoryService.rebuildIndexes();
    } catch (error) {
      console.error('Error during recovery:', error);
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
    
    if (memory.tierType === 'background' && 
        currentImportance > this.config.getTierConfig('active').importanceThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && 
        currentImportance > this.config.getTierConfig('core').importanceThreshold) {
      return 'core';
    }
    if (memory.tierType === 'core' && 
        currentImportance < this.config.getTierConfig('core').importanceThreshold) {
      return 'active';
    }
    if (memory.tierType === 'active' && 
        currentImportance < this.config.getTierConfig('active').importanceThreshold) {
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
    const evolutionConfig = this.config.getEvolutionConfig();
    if (!evolutionConfig?.agingRate) {
      throw new Error('Invalid evolution configuration: missing agingRate');
    }
    const age = Date.now() - timestamp;
    return Math.exp(-age / evolutionConfig.agingRate);
  }
  
  private calculateAccessFrequencyScore(accessCount: number): number {
    const consolidationConfig = this.config.getConsolidationConfig();
    if (!consolidationConfig?.maxAccessCount) {
      throw new Error('Invalid consolidation configuration: missing maxAccessCount');
    }
    return Math.min(accessCount / consolidationConfig.maxAccessCount, 1);
  }

  private validateConfig(config: MemoryConfig): void {
    const requiredMethods: (keyof MemoryConfig)[] = [
      'getCacheConfig',
      'getIndexConfig',
      'getValidationConfig',
      'getEvolutionConfig',
      'getConsolidationConfig',
      'getTierConfig'
    ];

    for (const method of requiredMethods) {
      if (typeof config[method] !== 'function') {
        throw new Error(`Invalid config: missing required method ${method}`);
      }
    }
  }

  private async evaluateConsolidationNeed(): Promise<boolean> {
    const consolidationConfig = this.config.getConsolidationConfig();
    return (
      this.stats.totalMemories > consolidationConfig.memoryThreshold ||
      this.getTimeSinceLastConsolidation() > consolidationConfig.timeThreshold
    );
  }

  private async cleanup(): Promise<void> {
    const evolutionConfig = this.config.getEvolutionConfig();
    
    await this.cleanupBackgroundMemories(evolutionConfig.maxAge);
    await this.cleanupStaleMemories();
    await this.optimizeStorage();
  }

  private async cleanupBackgroundMemories(maxAge: number): Promise<void> {
    const oldMemories = await this.memoryService.getOldMemories(
      'background',
      maxAge
    );
    
    for (const memory of oldMemories) {
      if (memory.importance < this.config.getEvolutionConfig().demotionThreshold) {
        await this.memoryService.delete(memory.id);
        this.stats.totalMemories--;
        this.stats.tierDistribution.background--;
      }
    }
  }

  private async cleanupStaleMemories(): Promise<void> {
    const batchSize = 100;
    let processed = 0;
    
    while (true) {
      const batch = await this.getStaleMemoryBatch(batchSize, processed);
      if (batch.length === 0) break;
      
      await this.processStaleBatch(batch);
      processed += batch.length;
    }
  }

  private async getStaleMemoryBatch(batchSize: number, offset: number): Promise<Memory[]> {
    const evolutionConfig = this.config.getEvolutionConfig();
    return this.memoryService.getStaleMemories(
      evolutionConfig.maxAge,
      evolutionConfig.demotionThreshold,
      batchSize,
      offset
    );
  }

  private async processStaleBatch(batch: Memory[]): Promise<void> {
    for (const memory of batch) {
      await this.memoryService.delete(memory.id);
      this.stats.totalMemories--;
      this.stats.tierDistribution[memory.tierType]--;
    }
  }

  private async optimizeStorage(): Promise<void> {
    const generalConfig = this.config.getConfig().general;
    
    if (this.stats.totalMemories > generalConfig.maxTotalMemories) {
      const memories = await this.memoryService.getMemories();
      memories.sort((a, b) => a.importance - b.importance);
      
      const memoriesToRemove = memories.slice(0, 
        this.stats.totalMemories - generalConfig.maxTotalMemories);
      
      for (const memory of memoriesToRemove) {
        await this.memoryService.delete(memory.id);
        this.stats.totalMemories--;
        this.stats.tierDistribution[memory.tierType]--;
      }
    }
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
