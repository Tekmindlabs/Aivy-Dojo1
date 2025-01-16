// memory-schemas.ts

import { DataType } from '@zilliz/milvus2-sdk-node';

// Base schema interface for common fields across all memory types
interface BaseMemorySchema {
  id: string;
  dimension: number;
  dataType: DataType;
  description?: string;
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
};

// Common fields shared across all memory schemas
const commonFields = {
  [MEMORY_FIELDS.ID]: {
    dataType: DataType.VarChar,
    description: 'Unique identifier for the memory',
    primaryKey: true,
    maxLength: 36
  },
  [MEMORY_FIELDS.CONTENT]: {
    dataType: DataType.VarChar,
    description: 'Text content of the memory',
    maxLength: 65535
  },
  [MEMORY_FIELDS.EMBEDDING]: {
    dataType: DataType.FloatVector,
    description: 'Vector embedding of the memory content',
    dimension: 1536 // Assuming using OpenAI's embedding dimension
  },
  [MEMORY_FIELDS.TIMESTAMP]: {
    dataType: DataType.Int64,
    description: 'Creation timestamp of the memory'
  },
  [MEMORY_FIELDS.TIER_TYPE]: {
    dataType: DataType.VarChar,
    description: 'Memory tier classification',
    maxLength: 20
  },
  [MEMORY_FIELDS.IMPORTANCE]: {
    dataType: DataType.Float,
    description: 'Importance score of the memory',
    range: [0, 1]
  },
  [MEMORY_FIELDS.LAST_ACCESSED]: {
    dataType: DataType.Int64,
    description: 'Last access timestamp'
  },
  [MEMORY_FIELDS.ACCESS_COUNT]: {
    dataType: DataType.Int64,
    description: 'Number of times memory has been accessed'
  }
};

// Metadata fields for additional memory attributes
const metadataFields = {
  [MEMORY_FIELDS.EMOTIONAL_VALUE]: {
    dataType: DataType.Float,
    description: 'Emotional significance score',
    range: [0, 1]
  },
  [MEMORY_FIELDS.CONTEXT_RELEVANCE]: {
    dataType: DataType.Float,
    description: 'Contextual relevance score',
    range: [0, 1]
  },
  [MEMORY_FIELDS.SOURCE]: {
    dataType: DataType.VarChar,
    description: 'Source of the memory',
    maxLength: 255
  }
};

// Schema definitions for each memory tier
export const CORE_MEMORY: BaseMemorySchema = {
  id: 'core_memory',
  dimension: 1536,
  dataType: DataType.FloatVector,
  description: 'High-importance, frequently accessed memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    // Additional core-specific fields
    retention_priority: {
      dataType: DataType.Float,
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
  dataType: DataType.FloatVector,
  description: 'Medium-importance, recently accessed memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    // Additional active-specific fields
    promotion_score: {
      dataType: DataType.Float,
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
  dataType: DataType.FloatVector,
  description: 'Low-importance or older memories',
  fields: {
    ...commonFields,
    ...metadataFields,
    // Additional background-specific fields
    decay_rate: {
      dataType: DataType.Float,
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

// Collection creation parameters
export const COLLECTION_PARAMS = {
  core: {
    description: 'Core memory collection',
    schema: CORE_MEMORY
  },
  active: {
    description: 'Active memory collection',
    schema: ACTIVE_MEMORY
  },
  background: {
    description: 'Background memory collection',
    schema: BACKGROUND_MEMORY
  }
};

// Utility functions for schema operations
export const SchemaUtils = {
  validateMemory: (memory: any, tierType: string) => {
    // Implement validation logic based on schema
    const schema = COLLECTION_PARAMS[tierType].schema;
    // Add validation implementation
  },

  getSchemaForTier: (tierType: string) => {
    return COLLECTION_PARAMS[tierType].schema;
  },

  isValidTierType: (tierType: string): boolean => {
    return ['core', 'active', 'background'].includes(tierType);
  }
};

// Export types for TypeScript support
export type MemoryTierType = 'core' | 'active' | 'background';
export type MemoryField = keyof typeof MEMORY_FIELDS;

export interface MemorySchema {
  fields: Record<string, any>;
  indexes: Record<string, any>;
}