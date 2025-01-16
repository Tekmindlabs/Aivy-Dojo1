// /tests/memory/helpers/test-scenarios.ts

export const testScenarios = {
    consolidation: {
      similarMemories: [
        TestUtils.generateMockMemory({ content: 'Meeting about project A' }),
        TestUtils.generateMockMemory({ content: 'Project A discussion' }),
        TestUtils.generateMockMemory({ content: 'Project A planning' })
      ],
      dissimilarMemories: [
        TestUtils.generateMockMemory({ content: 'Coffee break' }),
        TestUtils.generateMockMemory({ content: 'Email to client' }),
        TestUtils.generateMockMemory({ content: 'Team lunch' })
      ]
    },
    evolution: {
      agingScenarios: [
        TestUtils.generateMockMemory({ 
          timestamp: Date.now() - 30 * 24 * 60 * 60 * 1000,
          importance: 0.8 
        }),
        TestUtils.generateMockMemory({ 
          timestamp: Date.now() - 7 * 24 * 60 * 60 * 1000,
          importance: 0.5 
        })
      ]
    }
  };