// vectors.ts

import { MilvusClient, DataType, SearchParams } from '@zilliz/milvus2-sdk-node';
import { MemoryTierType } from '../memory/memory-schemas';
import { MEMORY_CONFIG } from '../../config/memory-config';

interface VectorSearchParams {
  collection: string;
  vector: number[];
  limit?: number;
  offset?: number;
  filter?: string;
  tierType?: MemoryTierType;
}

interface VectorInsertParams {
  collection: string;
  vectors: number[][];
  metadata: Record<string, any>[];
  tierType: MemoryTierType;
}

export class VectorOperations {
  private client: MilvusClient;
  private config: typeof MEMORY_CONFIG;
  private searchParamsByTier: Record<MemoryTierType, SearchParams>;

  constructor(client: MilvusClient, config = MEMORY_CONFIG) {
    this.client = client;
    this.config = config;
    this.searchParamsByTier = {
      core: {
        nprobe: 256,
        ef: 512,
        metric_type: 'L2'
      },
      active: {
        nprobe: 128,
        ef: 256,
        metric_type: 'L2'
      },
      background: {
        nprobe: 64,
        ef: 128,
        metric_type: 'L2'
      }
    };
  }

  // Tiered Search Implementation
  async searchVectors(params: VectorSearchParams): Promise<any[]> {
    const { collection, vector, limit = 10, offset = 0, filter, tierType } = params;

    if (tierType) {
      // Single tier search
      return this.searchSingleTier(tierType, vector, limit, filter);
    } else {
      // Cascading search through tiers
      return this.searchAcrossTiers(vector, limit);
    }
  }

  // Batch Vector Processing
  async batchInsertVectors(params: VectorInsertParams): Promise<string[]> {
    const { collection, vectors, metadata, tierType } = params;

    try {
      const partitionTag = this.getPartitionTag(tierType);
      
      const insertData = vectors.map((vector, index) => ({
        vector,
        ...metadata[index],
        tier_type: tierType,
        partition_tag: partitionTag,
        timestamp: Date.now()
      }));

      const response = await this.client.insert({
        collection_name: collection,
        partition_name: partitionTag,
        data: insertData
      });

      return response.ids as string[];
    } catch (error) {
      console.error('Error in batch vector insertion:', error);
      throw error;
    }
  }

  // Tier-specific Search Implementation
  private async searchSingleTier(
    tierType: MemoryTierType,
    vector: number[],
    limit: number,
    filter?: string
  ): Promise<any[]> {
    const searchParams = this.searchParamsByTier[tierType];
    const partitionTag = this.getPartitionTag(tierType);

    const response = await this.client.search({
      collection_name: `memory_${tierType}`,
      partition_names: [partitionTag],
      vectors: [vector],
      search_params: searchParams,
      limit,
      filter,
      output_fields: ['*']
    });

    return this.processSearchResults(response);
  }

  // Cascading Search Across Tiers
  private async searchAcrossTiers(
    vector: number[],
    totalLimit: number
  ): Promise<any[]> {
    const results: any[] = [];
    const tiers: MemoryTierType[] = ['core', 'active', 'background'];

    for (const tier of tiers) {
      if (results.length >= totalLimit) break;

      const tierLimit = totalLimit - results.length;
      const tierResults = await this.searchSingleTier(tier, vector, tierLimit);
      results.push(...tierResults);
    }

    return results;
  }

  // Partition Management
  async createPartitions(): Promise<void> {
    const tiers: MemoryTierType[] = ['core', 'active', 'background'];

    for (const tier of tiers) {
      const partitionTag = this.getPartitionTag(tier);
      await this.client.createPartition({
        collection_name: 'memories',
        partition_name: partitionTag
      });
    }
  }

  // Vector Maintenance Operations
  async optimizeVectors(tierType: MemoryTierType): Promise<void> {
    const partitionTag = this.getPartitionTag(tierType);
    
    await this.client.compact({
      collection_name: 'memories',
      partition_names: [partitionTag]
    });
  }

  // Batch Delete Operations
  async batchDeleteVectors(ids: string[], tierType: MemoryTierType): Promise<void> {
    const partitionTag = this.getPartitionTag(tierType);

    await this.client.delete({
      collection_name: 'memories',
      partition_name: partitionTag,
      ids
    });
  }

  // Update Vector Operations
  async updateVectorMetadata(
    id: string,
    metadata: Record<string, any>,
    tierType: MemoryTierType
  ): Promise<void> {
    await this.client.update({
      collection_name: 'memories',
      partition_name: this.getPartitionTag(tierType),
      ids: [id],
      data: metadata
    });
  }

  // Helper Methods
  private getPartitionTag(tierType: MemoryTierType): string {
    return `partition_${tierType}`;
  }

  private processSearchResults(results: any): any[] {
    return results.map(result => ({
      ...result,
      score: 1 - result.distance // Normalize distance to similarity score
    }));
  }

  // Performance Optimization Methods
  private async loadPartition(tierType: MemoryTierType): Promise<void> {
    await this.client.loadPartitions({
      collection_name: 'memories',
      partition_names: [this.getPartitionTag(tierType)]
    });
  }

  private async releasePartition(tierType: MemoryTierType): Promise<void> {
    await this.client.releasePartitions({
      collection_name: 'memories',
      partition_names: [this.getPartitionTag(tierType)]
    });
  }

  // Index Management
  async createIndex(tierType: MemoryTierType): Promise<void> {
    const indexParams = {
      core: { index_type: 'IVF_SQ8', metric_type: 'L2', params: { nlist: 1024 } },
      active: { index_type: 'IVF_FLAT', metric_type: 'L2', params: { nlist: 512 } },
      background: { index_type: 'IVF_FLAT', metric_type: 'L2', params: { nlist: 256 } }
    };

    await this.client.createIndex({
      collection_name: 'memories',
      field_name: 'vector',
      index_name: `index_${tierType}`,
      index_params: indexParams[tierType]
    });
  }

  // Statistics and Monitoring
  async getPartitionStats(tierType: MemoryTierType): Promise<any> {
    const stats = await this.client.getCollectionStats({
      collection_name: 'memories',
      partition_name: this.getPartitionTag(tierType)
    });

    return {
      tierType,
      ...stats
    };
  }
}