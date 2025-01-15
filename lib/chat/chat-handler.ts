// lib/chat/chat-handler.ts

import { MemoryManager } from '../memory/memory-manager';
import { Message } from '@/types/chat';
import { generateResponse } from '@/lib/ai/response-generator';
import { EmotionalState, ReActStep } from '@/lib/ai/agents';

interface RelevantChat {
  content: string;
  timestamp?: string;
}

export class ChatHandler {
  constructor(private memoryManager: MemoryManager) {}

  async handleChat(messages: Message[], userId: string): Promise<string> {
    try {
      // Validate inputs
      if (!messages?.length || !messages[messages.length - 1]?.content?.trim()) {
        throw new Error('Invalid message format or empty content');
      }

      // Get relevant memories with enhanced context
      const memories = await this.memoryManager.getRelevantMemories(
        userId,
        messages[messages.length - 1].content,
        {
          includeEmotionalState: true,
          includeLearningContext: true
        }
      );

      // Create enhanced system prompt with memory context
      const systemPrompt = `
Previous context about user:
Name: ${memories.user?.user_name || 'unknown'}
Interests: ${memories.user?.interests?.join(', ') || 'unknown'}
Learning Style: ${memories.user?.learningStyle || 'adaptive'}
Difficulty Preference: ${memories.user?.difficultyPreference || 'moderate'}

Recent emotional state: ${memories.emotionalState?.mood || 'neutral'}
Confidence level: ${memories.emotionalState?.confidence || 'medium'}

Recent relevant conversations:
${memories.relevantChats.map((c: RelevantChat) => c.content).join('\n')}
      `.trim();

      // Schedule memory update with enhanced metadata
      await this.memoryManager.scheduleMemoryUpdate(
        messages,
        userId,
        'chat_memory',
        {
          timestamp: new Date().toISOString(),
          emotionalState: memories.emotionalState,
          learningContext: {
            style: memories.user?.learningStyle,
            difficulty: memories.user?.difficultyPreference
          }
        }
      );

      // Generate response with enhanced context
      return await generateResponse(messages, systemPrompt, {
        userId,
        includeMemoryContext: true,
        temperature: 0.7
      });
    } catch (error) {
      console.error('Error in chat handler:', error);
      throw error;
    }
  }
}