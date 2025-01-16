// memory-cache.ts

import { MemoryTierType } from '../memory-schemas';
import { LRUCache } from 'lru-cache';

interface CacheConfig {
    maxSize: {
      core: number;
      active: number;
      background: number;
    };
    ttl: {
      core: number;
      active: number;
      background: number;
    };
    maxAge: {
      core: number;
      active: number;
      background: number;
    };
  }
  
  interface CacheMetrics {
    hits: number;
    misses: number;
    evictions: number;
    size: number;
    hitRate: number;
  }
  
  interface CacheStats {
    metrics: Record<MemoryTierType, CacheMetrics>;
    lastCleanup: number;
    totalOperations: number;
  }

  export class MemoryCache {
    private caches!: Record<MemoryTierType, LRUCache<string, any>>; // Added ! to fix initialization error
    private stats!: CacheStats; // Added ! to fix initialization error
    private config: CacheConfig;
  
    constructor(config?: Partial<CacheConfig>) {
      this.config = {
        maxSize: {
          core: 1000,
          active: 500,
          background: 100
        },
        ttl: {
          core: Infinity,
          active: 24 * 60 * 60 * 1000,
          background: 6 * 60 * 60 * 1000
        },
        maxAge: {
          core: Infinity,
          active: 7 * 24 * 60 * 60 * 1000,
          background: 2 * 24 * 60 * 60 * 1000
        },
        ...config
      };
  
      this.initializeCaches();
      this.initializeStats();
    }
  
    private initializeCaches(): void {
      this.caches = {
        core: new LRUCache<string, any>({
          max: this.config.maxSize.core,
          ttl: this.config.ttl.core,
          maxAge: this.config.maxAge.core,
          updateAgeOnGet: true
        }),
        active: new LRUCache<string, any>({
          max: this.config.maxSize.active,
          ttl: this.config.ttl.active,
          maxAge: this.config.maxAge.active,
          updateAgeOnGet: true
        }),
        background: new LRUCache<string, any>({
          max: this.config.maxSize.background,
          ttl: this.config.ttl.background,
          maxAge: this.config.maxAge.background,
          updateAgeOnGet: true
        })
      };
    }
    
  private initializeStats(): void {
    this.stats = {
      metrics: {
        core: this.createEmptyMetrics(),
        active: this.createEmptyMetrics(),
        background: this.createEmptyMetrics()
      },
      lastCleanup: Date.now(),
      totalOperations: 0
    };
  }

  private createEmptyMetrics(): CacheMetrics {
    return {
      hits: 0,
      misses: 0,
      evictions: 0,
      size: 0,
      hitRate: 0
    };
  }

  // Cache Operations
  async setCachedMemory(
    id: string,
    memory: any,
    tier: MemoryTierType = 'active'
  ): Promise<void> {
    try {
      this.caches[tier].set(id, memory);
      this.updateMetrics(tier, 'set');
    } catch (error) {
      console.error(`Cache set error for tier ${tier}:`, error);
      throw error;
    }
  }

  async getCachedMemory(
    id: string,
    tier: MemoryTierType = 'active'
  ): Promise<any | null> {
    try {
      const cached = this.caches[tier].get(id);
      this.updateMetrics(tier, cached ? 'hit' : 'miss');
      return cached || null;
    } catch (error) {
      console.error(`Cache get error for tier ${tier}:`, error);
      return null;
    }
  }

  async invalidateCache(id: string, tier?: MemoryTierType): Promise<void> {
    try {
      if (tier) {
        this.caches[tier].delete(id);
      } else {
        // Invalidate across all tiers if tier not specified
        Object.values(this.caches).forEach(cache => cache.delete(id));
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
      throw error;
    }
  }

  // Cache Management
  async optimizeCache(): Promise<void> {
    try {
      for (const [tier, cache] of Object.entries(this.caches)) {
        const metrics = this.stats.metrics[tier as MemoryTierType];
        
        // Adjust cache size based on hit rate
        if (metrics.hitRate < 0.5 && cache.max! > 100) {
          cache.max = Math.floor(cache.max! * 0.8); // Reduce cache size
        } else if (metrics.hitRate > 0.8 && metrics.size / cache.max! > 0.9) {
          cache.max = Math.floor(cache.max! * 1.2); // Increase cache size
        }
      }
    } catch (error) {
      console.error('Cache optimization error:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    try {
      const now = Date.now();
      
      // Cleanup based on tier-specific rules
      for (const [tier, cache] of Object.entries(this.caches)) {
        const tierConfig = this.config.maxAge[tier as MemoryTierType];
        
        // Prune old entries
        cache.prune();
        
        // Reset metrics periodically
        if (now - this.stats.lastCleanup > 24 * 60 * 60 * 1000) {
          this.stats.metrics[tier as MemoryTierType] = this.createEmptyMetrics();
        }
      }
      
      this.stats.lastCleanup = now;
    } catch (error) {
      console.error('Cache cleanup error:', error);
      throw error;
    }
  }

  // Metrics and Stats
  private updateMetrics(tier: MemoryTierType, operation: 'hit' | 'miss' | 'set'): void {
    const metrics = this.stats.metrics[tier];
    
    switch (operation) {
      case 'hit':
        metrics.hits++;
        break;
      case 'miss':
        metrics.misses++;
        break;
      case 'set':
        metrics.size = this.caches[tier].size;
        break;
    }

    metrics.hitRate = metrics.hits / (metrics.hits + metrics.misses);
    this.stats.totalOperations++;
  }

  public getCacheStats(): CacheStats {
    return {
      ...this.stats,
      metrics: {
        core: { ...this.stats.metrics.core },
        active: { ...this.stats.metrics.active },
        background: { ...this.stats.metrics.background }
      }
    };
  }

  public getCacheSizeForTier(tier: MemoryTierType): number {
    return this.caches[tier].size;
  }

  // Utility Methods
  public async preloadCache(memories: any[], tier: MemoryTierType): Promise<void> {
    for (const memory of memories) {
      await this.setCachedMemory(memory.id, memory, tier);
    }
  }

  public async clearCache(tier?: MemoryTierType): Promise<void> {
    if (tier) {
      this.caches[tier].clear();
      this.stats.metrics[tier] = this.createEmptyMetrics();
    } else {
      Object.keys(this.caches).forEach(t => {
        this.caches[t as MemoryTierType].clear();
        this.stats.metrics[t as MemoryTierType] = this.createEmptyMetrics();
      });
    }
  }

  public async isCached(id: string, tier: MemoryTierType): Promise<boolean> {
    return this.caches[tier].has(id);
  }
}