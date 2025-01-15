// lib/memory/memory-manager.ts

import { MemoryService } from './memory-service';
import { Message } from '@/types/chat';

export class MemoryManager {
  private debounceTimeout: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_TIME = 10000; // 10 seconds

  constructor(private memoryService: MemoryService) {}

  scheduleMemoryUpdate(
    messages: Message[],
    userId: string,
    schemaName: string,
    metadata?: Record<string, any>
  ) {
    if (this.debounceTimeout) {
      clearTimeout(this.debounceTimeout);
    }

    this.debounceTimeout = setTimeout(async () => {
      try {
        await this.memoryService.addMemory(messages, userId, schemaName, metadata);
      } catch (error) {
        console.error('Failed to update memory:', error);
      }
    }, this.DEBOUNCE_TIME);
  }

  async getRelevantMemories(
    userId: string,
    currentMessage: string
  ): Promise<Record<string, any>> {
    const [userMemory, relevantChats] = await Promise.all([
      this.memoryService.getMemoryBySchema(userId, 'user'),
      this.memoryService.searchMemories(currentMessage, userId, 'chat', 3)
    ]);

    return {
      user: userMemory?.content || {},
      relevantChats: relevantChats.map(m => m.content)
    };
  }
}