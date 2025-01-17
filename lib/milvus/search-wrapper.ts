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
  output_fields?: string[];
  filter?: string;
}

export class MilvusSearchWrapper {
  private vectorOps: VectorOperations;

  constructor(client: MilvusClient) {
    this.vectorOps = new VectorOperations(client);
  }

  async search(params: VectorSearchParams): Promise<any[]> {
    try {
      // Validate search parameters
      this.validateSearchParams(params);

      // Prepare search parameters with proper vector formatting
      const searchParams: VectorSearchParams = {
        collection: params.collection,
        vector: params.vector,
        nq: 1, // Explicitly set nq
        limit: params.limit || 10,
        filter: params.filter,
        tierType: params.tierType,
        output_fields: ['*'] // Ensure all fields are returned
      };

      // Attempt primary search
      const results = await this.vectorOps.searchVectors(searchParams);
      
      if (!results || results.length === 0) {
        console.log('No results found in primary search, attempting fallback');
        return this.fallbackSearch(params);
      }

      return this.processResults(results);

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

  private validateSearchParams(params: VectorSearchParams): void {
    if (!params.collection) {
      throw new Error('Collection name is required');
    }
    if (!Array.isArray(params.vector) || params.vector.length === 0) {
      throw new Error('Valid vector array is required');
    }
    if (params.limit && (typeof params.limit !== 'number' || params.limit <= 0)) {
      throw new Error('Limit must be a positive number');
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
        limit: params.limit || 10,
        output_fields: ['*']
      };

      if (params.filter) {
        basicParams.filter = params.filter;
      }

      // Use vectorOps.searchVectors with properly formatted parameters
      const searchParams: VectorSearchParams = {
        collection: params.collection,
        vector: params.vector,
        limit: params.limit || 10,
        filter: params.filter,
        nq: 1,
        output_fields: ['*']
      };

      const results = await this.vectorOps.searchVectors(searchParams);
      
      if (!results || results.length === 0) {
        console.warn('No results returned from fallback search');
        return [];
      }

      return this.processResults(results);

    } catch (error: unknown) {
      console.error('Fallback search failed:', error);
      throw new MilvusOperationError('Fallback search failed', error);
    }
  }

  private processResults(results: any[]): any[] {
    return results.map(result => ({
      id: result.id,
      score: result.score,
      embedding: result.embedding,
      metadata: result.metadata || {},
      content: result.content,
      tierType: result.tierType || 'active',
      timestamp: result.timestamp || Date.now(),
      lastAccessed: result.lastAccessed || Date.now(),
      accessCount: result.accessCount || 0
    }));
  }

  // Utility method to handle retries
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt === maxRetries) break;
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
    
    throw lastError || new Error('Operation failed after retries');
  }
}