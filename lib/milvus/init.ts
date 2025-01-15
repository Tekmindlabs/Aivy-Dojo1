
import { getMilvusClient } from './client';

export async function initializeMilvusCollections() {
  try {
    const client = await getMilvusClient();
    
    // Create content_vectors collection
    await client.createCollection({
      collection_name: 'content_vectors',
      fields: [
        { name: 'id', type: 'VarChar', is_primary_key: true, max_length: 36 },
        { name: 'user_id', type: 'VarChar', max_length: 36 },
        { name: 'content_type', type: 'VarChar', max_length: 50 },
        { name: 'content_id', type: 'VarChar', max_length: 36 },
        { name: 'metadata', type: 'JSON' },
        { name: 'embedding', type: 'FloatVector', dim: 1024 }
      ]
    });

    // Create knowledge_graph collection
    await client.createCollection({
      collection_name: 'knowledge_graph',
      fields: [
        { name: 'id', type: 'VarChar', is_primary_key: true, max_length: 36 },
        { name: 'user_id', type: 'VarChar', max_length: 36 },
        { name: 'source_id', type: 'VarChar', max_length: 36 },
        { name: 'target_id', type: 'VarChar', max_length: 36 },
        { name: 'relationship_type', type: 'VarChar', max_length: 50 },
        { name: 'metadata', type: 'JSON' }
      ]
    });

    console.log('Milvus collections initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Milvus collections:', error);
    throw error;
  }
}