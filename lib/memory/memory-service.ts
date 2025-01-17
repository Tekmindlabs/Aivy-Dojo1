import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { MemoryTier, MemoryTierManager } from '../memory/tiers/memory-tiers';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();
import { MemoryCompression } from '../memory/compression/memory-compression';
import { MemoryCache } from './cache/memory-cache';
import { MemoryConsolidator } from './consolidation/memory-consolidator';
import { MEMORY_CONFIG } from '../../config/memory-config';

export type MemoryTierType = 'core' | 'active' | 'background';

export interface Memory {
  // Required core fields
  id: string;
  content: string;
  embedding: number[];
  timestamp: number;
  tierType: MemoryTierType;
  importance: number;
  lastAccessed: number;
  accessCount: number;

  // Extended metadata fields
  metadata: {
    emotional_value?: number;
    context_relevance?: number;
    source?: string;
    // New metadata fields
    tags?: string[];
    category?: string;
    confidence?: number;
    relationships?: {
      connectedMemories?: string[]; // IDs of related memories
      strength?: number; // Connection strength (0-1)
    };
    userContext?: {
      userId?: string;
      sessionId?: string;
      interactionType?: string;
    };
    processingMetadata?: {
      compressionRatio?: number;
      processingTimestamp?: number;
      version?: string;
    };
  };

  // Optional fields for enhanced functionality
  summary?: string; // Condensed version of content
  vectorMetadata?: {
    dimensions?: number;
    model?: string;
    distance?: number; // For search results
  };
  
  // Versioning and tracking
  version?: number;
  createdAt?: number;
  updatedAt?: number;
  
  // Access control
  permissions?: {
    read?: string[];
    write?: string[];
    owner?: string;
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
    config = MEMORY_CONFIG.getConfig()
  ) {
    this.milvusClient = milvusClient;
    
    if (!config?.tiers) {
      throw new Error('Memory configuration must include tiers property');
    }
    
    // Validate tier configuration
    if (!config.tiers.core?.maxCapacity ||
        !config.tiers.active?.maxCapacity ||
        !config.tiers.background?.maxCapacity) {
      throw new Error('Invalid tier configuration: missing maxCapacity');
    }

    this.tierManager = new MemoryTierManager(config);
    this.compression = new MemoryCompression({
      minSizeForCompression: config.compression.minSize,
      compressionLevel: 6, // You can make this configurable if needed
      optimizationThreshold: config.compression.targetRatio,
      tierSpecificSettings: {
        core: {
          compressionRatio: config.tiers.core.compressionRatio || 1.0,
          retentionPeriod: config.tiers.core.ttl
        },
        active: {
          compressionRatio: config.tiers.active.compressionRatio || 0.8,
          retentionPeriod: config.tiers.active.ttl
        },
        background: {
          compressionRatio: config.tiers.background.compressionRatio || 0.6,
          retentionPeriod: config.tiers.background.ttl
        }
      }
    });
    this.cache = new MemoryCache();
    this.consolidator = new MemoryConsolidator();
  }


  async getMemoriesByTier(tier: MemoryTierType): Promise<Memory[]> {
    return await this.milvusClient.query({
      collection_name: `memory_${tier}`,
      expr: ""
    });
  }

  async getMemories(): Promise<Memory[]> {
    return await this.getAllMemories();
  }

  async update(memory: Memory): Promise<void> {
    const compressed = await this.compression.compressMemory(memory);
    // Delete existing record
    await this.milvusClient.delete({
      collection_name: `memory_${memory.tierType}`,
      expr: `id == "${memory.id}"`
    });
    // Insert updated record
    await this.milvusClient.insert({
      collection_name: `memory_${memory.tierType}`,
      data: compressed
    });
  }

  async delete(id: string): Promise<void> {
    for (const tier of ['core', 'active', 'background'] as MemoryTierType[]) {
      await this.milvusClient.delete({
        collection_name: `memory_${tier}`,
        expr: `id == "${id}"`
      });
    }
  }

  async getOldMemories(tier: MemoryTierType, maxAge: number): Promise<Memory[]> {
    const cutoffTime = Date.now() - maxAge;
    return await this.milvusClient.query({
      collection_name: `memory_${tier}`,
      expr: `timestamp < ${cutoffTime}`
    });
  }

  async transitionMemoryTier(memory: Memory, newTier: MemoryTierType): Promise<void> {
    await this.transitionTier(memory, newTier);
  }

