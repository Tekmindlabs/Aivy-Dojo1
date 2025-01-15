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
import { DEFAULT_MEMORY_SCHEMAS } from '../memory/memory-schemas';

export interface HybridState extends AgentState {
  reactSteps: ReActStep[];  // Now ReActStep is properly typed
  userId: string;
  messages: Message[];
  processedTensors?: {
    embedding: number[];
    input_ids: Float32Array;
    attention_mask: Float32Array;
    token_type_ids: Float32Array;
  };
}

export const createHybridAgent = (model: any, memoryService: MemoryService) => {
  const emotionalAgent = createEmotionalAgent(model);

  return {
    async process(state: HybridState): Promise<HybridResponse> {
      try {
        // Validate last message
        const lastMessage = state.messages[state.messages.length - 1];
        if (!lastMessage?.content?.trim()) {
          throw new Error('Invalid message content');
        }

        // Get relevant memories
        const memories = await memoryService.searchMemories(
          lastMessage.content,
          state.userId,
          undefined,
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

        // Store memory
        await memoryService.addMemory(
          state.messages,
          state.userId,
          'chat_memory',
          {
            emotionalState,
            reactStep,
            timestamp: new Date().toISOString()
          }
        );

        return {
          success: true,
          emotionalState,
          reactSteps: [...(state.reactSteps || []), reactStep],
          response: reactStep.response,
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
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
          userId: state.userId
        };
      }
    }
  };
};