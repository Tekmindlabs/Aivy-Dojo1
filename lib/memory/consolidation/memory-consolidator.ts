// memory-consolidator.ts

import { MemoryTierType } from '../memory-schemas';
import { MEMORY_CONFIG } from '../../../config/memory-config';

interface ConsolidationStats {
  mergedMemories: number;
  totalProcessed: number;
  averageImportance: number;
  consolidationTime: number;
  lastConsolidation: number;
  performanceMetrics: {
    processingTime: number;
    memoryUsage: number;
    successRate: number;
  };
}

interface ConsolidationResult {
  merged: boolean;
  importance: number;
  content: string;
  metadata: any;
}

interface MemoryCluster {
  memories: any[];
  centerMemory: any;
  importance: number;
  timestamp: number;
}

export class MemoryConsolidator {
  private stats: ConsolidationStats;
  private config: typeof MEMORY_CONFIG;
  private consolidationThreshold: number;

  constructor(config = MEMORY_CONFIG) {
    this.config = config;
    // Use getConsolidationConfig() instead of direct property access
    const consolidationConfig = config.getConsolidationConfig();
    this.consolidationThreshold = consolidationConfig.threshold || 0.7;
    this.stats = this.initializeStats();
}

  private initializeStats(): ConsolidationStats {
    return {
      mergedMemories: 0,
      totalProcessed: 0,
      averageImportance: 0,
      consolidationTime: 0,
      lastConsolidation: Date.now(),
      performanceMetrics: {
        processingTime: 0,
        memoryUsage: 0,
        successRate: 1
      }
    };
  }

  // Main consolidation methods
  async consolidateMemories(memories: any[]): Promise<any[]> {
    const startTime = Date.now();
    try {
      // Group similar memories
      const clusters = await this.clusterMemories(memories);
      const consolidatedMemories: any[] = [];

      for (const cluster of clusters) {
        if (cluster.memories.length > 1) {
          const consolidated = await this.mergeCluster(cluster);
          if (consolidated) {
            consolidatedMemories.push(consolidated);
            this.stats.mergedMemories += cluster.memories.length - 1;
          }
        } else {
          consolidatedMemories.push(cluster.memories[0]);
        }
      }

      this.updatePerformanceMetrics(startTime, memories.length, consolidatedMemories.length);
      return consolidatedMemories;
    } catch (error) {
      console.error('Consolidation error:', error);
      this.updateErrorMetrics(startTime, memories.length);
      throw error;
    }
  }

  // Memory clustering and merging
  private async clusterMemories(memories: any[]): Promise<MemoryCluster[]> {
    const clusters: MemoryCluster[] = [];
    
    for (const memory of memories) {
        let addedToCluster = false;
        
        for (const cluster of clusters) {
            if (await this.shouldAddToCluster(memory, cluster)) {
                cluster.memories.push(memory);
                // Fix: Use calculateMergedImportance instead of recalculateClusterImportance
                cluster.importance = this.calculateMergedImportance(cluster.memories);
                addedToCluster = true;
                break;
            }
        }

        if (!addedToCluster) {
            clusters.push({
                memories: [memory],
                centerMemory: memory,
                importance: memory.importance,
                timestamp: memory.timestamp
            });
        }
    }

    return clusters;
}

  private async mergeCluster(cluster: MemoryCluster): Promise<any | null> {
    try {
      const mergedContent = await this.mergeContents(cluster.memories);
      const mergedMetadata = this.mergeMetadata(cluster.memories);
      const importance = this.calculateMergedImportance(cluster.memories);

      return {
        id: crypto.randomUUID(),
        content: mergedContent,
        embedding: await this.calculateMergedEmbedding(cluster.memories),
        timestamp: Date.now(),
        tierType: this.determineTierType(importance),
        importance,
        lastAccessed: Date.now(),
        accessCount: this.sumAccessCounts(cluster.memories),
        metadata: mergedMetadata
      };
    } catch (error) {
      console.error('Cluster merging error:', error);
      return null;
    }
  }

  // Importance scoring
  private calculateMergedImportance(memories: any[]): number {
    const weights = memories.map(m => ({
      recency: this.calculateRecencyWeight(m.timestamp),
      access: this.calculateAccessWeight(m.accessCount),
      importance: m.importance
    }));

    return weights.reduce((sum, w) => 
      sum + (w.importance * w.recency * w.access), 0) / weights.length;
  }

