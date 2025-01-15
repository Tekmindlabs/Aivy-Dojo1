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
  try {
    console.log('Starting vector insertion:', {
      userId,
      contentType,
      contentId,
      embeddingDimension: embedding.length,
      metadataKeys: Object.keys(metadata)
    });

    const client = await getMilvusClient();
    console.log('Milvus client connected successfully');

    if (!validateEmbedding(embedding)) {
      throw new Error(`Invalid embedding dimension: ${embedding.length}, expected 1024`);
    }

    const vectorId = uuidv4();
    console.log('Generated vector ID:', vectorId);

    const insertData = {
      id: vectorId,
      user_id: userId,
      content_type: contentType,
      content_id: contentId,
      embedding: embedding,
      metadata: JSON.stringify(metadata)
    };

    console.log('Preparing to insert vector data:', {
      vectorId,
      userId,
      contentType,
      contentId,
      metadataSize: JSON.stringify(metadata).length
    });

    await client.insert({
      collection_name: 'content_vectors',
      data: [insertData]
    });

    console.log('Vector inserted successfully:', {
      vectorId,
      timestamp: new Date().toISOString()
    });

    return {
      id: vectorId,
      user_id: userId,
      content_type: contentType,
      content_id: contentId,
      metadata: JSON.stringify(metadata)
    };

  } catch (error: unknown) {
    console.error('Vector insertion failed:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      contentId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
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

    if (!validateEmbedding(values)) {
      throw new Error(`Invalid memory embedding dimension: ${values.length}`);
    }

    const insertData = {
      id,
      embedding: values,
      user_id: metadata.userId,
      schema_name: metadata.schemaName,
      content: metadata.content,
      timestamp: metadata.timestamp
    };

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

    return;

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
}): Promise<VectorResult[]> {
  try {
    console.log('Starting similarity search:', {
      userId,
      embeddingDimension: embedding.length,
      limit,
      contentTypes
    });

    const client = await getMilvusClient();
    console.log('Milvus client connected for search');

    // Verify embedding dimension
    if (embedding.length !== 1024) { 
      const error = new Error(`Invalid search embedding dimension: ${embedding.length}`);
      console.error('Search embedding validation failed:', error);
      throw error;
    }

    const filter = `user_id == "${userId}" && content_type in ${JSON.stringify(contentTypes)}`;
    console.log('Applying search filter:', filter);

    const searchResult = await client.search({
      collection_name: 'content_vectors',
      vector: embedding,
      filter: filter,
      limit,
      output_fields: ['content_type', 'content_id', 'metadata'],
      params: { 
        nprobe: 10,
        metric_type: 'L2'
      }
    });

    // Add null check and ensure results is an array
    if (!searchResult || !searchResult.results) {
      console.warn('No results returned from search:', {
        userId,
        timestamp: new Date().toISOString()
      });
      return [];
    }

    console.log('Search completed successfully:', {
      resultCount: searchResult.results.length,
      timestamp: new Date().toISOString()
    });

    // Map the results to the expected format
    return searchResult.results.map(result => ({
      id: result.id,
      user_id: userId,
      content_type: result.content_type,
      content_id: result.content_id,
      metadata: result.metadata,
      score: result.score
    }));

  } catch (error: unknown) {
    console.error('Similarity search failed:', {
      error: error instanceof Error ? error.message : String(error),
      userId,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
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

    if (!validateEmbedding(embedding)) {
      throw new Error(`Invalid memory search embedding dimension: ${embedding.length}`);
    }

    let filter = `user_id == "${filters.userId}"`;
    if (filters.schemaName) {
      filter += ` && schema_name == "${filters.schemaName}"`;
    }
    console.log('Applying memory search filter:', filter);

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

    await client.deleteEntities({
      collection_name: 'memories',
      expr: `id == "${id}"`
    });

    await insertMemoryVector({ id, values, metadata });

    console.log('Memory vector updated successfully:', {
      id,
      timestamp: new Date().toISOString()
    });

    return;

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
  
  // Change this to match your Milvus collection dimension
  const EXPECTED_DIMENSION = 1024; // or 1024, depending on your collection
  
  if (embedding.length !== EXPECTED_DIMENSION) {
    console.error(`Invalid embedding dimension: ${embedding.length}, expected ${EXPECTED_DIMENSION}`);
    return false;
  }
  
  return true;
}