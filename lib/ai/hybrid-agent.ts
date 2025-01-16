import { GoogleGenerativeAI } from "@google/generative-ai";
import { createEmotionalAgent } from './emotional-agent';
import { MemoryService, Memory } from '../memory/memory-service';
import { Message } from '@/types/chat';
import { 
  AgentState, 
  EmotionalState, 
  AgentRole, 
  ReActStep,
  AgentResponse 
} from './agents';

// Update HybridResponse to include userId
export interface HybridResponse extends AgentResponse {
  reactSteps: ReActStep[];
  userId: string; // Add this line
}

export interface HybridState extends AgentState {
  reactSteps: ReActStep[];
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

        // Update retrieve call to use correct number of arguments
        const memories = await memoryService.retrieve(
          lastMessage.content,
          5  // Only pass query and limit
        );

        // Rest of the code remains the same...
        const emotionalResult = await emotionalAgent(state);
        const emotionalState = emotionalResult.emotionalState;

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
                      Relevant memories: ${memories.map((m: Memory) => m.content).join('\n')}
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

        await memoryService.store({
          content: lastMessage.content,
          timestamp: Date.now(),
          metadata: {
            emotional_value: emotionalState.mood === 'positive' ? 1 : 
                           emotionalState.mood === 'negative' ? -1 : 0,
            context_relevance: 1.0,
            source: 'chat'
          }
        });

        return {
          success: true,
          emotionalState,
          reactSteps: [...(state.reactSteps || []), reactStep],
          response: reactStep.response,
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
          userId: state.userId,
          messages: state.messages,
          context: state.context
        };

      } catch (error) {
        console.error('Error in hybrid agent:', error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          reactSteps: state.reactSteps || [],
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
          userId: state.userId,
          messages: state.messages,
          context: state.context,
          emotionalState: state.emotionalState
        };
      }
    }
  };
};