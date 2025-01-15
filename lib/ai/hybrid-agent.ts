import { GoogleGenerativeAI } from "@google/generative-ai";
import { createEmotionalAgent } from "./emotional-agent";
import { MemoryService } from "../memory/memory-service";
import { Message } from "@/types/chat";
import { AgentState, EmotionalState, AgentRole } from "./agents";

// Define base interfaces
interface ReActStep {
  thought: string;
  action: string;
  observation: string;
  response?: string;
}

interface Memory {
  id: string;
  content: string;
  emotionalState: EmotionalState;
  timestamp: string;
  userId: string;
  metadata?: {
    learningStyle?: string;
    difficulty?: string;
    interests?: string[];
  };
}

export interface HybridState extends AgentState {
  reactSteps: ReActStep[];
  currentStep: string;
  userId: string;
  messages: Message[];
  context: {
    role: AgentRole;
    analysis: {
      emotional?: any;
      research?: any;
      validation?: any;
    };
    recommendations: string;
    previousMemories?: Memory[];
  };
  processedTensors?: {
    embedding: number[];
    input_ids: Float32Array;
    attention_mask: Float32Array;
    token_type_ids: Float32Array;
  };
}

interface HybridResponse {
  success: boolean;
  emotionalState?: EmotionalState;
  reactSteps?: ReActStep[];
  response?: string;
  error?: string;
  timestamp: string;
  currentStep: string;
  userId: string;
}

export const createHybridAgent = (model: any, memoryService: MemoryService) => {
  const emotionalAgent = createEmotionalAgent(model);
  
  const executeReActStep = async (
    step: string, 
    state: HybridState,
    emotionalState: EmotionalState,
    memories: any[]
  ): Promise<ReActStep> => {
    const prompt = `
      As an emotionally intelligent AI tutor:
      
      Current Context:
      - Emotional State: ${emotionalState.mood}
      - Confidence Level: ${emotionalState.confidence}
      - Previous Steps: ${state.reactSteps?.length || 0}
      
      Previous Interactions:
      ${memories.map(m => `- ${m.content || m.text} (Emotional State: ${m.emotionalState?.mood || 'Unknown'})`).join('\n')}
      
      Thought Process:
      1. Consider emotional state and learning needs
      2. Review previous interactions and patterns
      3. Plan appropriate response strategy
      4. Evaluate potential impact
      
      Current Step: ${step}
      
      Provide:
      1. Your thought process
      2. Next action to take
      3. What you observe from the results
    `;

    const result = await model.generateContent({
      contents: [{
        role: "user",
        parts: [{ text: prompt }]
      }]
    });
    
    const response = result.response.text();
    const [thought, action, observation] = response.split('\n\n');
    
    return {
      thought: thought.replace('Thought: ', '').trim(),
      action: action.replace('Action: ', '').trim(),
      observation: observation.replace('Observation: ', '').trim()
    };
  };

  return {
    process: async (state: HybridState): Promise<HybridResponse> => {
      try {
        const lastMessage = state.messages[state.messages.length - 1];
if (!lastMessage?.content) {
  throw new Error("Invalid message format - content is required");
}

const relevantMemories = await memoryService.searchMemories(
  lastMessage.content,
  state.userId,
  5
);

        // Step 2: Emotional Analysis
        const emotionalAnalysis = await emotionalAgent({
          ...state,
          context: {
            ...state.context,
            previousMemories: relevantMemories
          }
        });
        
        // Step 3: ReAct Planning
        const reactStep = await executeReActStep(
          state.currentStep,
          state,
          emotionalAnalysis.emotionalState,
          relevantMemories
        );
        
        // Step 4: Generate Response
        const responsePrompt = `
          Context:
          - Emotional Analysis: ${JSON.stringify(emotionalAnalysis)}
          - Reasoning Steps: ${JSON.stringify(reactStep)}
          - Previous Interactions: ${JSON.stringify(relevantMemories)}
          
          User Message: ${lastMessage.content}
          
          Generate a supportive and personalized response that:
          1. Acknowledges the user's emotional state
          2. Addresses their specific needs
          3. Provides clear and actionable guidance
        `;

        const response = await model.generateContent({
          contents: [{ 
            role: "user", 
            parts: [{ text: responsePrompt }]
          }]
        });

        // Step 5: Store interaction
        const memoryEntry = {
          messages: state.messages.map(msg => ({
            content: msg.content,
            role: msg.role,
            createdAt: new Date().toISOString()
          })),
          metadata: {
            emotionalState: emotionalAnalysis.emotionalState,
            context: state.context,
            reactStep
          }
        };

        await memoryService.addMemory(
          memoryEntry.messages,
          state.userId,
          memoryEntry.metadata
        );

        const responseText = response.response.text();

        return {
          success: true,
          emotionalState: emotionalAnalysis.emotionalState,
          reactSteps: [...(state.reactSteps || []), reactStep],
          response: responseText,
          timestamp: new Date().toISOString(),
          currentStep: state.currentStep,
          userId: state.userId
        };

      } catch (error) {
        console.error("Hybrid agent error:", error);
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          reactSteps: state.reactSteps || [],
          currentStep: state.currentStep,
          userId: state.userId,
          timestamp: new Date().toISOString()
        };
      }
    }
  };
};