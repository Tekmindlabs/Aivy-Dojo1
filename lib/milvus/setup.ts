// lib/milvus/setup.ts

import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';

export async function setupMemoryCollection(client: MilvusClient) {
  const collectionName = 'memories';
  const dim = 1024; // Changed to match your existing VECTOR_DIM constant from collections.ts

  const createCollectionParams = {
    collection_name: collectionName,
    fields: [
      {
        name: 'id',
        data_type: DataType.VARCHAR,
        is_primary_key: true,
        max_length: 36
      },
      {
        name: 'embedding',
        data_type: DataType.FLOAT_VECTOR,
        dim
      },
      {
        name: 'userId',
        data_type: DataType.VARCHAR,
        max_length: 100
      },
      {
        name: 'schemaName',
        data_type: DataType.VARCHAR,
        max_length: 50
      },
      {
        name: 'content',
        data_type: DataType.VARCHAR,
        max_length: 65535
      }
    ],
    enable_dynamic_field: true
  };

  try {
    await client.createCollection(createCollectionParams);
    
    // Create index for similarity search
    await client.createIndex({
      collection_name: collectionName,
      field_name: 'embedding',
      index_type: 'IVF_FLAT',
      metric_type: 'COSINE',
      params: { nlist: 1024 }
    });

    await client.loadCollectionSync({ collection_name: collectionName });
    
    console.log('Memory collection setup completed successfully');
  } catch (error) {
    console.error('Error setting up memory collection:', error);
    throw error;
  }
}