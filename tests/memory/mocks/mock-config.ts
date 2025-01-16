// /tests/memory/__mocks__/mock-config.ts

export const mockConfig = {
    memory: {
      maxSize: 1000,
      tiers: {
        core: { maxSize: 100, ttl: Infinity },
        active: { maxSize: 500, ttl: 24 * 60 * 60 * 1000 },
        background: { maxSize: 400, ttl: 7 * 24 * 60 * 60 * 1000 }
      },
      consolidation: {
        threshold: 0.7,
        maxClusterSize: 10
      },
      evolution: {
        agingRate: 0.1,
        reinforcementThreshold: 0.6
      }
    }
  };