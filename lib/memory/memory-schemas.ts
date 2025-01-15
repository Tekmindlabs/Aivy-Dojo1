// lib/memory/memory-schemas.ts
export const MEMORY_SCHEMAS = {
    EMOTIONAL_STATE: 'emotional_state',
    CONTEXT: 'context',
    REACT_STEP: 'react_step'
  } as const;
  
  export type MemorySchemaName = keyof typeof MEMORY_SCHEMAS;
  
export interface MemorySchema {
    name: string;
    description: string;
    updateMode: 'patch' | 'insert';
    parameters: Record<string, any>;
    systemPrompt?: string;
  }
  
  export const DEFAULT_MEMORY_SCHEMAS: MemorySchema[] = [
    {
      name: "User",
      description: "Update this document to maintain up-to-date information about the user in the conversation.",
      updateMode: "patch",
      parameters: {
        type: "object",
        properties: {
          user_name: {
            type: "string",
            description: "The user's preferred name"
          },
          interests: {
            type: "array",
            items: { type: "string" },
            description: "A list of the user's interests"
          },
          preferences: {
            type: "object",
            description: "User preferences and settings"
          }
        }
      }
    },
    {
      name: "Note",
      description: "Save notable memories the user has shared for later recall.",
      updateMode: "insert",
      parameters: {
        type: "object",
        properties: {
          context: {
            type: "string",
            description: "The situation or circumstance where this memory is relevant"
          },
          content: {
            type: "string",
            description: "The specific information being remembered"
          }
        }
      }
    }
  ];