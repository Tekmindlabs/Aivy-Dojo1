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

[{
	"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/app/api/chat/route.ts",
	"owner": "typescript",
	"code": "2459",
	"severity": 8,
	"message": "Module '\"@/lib/ai/hybrid-agent\"' declares 'HybridState' locally, but it is not exported.",
	"source": "ts",
	"startLineNumber": 7,
	"startColumn": 29,
	"endLineNumber": 7,
	"endColumn": 40,
	"relatedInformation": [
		{
			"startLineNumber": 11,
			"startColumn": 3,
			"endLineNumber": 11,
			"endColumn": 14,
			"message": "'HybridState' is declared here.",
			"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/lib/ai/hybrid-agent.ts"
		}
	]
},{
	"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/app/api/chat/route.ts",
	"owner": "typescript",
	"code": "2353",
	"severity": 8,
	"message": "Object literal may only specify known properties, and 'emotionalState' does not exist in type '{ emotional_value?: number | undefined; context_relevance?: number | undefined; source?: string | undefined; tags?: string[] | undefined; category?: string | undefined; confidence?: number | undefined; relationships?: { ...; } | undefined; userContext?: { ...; } | undefined; processingMetadata?: { ...; } | undefined...'.",
	"source": "ts",
	"startLineNumber": 187,
	"startColumn": 11,
	"endLineNumber": 187,
	"endColumn": 25,
	"relatedInformation": [
		{
			"startLineNumber": 22,
			"startColumn": 3,
			"endLineNumber": 22,
			"endColumn": 11,
			"message": "The expected type comes from property 'metadata' which is declared here on type 'Partial<Memory>'",
			"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/lib/memory/memory-service.ts"
		}
	]
},{
	"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/app/api/chat/route.ts",
	"owner": "typescript",
	"code": "2322",
	"severity": 8,
	"message": "Type 'ChatMetadata' is not assignable to type 'NullableJsonNullValueInput | InputJsonValue | undefined'.\n  Type 'ChatMetadata' is not assignable to type 'InputJsonObject'.\n    Index signature for type 'string' is missing in type 'ChatMetadata'.",
	"source": "ts",
	"startLineNumber": 209,
	"startColumn": 9,
	"endLineNumber": 209,
	"endColumn": 17,
	"relatedInformation": [
		{
			"startLineNumber": 12938,
			"startColumn": 5,
			"endLineNumber": 12938,
			"endColumn": 13,
			"message": "The expected type comes from property 'metadata' which is declared here on type '(Without<ChatCreateInput, ChatUncheckedCreateInput> & ChatUncheckedCreateInput) | (Without<...> & ChatCreateInput)'",
			"resource": "/d:/Learning Q1 2025/Jan/Aivy-Dojo1/node_modules/.prisma/client/index.d.ts"
		}
	]
}]

export const createHybridAgent = (model: any, memoryService: MemoryService) => {
  return new HybridAgent(model, memoryService);
};

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
        id: result.id || crypto.randomUUID(), // Required
        content: result.content,
        embedding: result.embedding || new Array(384).fill(0), // Required, using 384 dimensions as shown in mock
        timestamp: result.timestamp,
        tierType: result.tierType || 'active', // Required
        importance: result.importance,
        lastAccessed: result.lastAccessed || Date.now(), // Required
        accessCount: result.accessCount || 0, // Required
        metadata: {
          emotional_value: result.metadata?.emotional_value,
          context_relevance: result.metadata?.context_relevance
        }
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
      // The retrieve method will update access metrics internally
      await Promise.all(
        memories.map(memory => 
          this.memoryService.retrieve(memory.content)
        )
      );
    } catch (error) {
      console.error('Error updating memory context:', error);
    }
  }
}