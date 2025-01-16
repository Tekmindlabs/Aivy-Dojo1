// memory-evolution.ts

import { MemoryTierType } from '../memory-schemas';
import { MEMORY_CONFIG } from '../../../config/memory-config';

interface EvolutionStats {
  totalEvolutions: number;
  averageAgingRate: number;
  reinforcementCount: number;
  archivedCount: number;
  performanceMetrics: {
    processingTime: number;
    successRate: number;
    lastEvolution: number;
  };
  tierTransitions: {
    promotions: number;
    demotions: number;
  };
}

interface EvolutionResult {
  evolved: boolean;
  changes: {
    importance: number;
    tierType?: MemoryTierType;
    metadata: any;
  };
  metrics: {
    agingFactor: number;
    reinforcementScore: number;
    archivalProbability: number;
  };
}

export class MemoryEvolution {
  private stats: EvolutionStats;
  private config: typeof MEMORY_CONFIG;

  constructor(config = MEMORY_CONFIG) {
    this.config = config;
    this.stats = this.initializeStats();
  }

  private initializeStats(): EvolutionStats {
    return {
      totalEvolutions: 0,
      averageAgingRate: 0,
      reinforcementCount: 0,
      archivedCount: 0,
      performanceMetrics: {
        processingTime: 0,
        successRate: 1,
        lastEvolution: Date.now()
      },
      tierTransitions: {
        promotions: 0,
        demotions: 0
      }
    };
  }

  // Main evolution methods
  async evolveMemory(memory: any): Promise<any> {
    const startTime = Date.now();
    try {
      // Apply aging process
      const agingResult = await this.applyAging(memory);
      
      // Apply reinforcement
      const reinforcementResult = await this.applyReinforcement(memory);
      
      // Check for archival
      const shouldArchive = await this.evaluateForArchival(memory);

      const evolutionResult = this.computeEvolutionResult(
        memory,
        agingResult,
        reinforcementResult,
        shouldArchive
      );

      // Update memory based on evolution
      const evolvedMemory = await this.updateMemory(memory, evolutionResult);
      
      this.updatePerformanceMetrics(startTime, true);
      return evolvedMemory;

    } catch (error) {
      console.error('Evolution error:', error);
      this.updatePerformanceMetrics(startTime, false);
      return memory;
    }
  }

  // Memory aging implementation
  private async applyAging(memory: any): Promise<number> {
    const age = Date.now() - memory.timestamp;
    const baseAgingFactor = Math.exp(-age / this.config.evolution.agingRate);
    
    // Adjust aging based on importance and access patterns
    const importanceModifier = memory.importance * 0.5;
    const accessModifier = this.calculateAccessModifier(memory.accessCount);
    
    const agingFactor = baseAgingFactor * (1 + importanceModifier + accessModifier);
    
    this.stats.averageAgingRate = 
      (this.stats.averageAgingRate * this.stats.totalEvolutions + agingFactor) /
      (this.stats.totalEvolutions + 1);

    return agingFactor;
  }

  // Reinforcement logic
  private async applyReinforcement(memory: any): Promise<number> {
    const reinforcementScore = this.calculateReinforcementScore(memory);
    
    if (reinforcementScore > this.config.evolution.reinforcementThreshold) {
      this.stats.reinforcementCount++;
    }

    return reinforcementScore;
  }

  // Archival process
  private async evaluateForArchival(memory: any): Promise<boolean> {
    const archivalProbability = this.calculateArchivalProbability(memory);
    
    if (archivalProbability > this.config.evolution.archivalThreshold) {
      this.stats.archivedCount++;
      return true;
    }

    return false;
  }

  // Evolution computation
  private computeEvolutionResult(
    memory: any,
    agingFactor: number,
    reinforcementScore: number,
    shouldArchive: boolean
  ): EvolutionResult {
    const importanceChange = this.calculateImportanceChange(
      agingFactor,
      reinforcementScore
    );

    const newImportance = Math.max(
      0,
      Math.min(1, memory.importance + importanceChange)
    );

    const newTierType = this.determineNewTier(
      memory.tierType,
      newImportance,
      shouldArchive
    );

    return {
      evolved: 
        newImportance !== memory.importance || 
        newTierType !== memory.tierType,
      changes: {
        importance: newImportance,
        tierType: newTierType,
        metadata: {
          ...memory.metadata,
          lastEvolution: Date.now(),
          evolutionHistory: [
            ...(memory.metadata.evolutionHistory || []),
            {
              timestamp: Date.now(),
              agingFactor,
              reinforcementScore,
              importanceChange
            }
          ]
        }
      },
      metrics: {
        agingFactor,
        reinforcementScore,
        archivalProbability: shouldArchive ? 1 : 0
      }
    };
  }

