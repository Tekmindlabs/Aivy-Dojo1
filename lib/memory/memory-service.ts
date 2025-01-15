// lib/memory/memory-service.ts

import { Message } from '@/types/chat';
import { getEmbedding } from '@/lib/knowledge/embeddings';
import { insertVector, searchSimilarContent } from '@/lib/milvus/vectors';
import { MemorySchema, DEFAULT_MEMORY_SCHEMAS, MEMORY_SCHEMAS } from './memory-schemas';

export interface MemoryEntry {
  id: string;
  schemaName: string;
  content: Record<string, any>;
  userId: string;
  timestamp: Date;
  embedding?: number[];
  metadata?: Record<string, any>;
}

export class MemoryService {
  private memoryCache: Map<string, MemoryEntry> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

  // Fixed: Added validateSchemaName method
  private validateSchemaName(schemaName: string): MemorySchema {
    if (!schemaName?.trim()) {
      throw new Error('Schema name is required');
    }

    const schema = DEFAULT_MEMORY_SCHEMAS.find(s => s.name === schemaName);
    if (!schema) {
      throw new Error(`Schema ${schemaName} not found in DEFAULT_MEMORY_SCHEMAS`);
    }

    return schema;
  }

  private getCacheKey(userId: string, schemaName: string): string {
    return `${userId}:${schemaName}`;
  }

  private async processUserInformation(content: string): Promise<Record<string, any>> {
    const nameMatch = content.match(/my name is (\w+)/i);
    const interestsMatch = content.match(/i (?:like|love|enjoy) (.+?)(?:\.|\n|$)/i);

    return {
      user_name: nameMatch ? nameMatch[1] : undefined,
      interests: interestsMatch ? [interestsMatch[1].trim()] : undefined,
      last_interaction: new Date().toISOString()
    };
  }

  private mergeContent(existing: Record<string, any>, new_content: Record<string, any>): Record<string, any> {
    const merged = { ...existing };

    for (const [key, value] of Object.entries(new_content)) {
      if (Array.isArray(existing[key]) && Array.isArray(value)) {
        // Fixed: Changed Set spread to Array spread
        merged[key] = Array.from(new Set([...existing[key], ...value]));
      } else if (typeof existing[key] === 'object' && typeof value === 'object') {
        merged[key] = this.mergeContent(existing[key], value);
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  async addMemory(
    messages: Message[],
    userId: string,
    schemaName: string,
    metadata: Record<string, any> = {}
  ): Promise<MemoryEntry> {
    try {
      this.validateMessages(messages);
      this.validateUserId(userId);
      const schema = this.validateSchemaName(schemaName);
      const lastMessage = messages[messages.length - 1];
      
      let processedContent = {};
      if (schemaName === MEMORY_SCHEMAS.USER) {
        processedContent = await this.processUserInformation(lastMessage.content);
      }

      const embedding = await this.createEmbedding(lastMessage.content);
      
      const memoryEntry: MemoryEntry = {
        id: crypto.randomUUID(),
        schemaName,
        content: {
          ...processedContent,
          ...metadata,
          original_message: lastMessage.content,
          messages: messages.map(m => ({
            content: m.content,
            role: m.role,
            timestamp: new Date()
          }))
        },
        userId,
        timestamp: new Date(),
        embedding,
        metadata: {
          last_updated: new Date().toISOString(),
          context_type: schemaName,
          ...metadata
        }
      };

      if (schema.updateMode === 'patch') {
        const existing = await this.getMemoryBySchema(userId, schemaName);
        if (existing) {
          memoryEntry.content = this.mergeContent(existing.content, memoryEntry.content);
        }
      }

      // Fixed: Removed filters parameter and adjusted searchSimilarContent call
      await insertVector({
        userId,
        contentType: 'memory',
        contentId: memoryEntry.id,
        embedding,
        metadata: {
          schemaName,
          content: JSON.stringify(memoryEntry.content),
          timestamp: memoryEntry.timestamp.toISOString()
        }
      });

      this.memoryCache.set(this.getCacheKey(userId, schemaName), memoryEntry);
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
      
      // Fixed: Removed filters parameter
      const results = await searchSimilarContent({
        userId,
        embedding,
        limit,
        contentTypes: ['memory']
      });

      return results.map(result => {
        const metadata = JSON.parse(result.metadata);
        return {
          id: result.id,
          schemaName: metadata.schemaName,
          content: JSON.parse(metadata.content),
          userId: metadata.userId,
          timestamp: new Date(metadata.timestamp),
          embedding: embedding,
          metadata: {
            score: result.score,
            ...metadata
          }
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
      const cacheKey = this.getCacheKey(userId, schemaName);
      const cached = this.memoryCache.get(cacheKey);
      
      if (cached && (Date.now() - cached.timestamp.getTime()) < this.CACHE_TTL) {
        return cached;
      }

      const memories = await this.searchMemories(schemaName, userId, schemaName, 1);
      const memory = memories[0] || null;
      
      if (memory) {
        this.memoryCache.set(cacheKey, memory);
      }

      return memory;
    } catch (error) {
      console.error('Error getting memory by schema:', error);
      throw error;
    }
  }

  async clearMemories(userId: string, schemaName?: string): Promise<void> {
    try {
      // Fixed: Changed iteration approach
      const cacheKeys = Array.from(this.memoryCache.keys());
      for (const key of cacheKeys) {
        if (key.startsWith(`${userId}:`)) {
          if (!schemaName || key.endsWith(`:${schemaName}`)) {
            this.memoryCache.delete(key);
          }
        }
      }
    } catch (error) {
      console.error('Error clearing memories:', error);
      throw error;
    }
  }
}