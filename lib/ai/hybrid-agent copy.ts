// lib/ai/hybrid-agent.ts

import { GoogleGenerativeAI } from "@google/generative-ai";
import { createEmotionalAgent } from './emotional-agent';
import { MemoryService } from '../memory/memory-service';
import { Message } from '@/types/chat';
import { 
  AgentState, 
  EmotionalState, 
  AgentRole, 
  ReActStep,
  HybridResponse 
} from './agents';
import { MemoryTierType } from '../memory/memory-schemas';

// Extended HybridState interface to include userId
export interface HybridState extends AgentState {
  reactSteps: ReActStep[];
  userId: string;
  messages: Message[];
}

// Extended HybridResponse interface to include userId
export interface ExtendedHybridResponse extends HybridResponse {
  userId: string;
}

interface MemoryMetadata {
  emotionalState: EmotionalState;
  reactStep: ReActStep;
  timestamp: string;
  contextRelevance?: number;
  importanceScore?: number;
}

export const createHybridAgent = (model: any, memoryService: MemoryService) => {
  const emotionalAgent = createEmotionalAgent(model);

  const calculateContextRelevance = (memories: any[]): number => {
    // Implementation for context relevance calculation
    return memories.length > 0 ? 0.8 : 0.5;
  };

  const calculateImportance = (state: HybridState): number => {
    // Implementation for importance calculation
    return state.emotionalState.confidence === 'high' ? 0.9 : 0.7;
  };

  const determineTierType = (metadata: MemoryMetadata): MemoryTierType => {
    const importance = metadata.importanceScore || 0.5;
    if (importance > 0.8) return 'core';
    if (importance > 0.5) return 'active';
    return 'background';
  };

  return {
    async process(state: HybridState): Promise<ExtendedHybridResponse> {
      try {
        // Validate last message
        const lastMessage = state.messages[state.messages.length - 1];
        if (!lastMessage?.content?.trim()) {
          throw new Error('Invalid message content');
        }

        // Get relevant memories using memory service's retrieve method
        const memories = await memoryService.retrieve(
          lastMessage.content,
          5
        );

        // Process emotional state
        const emotionalResult = await emotionalAgent(state);
        const emotionalState = emotionalResult.emotionalState;

        // Execute ReAct step with memory context
        const reactStep: ReActStep = {
          thought: `Analyzing message with emotional state (${emotionalState.mood}) and confidence (${emotionalState.confidence})`,
          action: 'Process message with memory context',
          observation: `Found ${memories.length} relevant memories`,
          response: await (async () => {
            try {
              const result = await model.generateContent({
                contents: [{
                  role: 'user',
                  parts: [{
                    text: `
                      Context: User message with emotional state ${emotionalState.mood}
                      Relevant memories: ${memories.map(m => m.content).join('\n')}
                      Message: ${lastMessage.content}
                      
                      Generate an appropriate response considering the emotional context and previous interactions.
                    `
                  }]
                }]
              });
              
              if (!result?.response) {
                throw new Error('Model failed to generate response');
              }
              
              return result.response.text();
            } catch (error) {
              console.error('Error generating content:', error);
              throw new Error('Failed to generate response from model');
            }
          })()
        };

        // Create memory metadata
        const memoryMetadata: MemoryMetadata = {
          emotionalState,
          reactStep,
          timestamp: new Date().toISOString(),
          contextRelevance: calculateContextRelevance(memories),
          importanceScore: calculateImportance(state)
        };

        // Store memory using memory service's store method
        await memoryService.store({
          content: lastMessage.content,
          userId: state.userId,
          tierType: determineTierType(memoryMetadata),
          metadata: memoryMetadata
        });

        return {
          success: true,
          emotionalState,
          reactSteps: [...(state.reactSteps || []), reactStep],
          response: reactStep.response,
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
          messages: state.messages,
          context: state.context,
          userId: state.userId
        };

      } catch (error) {
        console.error('Error in hybrid agent:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          reactSteps: state.reactSteps || [],
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
          messages: state.messages,
          context: state.context,
          emotionalState: state.emotionalState,
          userId: state.userId
        };
      }
    }
  };
};