  private calculateRecencyWeight(timestamp: number): number {
    const age = Date.now() - timestamp;
    const consolidationConfig = this.config.getConsolidationConfig();
    return Math.exp(-age / consolidationConfig.recencyDecayRate);
}

private calculateAccessWeight(accessCount: number): number {
  const consolidationConfig = this.config.getConsolidationConfig();
  return Math.min(accessCount / consolidationConfig.maxAccessCount, 1);
}

  // Merging utilities
  private async mergeContents(memories: any[]): Promise<string> {
    // Sort by importance and recency
    const sortedMemories = memories.sort((a, b) => 
      (b.importance * this.calculateRecencyWeight(b.timestamp)) -
      (a.importance * this.calculateRecencyWeight(a.timestamp))
    );

    // Combine contents with priority to more important/recent memories
    return sortedMemories
      .map(m => m.content)
      .join('\n\n')
      .trim();
  }

  private mergeMetadata(memories: any[]): any {
    const mergedMetadata: any = {};
    
    for (const memory of memories) {
      for (const [key, value] of Object.entries(memory.metadata)) {
        if (key in mergedMetadata) {
          if (typeof value === 'number') {
            mergedMetadata[key] = (mergedMetadata[key] + value) / 2;
          } else {
            mergedMetadata[key] = value;
          }
        } else {
          mergedMetadata[key] = value;
        }
      }
    }

    return mergedMetadata;
  }

  private async calculateMergedEmbedding(memories: any[]): Promise<number[]> {
    // Average the embeddings, weighted by importance
    const totalImportance = memories.reduce((sum, m) => sum + m.importance, 0);
    const dimension = memories[0].embedding.length;
    const mergedEmbedding = new Array(dimension).fill(0);

    for (const memory of memories) {
      const weight = memory.importance / totalImportance;
      for (let i = 0; i < dimension; i++) {
        mergedEmbedding[i] += memory.embedding[i] * weight;
      }
    }

    return mergedEmbedding;
  }

  // Helper methods
  private async shouldAddToCluster(memory: any, cluster: MemoryCluster): Promise<boolean> {
    const similarity = await this.calculateSimilarity(
      memory.embedding,
      cluster.centerMemory.embedding
    );
    
    return similarity >= this.consolidationThreshold;
  }

  private async calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
    // Cosine similarity implementation
    const dotProduct = embedding1.reduce((sum, val, i) => sum + val * embedding2[i], 0);
    const norm1 = Math.sqrt(embedding1.reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(embedding2.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (norm1 * norm2);
  }

  private determineTierType(importance: number): MemoryTierType {
    if (importance >= 0.8) return 'core';
    if (importance >= 0.4) return 'active';
    return 'background';
  }

  private sumAccessCounts(memories: any[]): number {
    return memories.reduce((sum, m) => sum + m.accessCount, 0);
  }

  // Monitoring and metrics
  private updatePerformanceMetrics(
    startTime: number,
    inputCount: number,
    outputCount: number
  ): void {
    const endTime = Date.now();
    const processingTime = endTime - startTime;

    this.stats.performanceMetrics = {
      processingTime,
      memoryUsage: process.memoryUsage().heapUsed,
      successRate: outputCount / inputCount
    };

    this.stats.consolidationTime = processingTime;
    this.stats.lastConsolidation = endTime;
    this.stats.totalProcessed += inputCount;
  }

  private updateErrorMetrics(startTime: number, inputCount: number): void {
    const endTime = Date.now();
    
    this.stats.performanceMetrics.processingTime = endTime - startTime;
    this.stats.performanceMetrics.successRate = 0;
    this.stats.totalProcessed += inputCount;
  }

  // Public methods for external interaction
  public getConsolidationStats(): ConsolidationStats {
    return { ...this.stats };
  }

  public async validateConsolidation(memories: any[]): Promise<boolean> {
    if (memories.length < 2) return false;
    
    const importance = this.calculateMergedImportance(memories);
    return importance >= this.consolidationThreshold;
  }

  public resetStats(): void {
    this.stats = this.initializeStats();
  }
}