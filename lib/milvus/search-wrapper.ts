import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { VectorOperations, VectorSearchParams } from './vectors';
import { MemoryTierType } from '../memory/memory-schemas';
import { MilvusOperationError } from './error-handler';

interface MilvusSearchParams {
  collection_name: string;
  vectors: number[][];
  nq: number;
  search_params: {
    nprobe: number;
    metric_type: string;
  };
  limit: number;
  filter?: string;
}

export class MilvusSearchWrapper {
  private vectorOps: VectorOperations;

  constructor(client: MilvusClient) {
    this.vectorOps = new VectorOperations(client);
  }

  async search(params: VectorSearchParams): Promise<any[]> {
    try {
      // Prepare search parameters with proper vector formatting
      const searchParams: VectorSearchParams = {
        collection: params.collection,
        vector: params.vector,
        nq: 1, // Explicitly set nq
        limit: params.limit || 10,
        filter: params.filter,
        tierType: params.tierType
      };

      // Attempt primary search
      return await this.vectorOps.searchVectors(searchParams);
    } catch (error: unknown) {
      // Handle specific error cases
      if (error instanceof Error) {
        console.error('Search error:', error.message);
        
        if (error.message.includes('nq')) {
          console.log('Falling back to basic search due to nq parameter issue');
          return this.fallbackSearch(params);
        }

        if (error.message.includes('collection not found')) {
          throw new MilvusOperationError('Collection does not exist', error);
        }
      }
      
      // Re-throw unknown errors
      throw new MilvusOperationError('Unexpected search error', error);
    }
  }

  private async fallbackSearch(params: VectorSearchParams): Promise<any[]> {
    try {
      const basicParams: MilvusSearchParams = {
        collection_name: params.collection,
        vectors: [params.vector], // Ensure vector is wrapped in array
        nq: 1,
        search_params: {
          nprobe: 10,
          metric_type: "L2"
        },
        limit: params.limit || 10
      };

      if (params.filter) {
        basicParams.filter = params.filter;
      }

      // Use vectorOps.searchVectors instead of direct client access
      const searchParams: VectorSearchParams = {
        collection: params.collection,
        vector: params.vector,
        limit: params.limit || 10,
        filter: params.filter,
        nq: 1
      };

      const results = await this.vectorOps.searchVectors(searchParams);
      
      if (!results || results.length === 0) {
        throw new Error('No results returned from search');
      }

      return results;
    } catch (error: unknown) {
      console.error('Fallback search failed:', error);
      throw new MilvusOperationError('Fallback search failed', error);
    }
  }
}