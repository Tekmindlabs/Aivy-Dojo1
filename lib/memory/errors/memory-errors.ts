export class MemoryServiceError extends Error {
    constructor(
      message: string, 
      public readonly code: string,
      public readonly details?: any
    ) {
      super(message);
      this.name = 'MemoryServiceError';
    }
  }
  
  export const MemoryErrorCodes = {
    UPDATE_FAILED: 'MEMORY_UPDATE_FAILED',
    CONSOLIDATION_FAILED: 'MEMORY_CONSOLIDATION_FAILED',
    RETRIEVAL_FAILED: 'MEMORY_RETRIEVAL_FAILED',
    INVALID_TIER: 'INVALID_MEMORY_TIER',
    STORAGE_FAILED: 'MEMORY_STORAGE_FAILED'
  } as const;
  
  // Usage in memory-service.ts
  try {
    await this.milvusClient.update(/* ... */);
  } catch (error) {
    throw new MemoryServiceError(
      'Failed to update memory context',
      MemoryErrorCodes.UPDATE_FAILED,
      { originalError: error }
    );
  }