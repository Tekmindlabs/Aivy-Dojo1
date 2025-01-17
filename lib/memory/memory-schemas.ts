import { DataType } from '@zilliz/milvus2-sdk-node';

export enum EmotionalState {
  POSITIVE = 'positive',
  NEGATIVE = 'negative',
  NEUTRAL = 'neutral'
}

export enum MemoryTier {
  CORE = 'core',
  ACTIVE = 'active',
  BACKGROUND = 'background'
}


// Base schema interface for common fields across all memory types
interface BaseMemorySchema {
  id: string;
  dimension: number;
  dataType: DataType;
  description?: string;
  fields: Record<string, any>;
  indexes?: Record<string, any>;
}

export interface MemoryMetadata {
  emotional_value: number;
  context_relevance: number;
  emotional_state?: EmotionalState;
  source?: string;
  tags?: string[];
  category?: string;
  confidence?: number;
  relationships?: {
    connectedMemories?: string[];
    strength?: number;
  };
  userContext?: {
    userId?: string;
    sessionId?: string;
    interactionType?: string;
  };
  processingMetadata?: {
    compressionRatio?: number;
    processingTimestamp?: number;
    version?: string;
  };
}

// Memory field definitions
export const MEMORY_FIELDS = {
  ID: 'id',
  CONTENT: 'content',
  EMBEDDING: 'embedding',
  TIMESTAMP: 'timestamp',
  TIER_TYPE: 'tier_type',
  IMPORTANCE: 'importance',
  LAST_ACCESSED: 'last_accessed',
  ACCESS_COUNT: 'access_count',
  EMOTIONAL_VALUE: 'emotional_value',
  CONTEXT_RELEVANCE: 'context_relevance',
  SOURCE: 'source',
  METADATA: 'metadata'
} as const;

// Common fields shared across all memory schemas
const commonFields = {
  [MEMORY_FIELDS.ID]: {
    dataType: DataType.VARCHAR,
    description: 'Unique identifier for the memory',
    primaryKey: true,
    maxLength: 36
  },
  [MEMORY_FIELDS.CONTENT]: {
    dataType: DataType.VARCHAR,
    description: 'Text content of the memory',
    maxLength: 65535
  },
  [MEMORY_FIELDS.EMBEDDING]: {
    dataType: DataType.FLOAT_VECTOR,
    description: 'Vector embedding of the memory content',
    dimension: 1024
  },
  [MEMORY_FIELDS.TIMESTAMP]: {
    dataType: DataType.INT64,
    description: 'Creation timestamp of the memory'
  },
  [MEMORY_FIELDS.TIER_TYPE]: {
    dataType: DataType.VARCHAR,
    description: 'Memory tier classification',
    maxLength: 20
  },
  [MEMORY_FIELDS.IMPORTANCE]: {
    dataType: DataType.FLOAT,
    description: 'Importance score of the memory',
    range: [0, 1]
  },
  [MEMORY_FIELDS.LAST_ACCESSED]: {
    dataType: DataType.INT64,
    description: 'Last access timestamp'
  },
  [MEMORY_FIELDS.ACCESS_COUNT]: {
    dataType: DataType.INT64,
    description: 'Number of times memory has been accessed'
  }
};

// Metadata fields for additional memory attributes
const metadataFields = {
  [MEMORY_FIELDS.EMOTIONAL_VALUE]: {
    dataType: DataType.FLOAT,
    description: 'Emotional significance score',
    range: [0, 1]
  },
  [MEMORY_FIELDS.CONTEXT_RELEVANCE]: {
    dataType: DataType.FLOAT,
    description: 'Contextual relevance score',
    range: [0, 1]
  },
  [MEMORY_FIELDS.SOURCE]: {
    dataType: DataType.VARCHAR,
    description: 'Source of the memory',
    maxLength: 255
  }
};

// Export types for TypeScript support
export type MemoryTierType = keyof typeof MemoryTier;
export type MemoryField = keyof typeof MEMORY_FIELDS;

// Schema definitions for each memory tier
export const CORE_MEMORY: BaseMemorySchema = {
  id: 'core_memory',
  dimension: 1536,
  dataType: DataType.FLOAT_VECTOR,
  description: 'High-importance, frequently accessed memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    retention_priority: {
      dataType: DataType.FLOAT,
      description: 'Priority score for retention',
      range: [0, 1]
    }
  },
  indexes: {
    embedding_index: {
      indexType: 'IVF_FLAT',
      metricType: 'L2',
      params: { nlist: 1024 }
    }
  }
};

export const ACTIVE_MEMORY: BaseMemorySchema = {
  id: 'active_memory',
  dimension: 1536,
  dataType: DataType.FLOAT_VECTOR,
  description: 'Medium-importance, recently accessed memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    promotion_score: {
      dataType: DataType.FLOAT,
      description: 'Score for promotion to core memory',
      range: [0, 1]
    }
  },
  indexes: {
    embedding_index: {
      indexType: 'IVF_SQ8',
      metricType: 'L2',
      params: { nlist: 2048 }
    }
  }
};

export const BACKGROUND_MEMORY: BaseMemorySchema = {
  id: 'background_memory',
  dimension: 1536,
  dataType: DataType.FLOAT_VECTOR,
  description: 'Low-importance or older memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    decay_rate: {
      dataType: DataType.FLOAT,
      description: 'Rate at which memory importance decays',
      range: [0, 1]
    }
  },
  indexes: {
    embedding_index: {
      indexType: 'IVF_SQ8',
      metricType: 'L2',
      params: { nlist: 4096 }
    }
  }
};

// Collection creation parameters with proper typing
export const COLLECTION_PARAMS: Record<MemoryTier, {
  description: string;
  schema: BaseMemorySchema;
}> = {
  [MemoryTier.CORE]: {
    description: 'Core memory collection',
    schema: CORE_MEMORY
  },
  [MemoryTier.ACTIVE]: {
    description: 'Active memory collection',
    schema: ACTIVE_MEMORY
  },
  [MemoryTier.BACKGROUND]: {
    description: 'Background memory collection',
    schema: BACKGROUND_MEMORY
  }
};


// Utility functions for schema operations with proper typing
export const SchemaUtils = {
  validateMemory: (memory: any, tierType: MemoryTierType) => {
    const schema = COLLECTION_PARAMS[tierType].schema;
    // Add validation implementation
  },

  getSchemaForTier: (tierType: MemoryTierType): BaseMemorySchema => {
    return COLLECTION_PARAMS[tierType].schema;
  },

  isValidTierType: (tierType: string): tierType is MemoryTierType => {
    return Object.values(MemoryTier).includes(tierType as MemoryTier);
  }
};

export interface MemorySchema {
  fields: Record<string, any>;
  indexes: Record<string, any>;
}

export interface Memory {
  id: string;
  content: string;
  embedding: number[];
  timestamp: number;
  tierType: MemoryTierType;
  importance: number;
  lastAccessed: number;
  accessCount: number;
  metadata: MemoryMetadata;
}
