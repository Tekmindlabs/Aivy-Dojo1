// lib/memory/memory-service.ts

import { Message } from '@/types/chat';
import { getEmbedding } from '@/lib/knowledge/embeddings';
import { insertVector, searchSimilarContent } from '@/lib/milvus/vectors';
import { MemorySchema, DEFAULT_MEMORY_SCHEMAS } from './memory-schemas';

export interface MemoryEntry {
  id: string;
  schemaName: string;
  content: Record<string, any>;
  userId: string;
  timestamp: Date;
  embedding?: number[];
}

interface SearchResult {
  id: string;
  metadata: {
    userId: string;
    schemaName: string;
    content: string;
  };
  score: number;
}

export class MemoryService {
  private async createEmbedding(content: string): Promise<number[]> {
    try {
      if (!content?.trim()) {
        console.warn('Attempting to create embedding with empty content');
        throw new Error('Cannot create embedding from empty content');
      }
      const embedding = await getEmbedding(content);
      return Array.from(embedding);
    } catch (error) {
      console.error('Error creating embedding:', error);
      throw error;
    }
  }

  private validateMessages(messages: Message[]): void {
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array cannot be empty');
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content?.trim()) {
      throw new Error('Last message content cannot be empty');
    }
  }

  private validateUserId(userId: string): void {
    if (!userId?.trim()) {
      throw new Error('User ID is required');
    }
  }

  private validateSchemaName(schemaName: string): MemorySchema {
    if (typeof schemaName !== 'string' || !schemaName.trim()) {
      throw new Error(`Invalid schema name: ${JSON.stringify(schemaName)}`);
    }

    const schema = DEFAULT_MEMORY_SCHEMAS.find(s => s.name === schemaName);
    if (!schema) {
      throw new Error(`Schema ${schemaName} not found in DEFAULT_MEMORY_SCHEMAS`);
    }

    return schema;
  }

  async addMemory(
    messages: Message[],
    userId: string,
    schemaName: string,
    metadata: Record<string, any> = {}
  ): Promise<MemoryEntry> {
    try {
      // Validate inputs
      this.validateMessages(messages);
      this.validateUserId(userId);
      const schema = this.validateSchemaName(schemaName);

      const lastMessage = messages[messages.length - 1];
      const embedding = await this.createEmbedding(lastMessage.content);

      const memoryEntry: MemoryEntry = {
        id: crypto.randomUUID(),
        schemaName,
        content: {
          ...metadata,
          messages,
          timestamp: new Date()
        },
        userId,
        timestamp: new Date(),
        embedding
      };

      // Handle patch mode
      if (schema.updateMode === 'patch') {
        const existing = await this.getMemoryBySchema(userId, schemaName);
        if (existing) {
          memoryEntry.content = {
            ...existing.content,
            ...memoryEntry.content
          };
        }
      }

      // Store in vector database
      await insertVector({
        userId,
        contentType: 'memory',
        contentId: memoryEntry.id,
        embedding,
        metadata: {
          schemaName,
          content: JSON.stringify(memoryEntry.content)
        }
      });

      return memoryEntry;
    } catch (error) {
      console.error('Error adding memory:', error);
      throw error;
    }
  }

  // lib/memory/memory-service.ts

async searchMemories(
  query: string,
  userId: string,
  schemaName?: string,
  limit: number = 5
): Promise<MemoryEntry[]> {
  try {
    const embedding = await this.createEmbedding(query);
    
    // Update searchSimilarContent call to match the expected parameters
    const results = await searchSimilarContent({
      userId,
      embedding,
      limit,
      contentTypes: ['memory']
    });

    // Properly parse and transform the results
    return results.map(result => {
      // Parse the metadata string into an object
      const metadata = JSON.parse(result.metadata) as {
        userId: string;
        schemaName: string;
        content: string;
      };

      return {
        id: result.id,
        schemaName: metadata.schemaName,
        content: JSON.parse(metadata.content),
        userId: metadata.userId,
        timestamp: new Date(),
        embedding: embedding
      };
    });
  } catch (error) {
    console.error('Error searching memories:', error);
    throw error;
  }
}

  async getMemoryBySchema(
    userId: string,
    schemaName: string
  ): Promise<MemoryEntry | null> {
    try {
      // Validate inputs
      this.validateUserId(userId);
      this.validateSchemaName(schemaName);

      // Use schema name as default query to improve relevance
      const memories = await this.searchMemories(
        schemaName,
        userId,
        schemaName,
        1
      );
      return memories[0] || null;
    } catch (error) {
      console.error('Error getting memory by schema:', error);
      throw error;
    }
  }
}