import { MemoryTierType } from '../memory-schemas';

class AsyncLock {
  private locks: Map<string, boolean> = new Map();

  acquire(key: string, callback: () => void): void {
    if (!this.locks.has(key) || !this.locks.get(key)) {
      this.locks.set(key, true);
      callback();
    } else {
      setTimeout(() => this.acquire(key, callback), 10);
    }
  }

  release(key: string): void {
    this.locks.set(key, false);
  }
}

interface Memory {
  id: string;
  tierType: MemoryTierType;
  importance: number;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
}

export interface MemoryTier {
  type: MemoryTierType;
  minImportance: number;
  maxCapacity: number;
  retentionPeriod: number;
  promotionThreshold: number;
  demotionThreshold: number;
}

export interface TierSettings {
  maxCapacity: number;
  importanceThreshold?: number;
  retentionPeriod?: number;
  promotionThreshold?: number;
  demotionThreshold?: number;
}

export interface TierConfig {
  tiers: {
    core: TierSettings;
    active: TierSettings;
    background: TierSettings;
  };
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
  private tiers: Map<MemoryTierType, MemoryTier> = new Map();
  private stats: Map<MemoryTierType, TierStats> = new Map();
  private transitionRules!: Record<MemoryTierType, TierTransitionRules>;
  private tierLock = new AsyncLock();

  private async acquireLock(memoryId: string): Promise<void> {
    return new Promise((resolve) => {
      this.tierLock.acquire(memoryId, resolve);
    });
  }

  constructor(config: TierConfig) {
    this.validateTierConfig(config);
    this.initializeTiers(config);
    this.initializeStats();
    this.initializeTransitionRules();
  }

  private validateTierConfig(config: TierConfig): void {
    if (!config?.tiers) {
      throw new Error('Memory configuration must include tiers property');
    }

    const tiers = ['core', 'active', 'background'] as const;
    for (const tier of tiers) {
      if (!config.tiers[tier]?.maxCapacity) {
        throw new Error(`Invalid tier configuration: missing ${tier}.maxCapacity`);
      }
      if (config.tiers[tier].maxCapacity <= 0) {
        throw new Error(`Invalid tier configuration: ${tier}.maxCapacity must be positive`);
      }
      if (config.tiers[tier].retentionPeriod && config.tiers[tier].retentionPeriod! <= 0) {
        throw new Error(`Invalid tier configuration: ${tier}.retentionPeriod must be positive`);
      }
      if (config.tiers[tier].promotionThreshold && 
          (config.tiers[tier].promotionThreshold! < 0 || config.tiers[tier].promotionThreshold! > 1)) {
        throw new Error(`Invalid tier configuration: ${tier}.promotionThreshold must be between 0 and 1`);
      }
      if (config.tiers[tier].demotionThreshold && 
          (config.tiers[tier].demotionThreshold! < 0 || config.tiers[tier].demotionThreshold! > 1)) {
        throw new Error(`Invalid tier configuration: ${tier}.demotionThreshold must be between 0 and 1`);
      }
    }
  }

  private initializeTiers(config: TierConfig): void {
    const defaultRetentionPeriods = {
      core: Infinity,
      active: 30 * 24 * 60 * 60 * 1000,
      background: 90 * 24 * 60 * 60 * 1000
    };

    this.tiers.set('core', {
      type: 'core',
      minImportance: 0.8,
      maxCapacity: config.tiers.core.maxCapacity,
      retentionPeriod: config.tiers.core.retentionPeriod ?? defaultRetentionPeriods.core,
      promotionThreshold: config.tiers.core.promotionThreshold ?? 0.9,
      demotionThreshold: config.tiers.core.demotionThreshold ?? 0.7
    });

    this.tiers.set('active', {
      type: 'active',
      minImportance: 0.4,
      maxCapacity: config.tiers.active.maxCapacity,
      retentionPeriod: config.tiers.active.retentionPeriod ?? defaultRetentionPeriods.active,
      promotionThreshold: config.tiers.active.promotionThreshold ?? 0.8,
      demotionThreshold: config.tiers.active.demotionThreshold ?? 0.3
    });

    this.tiers.set('background', {
      type: 'background',
      minImportance: 0,
      maxCapacity: config.tiers.background.maxCapacity,
      retentionPeriod: config.tiers.background.retentionPeriod ?? defaultRetentionPeriods.background,
      promotionThreshold: config.tiers.background.promotionThreshold ?? 0.4,
      demotionThreshold: config.tiers.background.demotionThreshold ?? 0
    });
  }

  private initializeStats(): void {
    for (const tierType of this.tiers.keys()) {
      this.stats.set(tierType, {
        currentSize: 0,
        averageImportance: 0,
        promotionCount: 0,
        demotionCount: 0,
        lastCleanupTime: Date.now()
      });
    }
  }

  private initializeTransitionRules(): void {
    this.transitionRules = {
      core: {
        promotionRules: {
          minImportance: 0.9,
          minAccessCount: 10,
          minAccessFrequency: 0.5
        },
        demotionRules: {
          maxInactivityPeriod: 7 * 24 * 60 * 60 * 1000,
          importanceDecayRate: 0.1,
          maxCapacityThreshold: 0.9
        }
      },
      active: {
        promotionRules: {
          minImportance: 0.7,
          minAccessCount: 5,
          minAccessFrequency: 0.3
        },
        demotionRules: {
          maxInactivityPeriod: 14 * 24 * 60 * 60 * 1000,
          importanceDecayRate: 0.2,
          maxCapacityThreshold: 0.8
        }
      },
      background: {
        promotionRules: {
          minImportance: 0.5,
          minAccessCount: 3,
          minAccessFrequency: 0.1
        },
        demotionRules: {
          maxInactivityPeriod: 30 * 24 * 60 * 60 * 1000,
          importanceDecayRate: 0.3,
          maxCapacityThreshold: 0.7
        }
      }
    };
  }

  public async evaluatePromotion(memory: Memory): Promise<MemoryTierType | null> {
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

  public async evaluateDemotion(memory: Memory): Promise<MemoryTierType | null> {
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

  private calculateAccessFrequency(memory: Memory): number {
    const timespan = Date.now() - memory.timestamp;
    return memory.accessCount / (timespan / (24 * 60 * 60 * 1000));
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

  private async getCurrentTier(memoryId: string): Promise<MemoryTierType> {
    // Implementation to get current tier from storage
    return 'core'; // Placeholder
  }

  private async performTierTransition(memory: Memory, newTier: MemoryTierType): Promise<void> {
    // Implementation for tier transition logic
  }

  public async transitionTier(memory: Memory, newTier: MemoryTierType): Promise<void> {
    if (!this.tiers.has(newTier)) {
      throw new Error(`Invalid tier: ${newTier}`);
    }

    await this.acquireLock(memory.id);
    try {
      const currentTier = await this.getCurrentTier(memory.id);
      if (currentTier !== memory.tierType) {
        throw new Error('Tier mismatch detected');
      }
      
      if (!await this.validateTierTransition(memory, newTier)) {
        throw new Error(`Invalid tier transition from ${currentTier} to ${newTier}`);
      }

      await this.performTierTransition(memory, newTier);
    } finally {
      this.tierLock.release(memory.id);
    }
  }

  public async validateTierTransition(
    memory: Memory,
    targetTier: MemoryTierType
  ): Promise<boolean> {
    const targetTierConfig = this.tiers.get(targetTier)!;
    return memory.importance >= targetTierConfig.minImportance;
  }
}
