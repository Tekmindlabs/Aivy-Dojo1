// lib/ai/response-generator.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { Message } from '@/types/chat';
import { MemoryService } from '../memory/memory-service';

// Initialize Google AI
if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error("GOOGLE_AI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

interface ResponseOptions {
  temperature?: number;
  maxTokens?: number;
  userId?: string;
  includeMemoryContext?: boolean;
}

export class ResponseGenerator {
  private memoryService: MemoryService;

  constructor() {
    this.memoryService = new MemoryService();
  }

  private async getMemoryContext(userId: string, lastMessage: string): Promise<string> {
    try {
      const memories = await this.memoryService.searchMemories(
        lastMessage,
        userId,
        undefined,
        3
      );

      if (!memories.length) return '';

      return `
Previous relevant context:
${memories.map(m => {
  const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  return `- ${content}`;
}).join('\n')}
      `.trim();
    } catch (error) {
      console.error('Error fetching memory context:', error);
      return '';
    }
  }

  private formatMessages(messages: Message[], systemPrompt: string): Array<{role: string, parts: Array<{text: string}>}> {
    return [
      {
        role: 'user',
        parts: [{
          text: `${systemPrompt}\n\nPlease respond to the following conversation:`
        }]
      },
      ...messages.map(m => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }]
      }))
    ];
  }

  async generateResponse(
    messages: Message[],
    systemPrompt: string,
    options: ResponseOptions = {}
  ): Promise<string> {
    try {
      const {
        temperature = 0.7,
        maxTokens = 1000,
        userId,
        includeMemoryContext = true
      } = options;

      let enhancedSystemPrompt = systemPrompt;

      // Include memory context if requested and userId is provided
      if (includeMemoryContext && userId) {
        const lastMessage = messages[messages.length - 1].content;
        const memoryContext = await this.getMemoryContext(userId, lastMessage);
        if (memoryContext) {
          enhancedSystemPrompt = `${systemPrompt}\n\n${memoryContext}`;
        }
      }

      // Format messages for Google AI
      const formattedMessages = this.formatMessages(messages, enhancedSystemPrompt);

      // Generate response
      const result = await model.generateContent({
        contents: formattedMessages,
        generationConfig: {
          temperature,
          maxOutputTokens: maxTokens,
          topP: 0.8,
          topK: 40,
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      });

      // Store the interaction in memory if userId is provided
      if (userId) {
        await this.memoryService.addMemory(
          messages,
          userId,
          'chat',
          {
            systemPrompt: enhancedSystemPrompt,
            timestamp: new Date().toISOString(),
            response: result.response.text()
          }
        ).catch(error => {
          console.error('Error storing memory:', error);
        });
      }

      // Process and return the response
      const response = result.response.text()
        .replace(/^\d+:/, '') // Remove numeric prefix
        .replace(/\\n/g, '\n') // Replace escaped newlines
        .trim();

      return response;

    } catch (error) {
      console.error('Error generating response:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to generate response: ${error.message}`);
      }
      throw new Error('Failed to generate response: Unknown error');
    }
  }
}

// Export a singleton instance
const responseGenerator = new ResponseGenerator();

export async function generateResponse(
  messages: Message[],
  systemPrompt: string,
  options: ResponseOptions = {}
): Promise<string> {
  return await responseGenerator.generateResponse(messages, systemPrompt, options);
}