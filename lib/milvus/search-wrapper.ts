// Add these imports at the top of search-wrapper.ts
import { MilvusClient } from '@zilliz/milvus2-sdk-node';
import { VectorOperations } from './vectors';
import { MemoryTierType } from '../memory/memory-schemas';
import { MilvusOperationError } from './error-handler';

export class MilvusSearchWrapper {
    private vectorOps: VectorOperations;
  
    constructor(client: MilvusClient) {
      this.vectorOps = new VectorOperations(client);
    }
  
    async search(params: SearchParams): Promise<any[]> {
      try {
        // Prepare search parameters with proper vector formatting
        const searchParams = {
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
  
    private async fallbackSearch(params: SearchParams): Promise<any[]> {
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
  
        const response = await this.vectorOps.client.search(basicParams);
        
        if (!response || !response.results) {
          throw new Error('No results returned from search');
        }
  
        return response.results;
      } catch (error: unknown) {
        console.error('Fallback search failed:', error);
        throw new MilvusOperationError('Fallback search failed', error);
      }
    }
  }