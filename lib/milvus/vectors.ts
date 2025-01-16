import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { MemoryTierType } from '../memory/memory-schemas';

// Define SearchParams interface since it's not exported from Milvus SDK
interface SearchParams {
  nprobe: number;
  ef: number;
  metric_type: string;
}

// Define memory config interface
interface MemoryConfig {
  dimensions: number;
  indexParams: Record<MemoryTierType, any>;
  searchParams: Record<MemoryTierType, SearchParams>;
}

// Default memory configuration
const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  dimensions: 1536,
  indexParams: {
    core: { index_type: 'IVF_SQ8', metric_type: 'L2', params: { nlist: 1024 } },
    active: { index_type: 'IVF_FLAT', metric_type: 'L2', params: { nlist: 512 } },
    background: { index_type: 'IVF_FLAT', metric_type: 'L2', params: { nlist: 256 } }
  },
  searchParams: {
    core: { nprobe: 256, ef: 512, metric_type: 'L2' },
    active: { nprobe: 128, ef: 256, metric_type: 'L2' },
    background: { nprobe: 64, ef: 128, metric_type: 'L2' }
  }
};

interface VectorSearchParams {
  collection: string;
  vector: number[];
  limit?: number;
  offset?: number;
  filter?: string;
  tierType?: MemoryTierType;
  nq?: number; 
}

interface VectorInsertParams {
  collection: string;
  vectors: number[][];
  metadata: Record<string, any>[];
  tierType: MemoryTierType;
}

interface SearchResponse {
  results: Array<{
    id: string;
    distance: number;
    [key: string]: any;
  }>;
}

export class VectorOperations {
  private client: MilvusClient;
  private config: MemoryConfig;
  private searchParamsByTier: Record<MemoryTierType, SearchParams>;

  constructor(client: MilvusClient, config: MemoryConfig = DEFAULT_MEMORY_CONFIG) {
    this.client = client;
    this.config = config;
    this.searchParamsByTier = config.searchParams;
  }

  async searchVectors(params: VectorSearchParams): Promise<any[]> {
    const { 
      collection, 
      vector, 
      limit = 10, 
      offset = 0, 
      filter, 
      tierType,
      nq = 1 // Add default value
    } = params;
  
    const searchParams = {
      collection_name: collection,
      vectors: [vector],
      nq: nq, // Use the parameter value instead of hardcoding
      search_params: tierType ? 
        this.searchParamsByTier[tierType] : 
        this.searchParamsByTier.core,
      limit,
      offset,
      filter
    };
  
    try {
      const response = await this.client.search(searchParams);
      return this.processSearchResults(response.results);
    } catch (error) {
      console.error('Error in vector search:', error);
      throw error;
    }
  }

  async batchInsertVectors(params: VectorInsertParams): Promise<string[]> {
    const { collection, vectors, metadata, tierType } = params;

    try {
      const partitionTag = this.getPartitionTag(tierType);
      
      const insertData = vectors.map((vector, index) => ({
        vector,
        ...metadata[index],
        tier_type: tierType,
        timestamp: Date.now()
      }));

      const response = await this.client.insert({
        collection_name: collection,
        data: insertData
      });

      return Array.isArray(response.insertIds) ? response.insertIds : [];
    } catch (error) {
      console.error('Error in batch vector insertion:', error);
      throw error;
    }
  }

  private async searchSingleTier(
    tierType: MemoryTierType,
    vector: number[],
    limit: number,
    filter?: string,
    nq: number = 1  // Add default parameter
  ): Promise<any[]> {
    const searchParams = {
      collection_name: `memory_${tierType}`,
      vectors: [vector],
      nq: nq,  // Use the parameter
      search_params: this.searchParamsByTier[tierType],
      limit,
      filter,
      output_fields: ['*']
    };
  
    try {
      const response = await this.client.search(searchParams);
      return this.processSearchResults(response.results);
    } catch (error) {
      console.error('Error in single tier search:', error);
      throw error;
    }
  }

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

  private getPartitionTag(tierType: MemoryTierType): string {
    return `partition_${tierType}`;
  }

  private processSearchResults(results: Array<{ id: string; distance: number; [key: string]: any }>): any[] {
    return results.map(result => ({
      ...result,
      score: 1 - result.distance
    }));
  }

  async createIndex(tierType: MemoryTierType): Promise<void> {
    await this.client.createIndex({
      collection_name: 'memories',
      field_name: 'vector',
      extra_params: this.config.indexParams[tierType]
    });
  }

  
async getCollectionStats(collectionName: string) {
  try {
    const response = await this.client.describeCollection({
      collection_name: collectionName
    });
    return response.statistics || { row_count: 0 };
  } catch (error) {
    console.error('Error getting collection statistics:', error);
    throw error;
  }
}
}