  // Helper methods
  private calculateAccessModifier(accessCount: number): number {
    return Math.min(accessCount / this.config.evolution.maxAccessCount, 1);
  }

  private calculateReinforcementScore(memory: any): number {
    const recencyScore = this.calculateRecencyScore(memory.lastAccessed);
    const emotionalValue = memory.metadata.emotional_value || 0;
    const contextRelevance = memory.metadata.context_relevance || 0;

    return (
      recencyScore * 0.4 +
      emotionalValue * 0.3 +
      contextRelevance * 0.3
    );
  }

  private calculateArchivalProbability(memory: any): number {
    const age = Date.now() - memory.timestamp;
    const ageScore = Math.min(age / this.config.evolution.maxAge, 1);
    const importanceScore = 1 - memory.importance;
    const accessScore = 1 - this.calculateAccessModifier(memory.accessCount);

    return (ageScore * 0.4 + importanceScore * 0.3 + accessScore * 0.3);
  }

  private calculateImportanceChange(
    agingFactor: number,
    reinforcementScore: number
  ): number {
    return (reinforcementScore - (1 - agingFactor)) * 
           this.config.evolution.importanceChangeRate;
  }

  private determineNewTier(
    currentTier: MemoryTierType,
    newImportance: number,
    shouldArchive: boolean
  ): MemoryTierType {
    if (shouldArchive) return 'background';

    const newTier = newImportance >= 0.8 ? 'core' :
                   newImportance >= 0.4 ? 'active' :
                   'background';

    if (newTier !== currentTier) {
      if (newTier > currentTier) this.stats.tierTransitions.promotions++;
      else this.stats.tierTransitions.demotions++;
    }

    return newTier;
  }

  private calculateRecencyScore(lastAccessed: number): number {
    const timeSinceAccess = Date.now() - lastAccessed;
    return Math.exp(-timeSinceAccess / this.config.evolution.recencyDecayRate);
  }

  private async updateMemory(
    memory: any,
    evolutionResult: EvolutionResult
  ): Promise<any> {
    if (!evolutionResult.evolved) return memory;

    return {
      ...memory,
      importance: evolutionResult.changes.importance,
      tierType: evolutionResult.changes.tierType,
      metadata: evolutionResult.changes.metadata
    };
  }

  private updatePerformanceMetrics(startTime: number, success: boolean): void {
    const processingTime = Date.now() - startTime;
    
    this.stats.performanceMetrics.processingTime = 
      (this.stats.performanceMetrics.processingTime * this.stats.totalEvolutions +
        processingTime) /
      (this.stats.totalEvolutions + 1);

    this.stats.performanceMetrics.successRate =
      (this.stats.performanceMetrics.successRate * this.stats.totalEvolutions +
        (success ? 1 : 0)) /
      (this.stats.totalEvolutions + 1);

    this.stats.performanceMetrics.lastEvolution = Date.now();
    this.stats.totalEvolutions++;
  }

  // Public methods for external interaction
  public getEvolutionStats(): EvolutionStats {
    return { ...this.stats };
  }

  public async validateEvolution(memory: any): Promise<boolean> {
    const evolutionResult = await this.evolveMemory(memory);
    return evolutionResult !== memory;
  }

  public resetStats(): void {
    this.stats = this.initializeStats();
  }

  public getEvolutionMetrics(memory: any): Promise<{
    agingRate: number;
    reinforcementScore: number;
    archivalProbability: number;
  }> {
    return Promise.resolve({
      agingRate: this.calculateAccessModifier(memory.accessCount),
      reinforcementScore: this.calculateReinforcementScore(memory),
      archivalProbability: this.calculateArchivalProbability(memory)
    });
  }
}