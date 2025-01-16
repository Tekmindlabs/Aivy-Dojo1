import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authConfig } from "@/lib/auth/config";
import { StreamingTextResponse, LangChainStream } from 'ai';
import { prisma } from "@/lib/prisma";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { createHybridAgent, HybridState } from '@/lib/ai/hybrid-agent';
import { AgentState, ReActStep, EmotionalState } from '@/lib/ai/agents';
import { Message } from '@/types/chat';
import { MemoryService } from '@/lib/memory/memory-service';
import { EmbeddingModel } from '@/lib/knowledge/embeddings';
import { ChatHandler } from '@/lib/chat/chat-handler';
import { getMilvusClient } from '@/lib/milvus/client';

// Helper functions for memory metrics
const calculateContextRelevance = (memories: any[]): number => {
  return memories.length > 0 ? 0.8 : 0.5;
};

const calculateImportance = (response: any): number => {
  return response.emotionalState?.confidence === 'high' ? 0.9 : 0.7;
};

// Type definitions
interface ChatMetadata {
  [key: string]: any; // Add index signature
  emotionalState: EmotionalState | null;
  reactSteps: Array<{
    thought: string;
    action: string;
    observation: string;
    response?: string;
  }>;
  personalization: {
    learningStyle: string | null;
    difficulty: string | null;
    interests: string[];
  };
  memoryMetrics: {
    contextRelevance: number;
    importanceScore: number;
    timestamp: string;
    relatedMemories: string[];
  };
}

// Process steps
const STEPS = {
  INIT: 'Initializing request',
  AUTH: 'Authenticating user',
  PROCESS: 'Processing messages',
  EMBED: 'Generating embeddings',
  AGENT: 'Processing with hybrid agent',
  RESPONSE: 'Generating response',
  STREAM: 'Streaming response'
};

if (!process.env.GOOGLE_AI_API_KEY) {
  throw new Error("GOOGLE_AI_API_KEY is not set");
}

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
const requestCache = new Map<string, Response>();

export async function POST(req: NextRequest) {
  const runId = crypto.randomUUID();
  let currentStep = STEPS.INIT;
  
  const requestId = req.headers.get('x-request-id') || runId;
  const cachedResponse = requestCache.get(requestId);
  if (cachedResponse) return cachedResponse;
  
  try {
    // Authentication
    currentStep = STEPS.AUTH;
    const session = await getServerSession(authConfig);
    if (!session?.user?.id) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }), 
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Message validation
    const { messages }: { messages: Message[] } = await req.json();
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage?.content?.trim()) {
      return new Response(
        JSON.stringify({ error: "Invalid message content" }), 
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get user data
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        learningStyle: true,
        difficultyPreference: true,
        interests: true
      }
    });

    if (!user) {
      return new Response(
        JSON.stringify({ error: "User not found" }), 
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Initialize services
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const { stream, handlers } = LangChainStream({ experimental_streamData: true });
    const memoryService = new MemoryService(await getMilvusClient());
    const hybridAgent = createHybridAgent(model, memoryService);

    // Process messages and generate embeddings
    currentStep = STEPS.EMBED;
    const processedMessages = messages.map(msg => ({
      ...msg,
      content: msg.content.trim()
    }));

    const embeddingResult = await EmbeddingModel.generateEmbedding(lastMessage.content);
    const embedding = Array.from(embeddingResult);

    // Retrieve relevant memories
    currentStep = STEPS.AGENT;
    const memoryContext = await memoryService.retrieve(
      lastMessage.content,
      5
    );

    // Process with hybrid agent
    const initialState: HybridState = {
      userId: user.id,
      messages: processedMessages,
      currentStep: "initial",
      emotionalState: {
        mood: "neutral",
        confidence: "medium"
      },
      context: {
        role: "tutor",
        analysis: {
          memories: memoryContext,
          learningStyle: user.learningStyle,
          difficulty: user.difficultyPreference
        },
        recommendations: ""
      },
      reactSteps: []
    };

    const response = await hybridAgent.process(initialState);
    if (!response.success) {
      throw new Error(response.error || "Processing failed");
    }

    // Generate personalized response
    currentStep = STEPS.RESPONSE;
    const [personalizedResponse] = await Promise.all([
      model.generateContent({
        contents: [{
          role: 'user',
          parts: [{
            text: `
              Context from previous interactions:
              ${memoryContext.map(m => m.content).join('\n')}
              
              Given this response: "${response.response}"
              Please adapt it for a ${user.learningStyle || 'general'} learner 
              with ${user.difficultyPreference || 'moderate'} difficulty preference.
              Consider their interests: ${user.interests?.join(', ') || 'general topics'}.
              Current emotional state: ${response.emotionalState?.mood}, 
              Confidence: ${response.emotionalState?.confidence}
            `
          }]
        }]
      }),
      memoryService.store({
        content: lastMessage.content,
        userId: user.id,
        tierType: 'active',
        metadata: {
          emotional_value: response.emotionalState?.confidence === 'high' ? 0.9 : 0.7,
          context_relevance: calculateContextRelevance(memoryContext),
          confidence: calculateImportance(response),
          tags: user.interests,
          category: 'chat',
          userContext: {
            userId: user.id,
            learningStyle: user.learningStyle,
            difficultyPreference: user.difficultyPreference
          },
          processingMetadata: {
            processingTimestamp: Date.now(),
            version: '1.0'
          }
        }
      })
    ]); // Close Promise.all here
    const finalResponse = personalizedResponse.response.text()
      .replace(/^\d+:/, '')
      .replace(/\\n/g, '\n')
      .trim();

    // Store chat in database
    await prisma.chat.create({
      data: {
        userId: user.id,
        message: lastMessage.content,
        response: finalResponse,
        metadata: JSON.parse(JSON.stringify({
          emotionalState: response.emotionalState || null,
          reactSteps: response.reactSteps?.map(step => ({
            thought: step.thought,
            action: step.action,
            observation: step.observation,
            response: step.response
          })) || [],
          personalization: {
            learningStyle: user.learningStyle || null,
            difficulty: user.difficultyPreference || null,
            interests: user.interests || []
          },
          memoryMetrics: {
            contextRelevance: calculateContextRelevance(memoryContext),
            importanceScore: calculateImportance(response),
            timestamp: new Date().toISOString(),
            relatedMemories: memoryContext.map(m => m.id)
          }
        })) as ChatMetadata,
      },
    });

    // Consolidate memories if needed
    await memoryService.consolidateMemories();

    // Stream response
    currentStep = STEPS.STREAM;
    const messageData: Message = {
      id: runId,
      role: 'assistant',
      content: finalResponse,
      createdAt: new Date()
    };

    await handlers.handleLLMNewToken(finalResponse);
    await handlers.handleLLMEnd(messageData, runId);

    const streamResponse = new StreamingTextResponse(stream);
    requestCache.set(requestId, streamResponse.clone());
    return streamResponse;

  } catch (error) {
    console.error(`Failed at step: ${currentStep}`, error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: `Failed during ${currentStep}`,
        stack: error instanceof Error ? error.stack : undefined
      }),
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}