  async store(memory: Partial<Memory>): Promise<string> {
    if (!this.validateMemory(memory)) {
      throw new Error('Invalid memory object');
    }

    return await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      try {
        // Validate memory before processing
        if (!memory.content || !memory.embedding) {
          throw new Error('Missing required memory fields');
        }

        // Score memory importance
        const importance = await this.scoreMemoryImportance(memory);
        const tierType = this.determineTierType(importance);

        // Create new memory object
        const newMemory: Memory = {
          id: crypto.randomUUID(),
          content: memory.content,
          embedding: memory.embedding,
          timestamp: Date.now(),
          tierType,
          importance,
          lastAccessed: Date.now(),
          accessCount: 0,
          metadata: memory.metadata || {}
        };

        // Cache core memories
        if (tierType === 'core') {
          await this.cache.setCachedMemory(newMemory.id, newMemory);
        }

        // Compress and store memory
        const compressed = await this.compression.compressMemory(newMemory);
        const insertResult = await this.milvusClient.insert({
          collection_name: `memory_${tierType}`,
          data: compressed
        });

        // Verify successful insertion
        if (!insertResult.inserted_ids || insertResult.inserted_ids.length === 0) {
          throw new Error('Failed to insert memory into Milvus');
        }

        return newMemory.id;
      } catch (error) {
        console.error('Transaction failed:', error);
        throw new Error(`Memory storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  async retrieve(query: string, limit: number = 5): Promise<Memory[]> {
    const results: Memory[] = [];
    
    for (const tier of ['core', 'active', 'background'] as MemoryTierType[]) {
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

  private async transitionTier(memory: Memory, newTier: MemoryTierType): Promise<void> {
    await this.milvusClient.delete({
      collection_name: `memory_${memory.tierType}`,
      expr: `id == "${memory.id}"`
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

  private validateMetadata(metadata?: Memory['metadata']): boolean {
    if (!metadata) return true;
    // Basic validation for metadata structure
    return typeof metadata === 'object' && metadata !== null;
  }

  private validateMemory(memory: Partial<Memory>): boolean {
    const requiredFields: (keyof Memory)[] = ['content', 'embedding', 'timestamp'];
    const hasRequiredFields = requiredFields.every(field => {
      const value = memory[field];
      return value !== undefined && value !== null;
    });
    const hasValidMetadata = this.validateMetadata(memory.metadata);
    return hasRequiredFields && hasValidMetadata;
  }

  private lock = new Map<string, Promise<void>>();

  private async updateAccessMetrics(memories: Memory[]): Promise<void> {
    await Promise.all(memories.map(async memory => {
      // Create a lock for this memory ID if it doesn't exist
      if (!this.lock.has(memory.id)) {
        this.lock.set(memory.id, Promise.resolve());
      }

      // Get the current lock promise
      const currentLock = this.lock.get(memory.id)!;

      // Create a new promise that will resolve when we're done
      let resolveLock: () => void;
      const newLock = new Promise<void>(resolve => {
        resolveLock = resolve;
      });

      // Update the lock map with our new lock
      this.lock.set(memory.id, newLock);

      // Wait for the previous operation to complete
      await currentLock;

      try {
        // Update the memory metrics
        memory.lastAccessed = Date.now();
        memory.accessCount++;
        await this.store(memory);
      } finally {
        // Release the lock
        resolveLock!();
      }
    }));
  }

  private async searchTier(
    tier: MemoryTierType,
    query: string,
    limit: number
): Promise<Memory[]> {
    if (tier === 'core') {
      const cached = await this.cache.getCachedMemory(query);
      if (cached) return [cached];
    }

    // Simplified search parameters without the undefined getTierSearchParams
    return await this.milvusClient.search({
      collection_name: `memory_${tier}`,
      vectors: [query],
      nq: 1, // Add this to fix the original error
      limit,
      output_fields: ['*']
    });
}

private processSearchResults(response: any): Memory[] {
    if (!response || !response.results) {
      return [];
    }
    return response.results.map((result: any) => ({
      ...result,
      score: 1 - (result.distance || 0)
    }));
}

  private determineTierType(importance: number): MemoryTierType {
    if (importance >= 0.8) return 'core';
    if (importance >= 0.4) return 'active';
    return 'background';
  }

  private async getAllMemories(): Promise<Memory[]> {
    const memories: Memory[] = [];
    for (const tier of ['core', 'active', 'background'] as MemoryTierType[]) {
      const tierMemories = await this.milvusClient.query({
        collection_name: `memory_${tier}`,
        expr: ""
      });
      memories.push(...tierMemories);
    }
    return memories;
  }
}