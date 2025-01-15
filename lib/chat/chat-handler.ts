// lib/chat/chat-handler.ts

import { MemoryManager } from '../memory/memory-manager';
import { Message } from '@/types/chat';
import { generateResponse } from '@/lib/ai/response-generator'; // Add this import

interface RelevantChat {
  content: string;
  timestamp?: string;
}

export class ChatHandler {
  constructor(private memoryManager: MemoryManager) {}

  async handleChat(messages: Message[], userId: string): Promise<string> {
    // Get relevant memories
    const memories = await this.memoryManager.getRelevantMemories(
      userId,
      messages[messages.length - 1].content
    );

    // Create system prompt with memory context
    const systemPrompt = `
Previous context about user:
Name: ${memories.user.user_name || 'unknown'}
Interests: ${memories.user.interests?.join(', ') || 'unknown'}

Recent relevant conversations:
${memories.relevantChats.map((c: RelevantChat) => c.content).join('\n')}
    `;

    // Schedule memory update
    this.memoryManager.scheduleMemoryUpdate(
      messages,
      userId,
      'chat',
      {
        timestamp: new Date().toISOString()
      }
    );

    // Generate and return response
    return await generateResponse(messages, systemPrompt);
  }
}