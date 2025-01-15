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
    const embedding = await getEmbedding(content);
    return Array.from(embedding);
  }

  async addMemory(
    messages: Message[],
    userId: string,
    schemaName: string,
    metadata: Record<string, any> = {}
  ): Promise<MemoryEntry> {
    try {
      if (typeof schemaName !== 'string') {
        throw new Error(`Invalid schema name: ${JSON.stringify(schemaName)}`);
      }
  
      const schema = DEFAULT_MEMORY_SCHEMAS.find(s => s.name === schemaName);
      if (!schema) {
        throw new Error(`Schema ${schemaName} not found in DEFAULT_MEMORY_SCHEMAS`);
      }

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

      if (schema.updateMode === 'patch') {
        const existing = await this.getMemoryBySchema(userId, schemaName);
        if (existing) {
          memoryEntry.content = {
            ...existing.content,
            ...memoryEntry.content
          };
        }
      }

      // Update the insertVector call to match the expected parameters
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

      // Type the results properly
      return (results as SearchResult[]).map(result => ({
        id: result.id,
        schemaName: result.metadata.schemaName,
        content: JSON.parse(result.metadata.content),
        userId: result.metadata.userId,
        timestamp: new Date(),
        embedding: embedding // Include the search embedding
      }));
    } catch (error) {
      console.error('Error searching memories:', error);
      throw error;
    }
  }

  async getMemoryBySchema(
    userId: string,
    schemaName: string
  ): Promise<MemoryEntry | null> {
    const memories = await this.searchMemories(
      '',  // empty query
      userId,
      schemaName,
      1
    );
    return memories[0] || null;
  }
}