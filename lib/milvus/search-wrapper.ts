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

  async search(params: {
    collection: string;
    vector: number[];
    limit?: number;
    filter?: string;
    tierType?: MemoryTierType;
  }): Promise<any[]> {
    const searchParams = {
      ...params,
      nq: 1, // Explicitly set nq
      vectors: Array.isArray(params.vector) ? params.vector : [params.vector]
    };

    try {
      return await this.vectorOps.searchVectors(searchParams);
    } catch (error: unknown) { // Add type annotation for error
      if (error instanceof Error && error.message?.includes('nq')) {
        // Fallback to basic search
        return this.fallbackSearch(params);
      }
      throw error;
    }
  }

  private async fallbackSearch(params: any): Promise<any[]> {
    const basicParams = {
      collection_name: params.collection,
      vectors: [params.vector],
      nq: 1,
      search_params: {
        nprobe: 10,
        metric_type: "L2"
      },
      limit: params.limit || 10
    };

    const response = await this.vectorOps.client.search(basicParams);
    return response.results || [];
  }
}