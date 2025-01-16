import { GoogleGenerativeAI } from "@google/generative-ai";
import { createEmotionalAgent } from './emotional-agent';
import { MemoryService, Memory } from '../memory/memory-service';
import { Message } from '@/types/chat';
import { 
  AgentState, 
  EmotionalState, 
  AgentRole, 
  ReActStep,
  AgentResponse,
  HybridState,
  HybridResponse 
} from './agents';
import { MilvusSearchWrapper } from '../milvus/search-wrapper';
import { getMilvusClient } from '../milvus/client';
import { getEmbedding } from '../knowledge/embeddings';

export class HybridAgent {
  private emotionalAgent: ReturnType<typeof createEmotionalAgent>;
  private memoryService: MemoryService;
  private model: any;

  constructor(model: any, memoryService: MemoryService) {
    this.model = model;
    this.emotionalAgent = createEmotionalAgent(model);
    this.memoryService = memoryService;
  }

  async process(state: HybridState): Promise<HybridResponse> {
    try {
      // 1. Validate last message
      const lastMessage = state.messages[state.messages.length - 1];
      if (!lastMessage?.content?.trim()) {
        throw new Error('Invalid message content');
      }

      // 2. Generate embedding for the last message and convert to number[]
      const rawEmbedding = await getEmbedding(lastMessage.content);
      const messageEmbedding = Array.from(rawEmbedding);

      // 3. Initialize Milvus search
      const client = await getMilvusClient();
      const searchWrapper = new MilvusSearchWrapper(client);

      // 4. Perform vector search with correct typing
      const searchResults = await searchWrapper.search({
        collection: 'memories',
        vector: messageEmbedding,
        limit: 5,
        tierType: 'core'
      });

      // 5. Process emotional state
      const emotionalResponse = await this.emotionalAgent(state);
      const emotionalState = emotionalResponse.emotionalState;

      // 6. Build context from search results
      const relevantMemories = searchResults.map((result: any) => ({
        content: result.content,
        importance: result.importance,
        timestamp: result.timestamp
      }));

      // Update memory access metrics
      await this.updateMemoryContext(relevantMemories, emotionalState);

      // 7. Generate ReAct steps
      const reactSteps: ReActStep[] = [
        {
          thought: "Analyzing user message and relevant context",
          action: "Retrieved relevant memories and analyzed emotional state",
          observation: `Found ${relevantMemories.length} relevant memories. Emotional state: ${emotionalState.mood}`
        }
      ];

      // 8. Generate response using the model
      const prompt = `
        Based on the following context:
        - User message: ${lastMessage.content}
        - Emotional state: ${emotionalState.mood} (confidence: ${emotionalState.confidence})
        - Relevant memories: ${JSON.stringify(relevantMemories)}
        
        Generate a helpful and emotionally appropriate response.
      `;

      const response = await this.model.generateContent(prompt);
      const generatedResponse = response.response.text();

      // 9. Add final ReAct step
      reactSteps.push({
        thought: "Formulating response based on context and emotional state",
        action: "Generated contextual response",
        observation: "Response generated successfully",
        response: generatedResponse
      });

      // 10. Return complete hybrid response
      return {
        success: true,
        timestamp: new Date().toISOString(),
        currentStep: 'completed',
        messages: [...state.messages],
        context: {
          ...state.context,
          analysis: {
            ...state.context.analysis,
            emotional: emotionalState.mood,
            memories: relevantMemories
          }
        },
        emotionalState,
        reactSteps,
        response: generatedResponse,
        metadata: {
          processingTime: Date.now(),
          confidence: emotionalState.confidence === 'high' ? 0.9 : 0.7,
          source: 'hybrid-agent'
        }
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
        emotionalState: state.emotionalState
      };
    }
  }

  private async updateMemoryContext(
    memories: Memory[], 
    emotionalState: EmotionalState
  ): Promise<void> {
    try {
      await this.memoryService.updateAccessMetrics(memories);
    } catch (error) {
      console.error('Error updating memory context:', error);
    }
  }
}