// /tests/memory/__mocks__/mock-data.ts

export const mockMemories = [
    {
      id: '1',
      content: 'Test memory 1',
      embedding: new Array(384).fill(0.1),
      timestamp: Date.now(),
      tierType: 'active',
      importance: 0.7,
      lastAccessed: Date.now(),
      accessCount: 5,
      metadata: {
        emotional_value: 0.6,
        context_relevance: 0.8
      }
    },
    // Add more mock memories...
  ];
  
  export const mockEmbeddings = {
    '1': new Array(384).fill(0.1),
    '2': new Array(384).fill(0.2),
    // Add more mock embeddings...
  };
  
  export const mockMetadata = {
    '1': {
      emotional_value: 0.6,
      context_relevance: 0.8
    },
    // Add more mock metadata...
  };