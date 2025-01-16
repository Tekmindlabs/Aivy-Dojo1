// memory-tiers.ts

import { MemoryTierType } from '../memory-schemas';

// Tier interfaces
export interface MemoryTier {
  type: MemoryTierType;
  minImportance: number;
  maxCapacity: number;
  retentionPeriod: number; // in milliseconds
  promotionThreshold: number;
  demotionThreshold: number;
}

export interface TierTransitionRules {
  promotionRules: {
    minImportance: number;
    minAccessCount: number;
    minAccessFrequency: number;
  };
  demotionRules: {
    maxInactivityPeriod: number;
    importanceDecayRate: number;
    maxCapacityThreshold: number;
  };
}

export interface TierStats {
  currentSize: number;
  averageImportance: number;
  promotionCount: number;
  demotionCount: number;
  lastCleanupTime: number;
}

export class MemoryTierManager {
  private tiers: Map<MemoryTierType, MemoryTier>;
  private stats: Map<MemoryTierType, TierStats>;
  private transitionRules: Record<MemoryTierType, TierTransitionRules>;

  constructor(config: any) {
    this.initializeTiers(config);
    this.initializeStats();
    this.initializeTransitionRules(config);
  }

  // Tier Management Methods
  private initializeTiers(config: any): void {
    this.tiers = new Map([
      ['core', {
        type: 'core',
        minImportance: 0.8,
        maxCapacity: config.tiers.core.maxCapacity || 1000,
        retentionPeriod: Infinity,
        promotionThreshold: 0.9,
        demotionThreshold: 0.7
      }],
      ['active', {
        type: 'active',
        minImportance: 0.4,
        maxCapacity: config.tiers.active.maxCapacity || 5000,
        retentionPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
        promotionThreshold: 0.8,
        demotionThreshold: 0.3
      }],
      ['background', {
        type: 'background',
        minImportance: 0,
        maxCapacity: config.tiers.background.maxCapacity || 10000,
        retentionPeriod: 90 * 24 * 60 * 60 * 1000, // 90 days
        promotionThreshold: 0.4,
        demotionThreshold: 0
      }]
    ]);
  }

  private initializeStats(): void {
    this.stats = new Map(
      Array.from(this.tiers.keys()).map(tierType => [
        tierType,
        {
          currentSize: 0,
          averageImportance: 0,
          promotionCount: 0,
          demotionCount: 0,
          lastCleanupTime: Date.now()
        }
      ])
    );
  }

  private initializeTransitionRules(config: any): void {
    this.transitionRules = {
      core: {
        promotionRules: {
          minImportance: 0.8,
          minAccessCount: 50,
          minAccessFrequency: 0.7
        },
        demotionRules: {
          maxInactivityPeriod: 7 * 24 * 60 * 60 * 1000, // 7 days
          importanceDecayRate: 0.1,
          maxCapacityThreshold: 0.95
        }
      },
      active: {
        promotionRules: {
          minImportance: 0.4,
          minAccessCount: 20,
          minAccessFrequency: 0.4
        },
        demotionRules: {
          maxInactivityPeriod: 14 * 24 * 60 * 60 * 1000, // 14 days
          importanceDecayRate: 0.2,
          maxCapacityThreshold: 0.9
        }
      },
      background: {
        promotionRules: {
          minImportance: 0.2,
          minAccessCount: 5,
          minAccessFrequency: 0.2
        },
        demotionRules: {
          maxInactivityPeriod: 30 * 24 * 60 * 60 * 1000, // 30 days
          importanceDecayRate: 0.3,
          maxCapacityThreshold: 0.8
        }
      }
    };
  }

  // Tier Operations
  public async evaluatePromotion(memory: any): Promise<MemoryTierType | null> {
    const currentTier = memory.tierType;
    const rules = this.transitionRules[currentTier].promotionRules;
    
    if (currentTier === 'core') return null;

    const nextTier = currentTier === 'background' ? 'active' : 'core';
    
    if (
      memory.importance >= rules.minImportance &&
      memory.accessCount >= rules.minAccessCount &&
      this.calculateAccessFrequency(memory) >= rules.minAccessFrequency
    ) {
      return nextTier;
    }

    return null;
  }

  public async evaluateDemotion(memory: any): Promise<MemoryTierType | null> {
    const currentTier = memory.tierType;
    const rules = this.transitionRules[currentTier].demotionRules;
    
    if (currentTier === 'background') return null;

    const nextTier = currentTier === 'core' ? 'active' : 'background';
    
    const inactivityPeriod = Date.now() - memory.lastAccessed;
    const importanceDecayed = memory.importance * (1 - rules.importanceDecayRate);
    
    if (
      inactivityPeriod > rules.maxInactivityPeriod ||
      importanceDecayed < this.tiers.get(currentTier)!.demotionThreshold
    ) {
      return nextTier;
    }

    return null;
  }

  public async cleanupTier(tierType: MemoryTierType): Promise<string[]> {
    const tier = this.tiers.get(tierType)!;
    const stats = this.stats.get(tierType)!;
    const memoriesToRemove: string[] = [];

    if (stats.currentSize > tier.maxCapacity) {
      // Implementation for cleanup logic
      // Return array of memory IDs to be removed
    }

    stats.lastCleanupTime = Date.now();
    return memoriesToRemove;
  }

  // Helper Methods
  private calculateAccessFrequency(memory: any): number {
    const timespan = Date.now() - memory.timestamp;
    return memory.accessCount / (timespan / (24 * 60 * 60 * 1000)); // Daily frequency
  }

  public getTierConfig(tierType: MemoryTierType): MemoryTier {
    return this.tiers.get(tierType)!;
  }

  public getTierStats(tierType: MemoryTierType): TierStats {
    return this.stats.get(tierType)!;
  }

  public updateTierStats(tierType: MemoryTierType, updates: Partial<TierStats>): void {
    const currentStats = this.stats.get(tierType)!;
    this.stats.set(tierType, { ...currentStats, ...updates });
  }

  public async validateTierTransition(
    memory: any,
    targetTier: MemoryTierType
  ): Promise<boolean> {
    const targetTierConfig = this.tiers.get(targetTier)!;
    return memory.importance >= targetTierConfig.minImportance;
  }
}