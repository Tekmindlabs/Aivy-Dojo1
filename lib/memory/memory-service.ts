import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { MemoryTier, MemoryTierManager } from './tiers/memory-tiers';
import { MemoryCompression } from './compression/memory-compression';
import { MemoryCache } from './cache/memory-cache';
import { MemoryConsolidator } from './consolidation/memory-consolidator';
import { MEMORY_CONFIG } from '../../config/memory-config';

interface Memory {
  id: string;
  content: string;
  embedding: number[];
  timestamp: number;
  tierType: 'core' | 'active' | 'background';
  importance: number;
  lastAccessed: number;
  accessCount: number;
  metadata: {
    emotional_value?: number;
    context_relevance?: number;
    source?: string;
  };
}

export class MemoryService {
  private milvusClient: MilvusClient;
  private tierManager: MemoryTierManager;
  private compression: MemoryCompression;
  private cache: MemoryCache;
  private consolidator: MemoryConsolidator;

  constructor(
    milvusClient: MilvusClient,
    config = MEMORY_CONFIG
  ) {
    this.milvusClient = milvusClient;
    this.tierManager = new MemoryTierManager(config.tiers);
    this.compression = new MemoryCompression(config.compression);
    this.cache = new MemoryCache();
    this.consolidator = new MemoryConsolidator();
  }

  // Added methods to fix memory manager integration
  async getMemoriesByTier(tier: 'core' | 'active' | 'background'): Promise<Memory[]> {
    return await this.milvusClient.query({
      collection_name: `memory_${tier}`
    });
  }

  async getMemories(): Promise<Memory[]> {
    return await this.getAllMemories();
  }

  async update(memory: Memory): Promise<void> {
    const compressed = await this.compression.compressMemory(memory);
    await this.milvusClient.update({
      collection_name: `memory_${memory.tierType}`,
      data: compressed
    });
  }

  async delete(id: string): Promise<void> {
    for (const tier of ['core', 'active', 'background']) {
      await this.milvusClient.delete({
        collection_name: `memory_${tier}`,
        filter: `id == "${id}"`
      });
    }
  }

  async getOldMemories(tier: 'core' | 'active' | 'background', maxAge: number): Promise<Memory[]> {
    const cutoffTime = Date.now() - maxAge;
    return await this.milvusClient.query({
      collection_name: `memory_${tier}`,
      filter: `timestamp < ${cutoffTime}`
    });
  }

  async transitionMemoryTier(memory: Memory, newTier: MemoryTier['type']): Promise<void> {
    await this.transitionTier(memory, newTier);
  }

  // Existing methods
  async store(memory: Partial<Memory>): Promise<string> {
    const importance = await this.scoreMemoryImportance(memory);
    const tierType = this.determineTierType(importance);

    const newMemory: Memory = {
      id: crypto.randomUUID(),
      content: memory.content!,
      embedding: memory.embedding!,
      timestamp: Date.now(),
      tierType,
      importance,
      lastAccessed: Date.now(),
      accessCount: 0,
      metadata: memory.metadata || {}
    };

    if (tierType === 'core') {
      await this.cache.setCachedMemory(newMemory.id, newMemory);
    }

    const compressed = await this.compression.compressMemory(newMemory);
    await this.milvusClient.insert({
      collection_name: `memory_${tierType}`,
      data: compressed
    });

    return newMemory.id;
  }

  async retrieve(query: string, limit: number = 5): Promise<Memory[]> {
    const results: Memory[] = [];
    
    for (const tier of ['core', 'active', 'background']) {
      const tierResults = await this.searchTier(tier, query, limit - results.length);
      results.push(...tierResults);
      
      if (results.length >= limit) break;
    }

    await this.updateAccessMetrics(results);
    
    return results;
  }

  async consolidateMemories(): Promise<void> {
    const memories = await this.getAllMemories();
    const consolidatedMemories = await this.consolidator.consolidateMemories(memories);
    
    for (const memory of consolidatedMemories) {
      const newTier = this.determineTierType(memory.importance);
      if (newTier !== memory.tierType) {
        await this.transitionTier(memory, newTier);
      }
    }
  }

  private async scoreMemoryImportance(memory: Partial<Memory>): Promise<number> {
    const factors = {
      recency: this.calculateRecencyScore(memory.timestamp || Date.now()),
      emotionalValue: memory.metadata?.emotional_value || 0,
      contextRelevance: memory.metadata?.context_relevance || 0,
      accessFrequency: this.calculateAccessFrequency(memory.accessCount || 0)
    };

    return (
      factors.recency * 0.3 +
      factors.emotionalValue * 0.3 +
      factors.contextRelevance * 0.2 +
      factors.accessFrequency * 0.2
    );
  }

  private async transitionTier(memory: Memory, newTier: MemoryTier['type']): Promise<void> {
    await this.milvusClient.delete({
      collection_name: `memory_${memory.tierType}`,
      ids: [memory.id]
    });

    memory.tierType = newTier;
    await this.store(memory);
    
    if (newTier === 'core') {
      await this.cache.setCachedMemory(memory.id, memory);
    } else {
      await this.cache.invalidateCache(memory.id);
    }
  }

  private calculateRecencyScore(timestamp: number): number {
    const age = Date.now() - timestamp;
    return Math.exp(-age / (30 * 24 * 60 * 60 * 1000));
  }

  private calculateAccessFrequency(accessCount: number): number {
    return Math.min(accessCount / 100, 1);
  }

  private async updateAccessMetrics(memories: Memory[]): Promise<void> {
    for (const memory of memories) {
      memory.lastAccessed = Date.now();
      memory.accessCount++;
      await this.store(memory);
    }
  }

  private async searchTier(
    tier: MemoryTier['type'],
    query: string,
    limit: number
  ): Promise<Memory[]> {
    if (tier === 'core') {
      const cached = await this.cache.getCachedMemory(query);
      if (cached) return [cached];
    }

    return await this.milvusClient.search({
      collection_name: `memory_${tier}`,
      vector: query,
      limit
    });
  }

  private determineTierType(importance: number): MemoryTier['type'] {
    if (importance >= 0.8) return 'core';
    if (importance >= 0.4) return 'active';
    return 'background';
  }

  private async getAllMemories(): Promise<Memory[]> {
    const memories: Memory[] = [];
    for (const tier of ['core', 'active', 'background']) {
      const tierMemories = await this.milvusClient.query({
        collection_name: `memory_${tier}`
      });
      memories.push(...tierMemories);
    }
    return memories;
  }
}