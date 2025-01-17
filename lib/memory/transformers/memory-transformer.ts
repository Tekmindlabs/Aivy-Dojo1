import { ChatMetadata } from '@/app/api/chat/route';
import { MemoryMetadata, EmotionalState } from '../memory-schemas';

export class MemoryTransformer {
  static transformChatToMemoryMetadata(
    chatMetadata: ChatMetadata,
    userId: string
  ): MemoryMetadata {
    return {
      emotional_value: chatMetadata.emotionalState?.confidence === 'high' ? 0.9 : 0.7,
      context_relevance: chatMetadata.memoryMetrics.contextRelevance,
      emotional_state: chatMetadata.emotionalState || undefined,
      category: 'chat',
      confidence: chatMetadata.memoryMetrics.importanceScore,
      tags: chatMetadata.personalization.interests,
      userContext: {
        userId: userId,
        learningStyle: chatMetadata.personalization.learningStyle || undefined,
        interactionType: 'chat'
      },
      processingMetadata: {
        processingTimestamp: Date.now(),
        version: '1.0'
      },
      relationships: {
        connectedMemories: chatMetadata.memoryMetrics.relatedMemories
      },
      reactSteps: chatMetadata.reactSteps,
    };
  }
}
