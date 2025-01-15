// lib/memory/memory-tools.ts

import { StructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { Message } from '@/types/chat';
import { MemoryService } from './memory-service';
import { DEFAULT_MEMORY_SCHEMAS } from './memory-schemas';

export class AddMemoryTool extends StructuredTool {
  name = 'add_memory';
  description = 'Add messages to memory with associated metadata';
  schema = z.object({
    messages: z.array(
      z.object({
        content: z.string(),
        role: z.enum(['user', 'assistant'])
      })
    ),
    userId: z.string(),
    schemaName: z.string(),
    metadata: z.record(z.any()).optional()
  });

  constructor(private memoryService: MemoryService) {
    super();
  }

  async _call({
    messages,
    userId,
    schemaName,
    metadata
  }: {
    messages: Message[];
    userId: string;
    schemaName: string;
    metadata?: Record<string, any>;
  }) {
    const schema = DEFAULT_MEMORY_SCHEMAS.find(s => s.name === schemaName);
    if (!schema) {
      throw new Error(`Schema ${schemaName} not found`);
    }

    await this.memoryService.addMemory(messages, userId, schemaName, metadata);
    return 'Memory added successfully';
  }
}

export class SearchMemoryTool extends StructuredTool {
  name = 'search_memory';
  description = 'Search through memories based on a query';
  schema = z.object({
    query: z.string(),
    userId: z.string(),
    schemaName: z.string().optional(),
    limit: z.number().optional()
  });

  constructor(private memoryService: MemoryService) {
    super();
  }

  async _call({
    query,
    userId,
    schemaName,
    limit
  }: {
    query: string;
    userId: string;
    schemaName?: string;
    limit?: number;
  }) {
    const memories = await this.memoryService.searchMemories(
      query,
      userId,
      schemaName,
      limit
    );
    return memories;
  }
}