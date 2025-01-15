import { getMilvusClient } from './client';
import { v4 as uuidv4 } from 'uuid';
import { VectorResult } from '../knowledge/types';

export interface MemoryVectorMetadata {
  userId: string;
  schemaName: string;
  content: string;
  timestamp: string;
}

/**
 * Inserts a vector into the Milvus database with enhanced logging and error handling
 */
export async function insertVector({
  userId,
  contentType,
  contentId,
  embedding,
  metadata = {}
}: {
  userId: string;
  contentType: string;
  contentId: string;
  embedding: number[];
  metadata?: Record<string, any>;
}): Promise<VectorResult> {
  // [Previous implementation remains the same]
  // ... existing implementation ...
}

/**
 * Inserts a memory vector into the Milvus database
 */
export async function insertMemoryVector({
  id,
  values,
  metadata
}: {
  id: string;
  values: number[];
  metadata: MemoryVectorMetadata;
}): Promise<void> {
  try {
    console.log('Starting memory vector insertion:', {
      id,
      userId: metadata.userId,
      schemaName: metadata.schemaName,
      embeddingDimension: values.length
    });

    const client = await getMilvusClient();
    console.log('Milvus client connected for memory insertion');

    // Verify embedding dimension
    if (values.length !== 1024) {
      const error = new Error(`Invalid memory embedding dimension: ${values.length}, expected 1024`);
      console.error('Memory embedding validation failed:', error);
      throw error;
    }

    // Prepare memory insertion data
    const insertData = {
      id,
      embedding: values,
      user_id: metadata.userId,
      schema_name: metadata.schemaName,
      content: metadata.content,
      timestamp: metadata.timestamp
    };

    // Perform memory insertion
    await client.insert({
      collection_name: 'memories',
      data: [insertData]
    });

    console.log('Memory vector inserted successfully:', {
      id,
      userId: metadata.userId,
      schemaName: metadata.schemaName,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Memory vector insertion failed:', {
      error: error instanceof Error ? error.message : String(error),
      id,
      userId: metadata.userId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Searches for similar content in the Milvus database with enhanced logging
 */
export async function searchSimilarContent({
  userId,
  embedding,
  limit = 5,
  contentTypes = ['document', 'url', 'note']
}: {
  userId: string;
  embedding: number[];
  limit?: number;
  contentTypes?: string[];
}) {
  // [Previous implementation remains the same]
  // ... existing implementation ...
}

/**
 * Searches for similar memories in the Milvus database
 */
export async function searchSimilarMemories(
  embedding: number[],
  limit: number,
  filters: {
    userId: string;
    schemaName?: string;
  }
): Promise<Array<{
  id: string;
  metadata: MemoryVectorMetadata;
  score: number;
}>> {
  try {
    console.log('Starting memory similarity search:', {
      userId: filters.userId,
      schemaName: filters.schemaName,
      embeddingDimension: embedding.length,
      limit
    });

    const client = await getMilvusClient();
    console.log('Milvus client connected for memory search');

    // Verify embedding dimension
    if (embedding.length !== 1024) {
      const error = new Error(`Invalid memory search embedding dimension: ${embedding.length}`);
      console.error('Memory search embedding validation failed:', error);
      throw error;
    }

    // Prepare memory search filter
    let filter = `user_id == "${filters.userId}"`;
    if (filters.schemaName) {
      filter += ` && schema_name == "${filters.schemaName}"`;
    }
    console.log('Applying memory search filter:', filter);

    // Perform memory search
    const results = await client.search({
      collection_name: 'memories',
      vector: embedding,
      filter: filter,
      limit,
      output_fields: ['user_id', 'schema_name', 'content', 'timestamp'],
      params: {
        nprobe: 10,
        metric_type: 'L2'
      }
    });

    console.log('Memory search completed successfully:', {
      resultCount: results.length,
      timestamp: new Date().toISOString()
    });

    return results.map(result => ({
      id: result.id,
      metadata: {
        userId: result.user_id,
        schemaName: result.schema_name,
        content: result.content,
        timestamp: result.timestamp
      },
      score: result.score
    }));

  } catch (error: unknown) {
    console.error('Memory similarity search failed:', {
      error: error instanceof Error ? error.message : String(error),
      userId: filters.userId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Updates an existing memory vector in the Milvus database
 */
export async function updateMemoryVector({
  id,
  values,
  metadata
}: {
  id: string;
  values: number[];
  metadata: MemoryVectorMetadata;
}): Promise<void> {
  try {
    console.log('Starting memory vector update:', {
      id,
      userId: metadata.userId,
      schemaName: metadata.schemaName
    });

    const client = await getMilvusClient();

    // Delete existing vector
    await client.delete({
      collection_name: 'memories',
      expr: `id == "${id}"`
    });

    // Insert updated vector
    await insertMemoryVector({ id, values, metadata });

    console.log('Memory vector updated successfully:', {
      id,
      timestamp: new Date().toISOString()
    });

  } catch (error: unknown) {
    console.error('Memory vector update failed:', {
      error: error instanceof Error ? error.message : String(error),
      id,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

/**
 * Utility function to validate embedding dimension
 */
function validateEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding)) {
    console.error('Invalid embedding format: not an array');
    return false;
  }
  
  if (embedding.length !== 1024) {
    console.error(`Invalid embedding dimension: ${embedding.length}`);
    return false;
  }
  
  return true;
}