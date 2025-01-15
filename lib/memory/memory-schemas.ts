// lib/memory/memory-schemas.ts

export const MEMORY_SCHEMAS = {
  USER: 'user',
  CHAT: 'chat',
  CHAT_MEMORY: 'chat_memory',  // Add this line
  CONTEXT: 'context',
  EMOTIONAL_STATE: 'emotional_state'
} as const;

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
  },
  // Add this new schema
  {
    name: MEMORY_SCHEMAS.CHAT_MEMORY,
    description: "Store chat memory with emotional context",
    updateMode: "insert",
    parameters: {
      type: "object",
      properties: {
        messages: {
          type: "array",
          items: {
            type: "object",
            properties: {
              content: { type: "string" },
              role: { type: "string" },
              timestamp: { type: "string" }
            }
          },
          description: "Array of chat messages"
        },
        emotionalState: {
          type: "object",
          description: "Emotional context of the conversation"
        },
        reactStep: {
          type: "object",
          description: "ReAct framework step information"
        },
        timestamp: {
          type: "string",
          description: "When this memory was created"
        }
      }
    }
  }
];