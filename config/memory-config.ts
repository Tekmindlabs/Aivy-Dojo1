// memory-config.ts

import { z } from 'zod';
import { MemoryTierType } from '../lib/memory/memory-schemas';

// Configuration schema definitions
const TierConfigSchema = z.object({
  maxSize: z.number().positive(),
  maxCapacity: z.number().positive(),
  ttl: z.number().int().positive(), // Update to ensure integer and positive
  importanceThreshold: z.number().min(0).max(1),
  compressionRatio: z.number().positive().optional(),
  backupFrequency: z.number().positive().optional()
});

const ConsolidationConfigSchema = z.object({
  threshold: z.number().min(0).max(1),
  maxClusterSize: z.number().positive(),
  minSimilarity: z.number().min(0).max(1),
  recencyDecayRate: z.number().positive(),
  importanceChangeRate: z.number().positive(),
  maxAccessCount: z.number().positive(),
  scheduleInterval: z.number().positive(),
  memoryThreshold: z.number().positive(),
  timeThreshold: z.number().positive()
});

const CompressionConfigSchema = z.object({
  enabled: z.boolean(),
  method: z.enum(['lossless', 'lossy']),
  quality: z.number().min(0).max(1),
  minSize: z.number().positive(),
  targetRatio: z.number().positive()
});

const EvolutionConfigSchema = z.object({
  agingRate: z.number().positive(),
  reinforcementThreshold: z.number().min(0).max(1),
  maxAge: z.number().positive(),
  importanceDecayRate: z.number().positive(),
  promotionThreshold: z.number().min(0).max(1),
  demotionThreshold: z.number().min(0).max(1)
});

const MemoryConfigSchema = z.object({
  tiers: z.record(z.enum(['core', 'active', 'background']), TierConfigSchema),
  consolidation: ConsolidationConfigSchema,
  compression: CompressionConfigSchema,
  evolution: EvolutionConfigSchema,
  general: z.object({
    maxTotalMemories: z.number().positive(),
    backupInterval: z.number().positive(),
    cleanupInterval: z.number().positive(),
    defaultTierType: z.enum(['core', 'active', 'background'])
  })
});

// Default configuration values
export const DEFAULT_CONFIG = {
  tiers: {
    core: {
      maxSize: 1000,
      maxCapacity: 1000,
      ttl: 365 * 24 * 60 * 60 * 1000, // Use this instead of Infinity
      // or use a specific large number like:
      // ttl: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
      importanceThreshold: 0.8,
      compressionRatio: 1.0,
      backupFrequency: 24 * 60 * 60 * 1000
    },
    active: {
      maxSize: 5000,
      maxCapacity: 5000, // Add this
      ttl: 30 * 24 * 60 * 60 * 1000,
      importanceThreshold: 0.4,
      compressionRatio: 0.8,
      backupFrequency: 48 * 60 * 60 * 1000
    },
    background: {
      maxSize: 10000,
      maxCapacity: 10000, // Add this
      ttl: 90 * 24 * 60 * 60 * 1000,
      importanceThreshold: 0.0,
      compressionRatio: 0.6,
      backupFrequency: 72 * 60 * 60 * 1000
    }
  },
  consolidation: {
    threshold: 0.7,
    maxClusterSize: 10,
    minSimilarity: 0.8,
    recencyDecayRate: 7 * 24 * 60 * 60 * 1000, // 7 days
    importanceChangeRate: 0.1,
    maxAccessCount: 100,
    scheduleInterval: 24 * 60 * 60 * 1000, // 24 hours
    memoryThreshold: 1000,
    timeThreshold: 24 * 60 * 60 * 1000 // 24 hours
  },
  compression: {
    enabled: true,
    method: 'lossless' as const,
    quality: 0.9,
    minSize: 1024, // bytes
    targetRatio: 0.7
  },
  evolution: {
    agingRate: 0.1,
    reinforcementThreshold: 0.6,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    importanceDecayRate: 0.05,
    promotionThreshold: 0.8,
    demotionThreshold: 0.3
  },
  general: {
    maxTotalMemories: 16000,
    backupInterval: 24 * 60 * 60 * 1000, // 24 hours
    cleanupInterval: 12 * 60 * 60 * 1000, // 12 hours
    defaultTierType: 'active' as const
  }
};

// Configuration class with validation and update methods
export class MemoryConfig {
  private config: typeof DEFAULT_CONFIG;

  constructor(customConfig: Partial<typeof DEFAULT_CONFIG> = {}) {
    this.config = this.validateAndMergeConfig(customConfig);
  }

  private validateAndMergeConfig(
    customConfig: Partial<typeof DEFAULT_CONFIG>
  ): typeof DEFAULT_CONFIG {
    try {
      const mergedConfig = this.deepMerge(DEFAULT_CONFIG, customConfig);
      MemoryConfigSchema.parse(mergedConfig);
      return mergedConfig;
    } catch (error) {
      console.error('Configuration validation error:', error);
      throw new Error('Invalid memory configuration');
    }
  }

  private deepMerge(target: any, source: any): any {
    const output = { ...target };
    
    if (isObject(target) && isObject(source)) {
      Object.keys(source).forEach(key => {
        if (isObject(source[key])) {
          if (!(key in target)) {
            Object.assign(output, { [key]: source[key] });
          } else {
            output[key] = this.deepMerge(target[key], source[key]);
          }
        } else {
          Object.assign(output, { [key]: source[key] });
        }
      });
    }
    
    return output;
  }

  // Public methods for accessing and updating configuration
  public getConfig(): typeof DEFAULT_CONFIG {
    return { ...this.config };
  }

  public getTierConfig(tier: MemoryTierType) {
    return { ...this.config.tiers[tier] };
  }

  public getConsolidationConfig() {
    return { ...this.config.consolidation };
  }

  public getCompressionConfig() {
    return { ...this.config.compression };
  }

  public getEvolutionConfig() {
    return { ...this.config.evolution };
  }

  public async updateConfig(
    updates: Partial<typeof DEFAULT_CONFIG>
  ): Promise<void> {
    try {
      const newConfig = this.validateAndMergeConfig({
        ...this.config,
        ...updates
      });
      this.config = newConfig;
    } catch (error) {
      console.error('Configuration update error:', error);
      throw new Error('Invalid configuration update');
    }
  }

  public async updateTierConfig(
    tier: MemoryTierType,
    updates: Partial<typeof DEFAULT_CONFIG['tiers'][MemoryTierType]>
  ): Promise<void> {
    try {
      const newTierConfig = {
        ...this.config.tiers[tier],
        ...updates
      };
      TierConfigSchema.parse(newTierConfig);
      this.config.tiers[tier] = newTierConfig;
    } catch (error) {
      console.error(`Tier configuration update error for ${tier}:`, error);
      throw new Error('Invalid tier configuration update');
    }
  }

  // Validation methods
  public validateTierTransition(
    fromTier: MemoryTierType,
    toTier: MemoryTierType,
    importance: number
  ): boolean {
    const fromConfig = this.config.tiers[fromTier];
    const toConfig = this.config.tiers[toTier];

    return importance >= toConfig.importanceThreshold;
  }

  public validateConsolidationParams(
    similarity: number,
    clusterSize: number
  ): boolean {
    return (
      similarity >= this.config.consolidation.minSimilarity &&
      clusterSize <= this.config.consolidation.maxClusterSize
    );
  }
}

// Helper function
function isObject(item: any): boolean {
  return item && typeof item === 'object' && !Array.isArray(item);
}

// Export default instance
export const MEMORY_CONFIG = new MemoryConfig();