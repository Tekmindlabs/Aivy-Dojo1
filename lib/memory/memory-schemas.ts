// lib/memory/memory-schemas.ts

export const MEMORY_SCHEMAS = {
  USER: 'user',
  CHAT: 'chat',
  CONTEXT: 'context',
  EMOTIONAL_STATE: 'emotional_state'
} as const;

export interface MemorySchema {
  name: string;
  description: string;
  updateMode: 'patch' | 'insert';
  parameters: Record<string, any>;
  systemPrompt?: string;
}

export const DEFAULT_MEMORY_SCHEMAS: MemorySchema[] = [
  {
    name: MEMORY_SCHEMAS.USER,
    description: "Maintain user information and preferences",
    updateMode: "patch",
    parameters: {
      type: "object",
      properties: {
        user_name: {
          type: "string",
          description: "User's preferred name"
        },
        interests: {
          type: "array",
          items: { type: "string" },
          description: "User's interests"
        },
        preferences: {
          type: "object",
          description: "User preferences and settings"
        },
        emotional_state: {
          type: "string",
          description: "Current emotional state"
        }
      }
    }
  },
  {
    name: MEMORY_SCHEMAS.CHAT,
    description: "Store chat interactions and context",
    updateMode: "insert",
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Chat message content"
        },
        context: {
          type: "string",
          description: "Contextual information"
        },
        timestamp: {
          type: "string",
          description: "When this memory was created"
        }
      }
    }
  }
];