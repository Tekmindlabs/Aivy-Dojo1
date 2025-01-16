// memory-compression.ts

import { deflate, inflate } from 'zlib';
import { promisify } from 'util';
import { MemoryTierType } from '../memory-schemas';

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  lastOptimizationTime: number;
  totalMemoriesCompressed: number;
  averageCompressionRatio: number;
}

interface CompressionConfig {
  minSizeForCompression: number;
  compressionLevel: number;
  optimizationThreshold: number;
  tierSpecificSettings: Record<MemoryTierType, {
    compressionRatio: number;
    retentionPeriod: number;
  }>;
}

export class MemoryCompression {
  private stats: CompressionStats;
  private config: CompressionConfig;

  constructor(config?: Partial<CompressionConfig>) {
    this.config = {
      minSizeForCompression: 1024, // 1KB
      compressionLevel: 6, // 0-9, higher = better compression but slower
      optimizationThreshold: 0.7,
      tierSpecificSettings: {
        core: {
          compressionRatio: 0.8, // Minimal compression for fast access
          retentionPeriod: Infinity
        },
        active: {
          compressionRatio: 0.6,
          retentionPeriod: 30 * 24 * 60 * 60 * 1000 // 30 days
        },
        background: {
          compressionRatio: 0.4, // Maximum compression
          retentionPeriod: 90 * 24 * 60 * 60 * 1000 // 90 days
        }
      },
      ...config
    };

    this.stats = {
      originalSize: 0,
      compressedSize: 0,
      compressionRatio: 0,
      lastOptimizationTime: Date.now(),
      totalMemoriesCompressed: 0,
      averageCompressionRatio: 0
    };
  }

  // Main compression methods
  async compressMemory(memory: any): Promise<any> {
    try {
      const serializedMemory = JSON.stringify(memory);
      
      // Skip compression for small memories
      if (serializedMemory.length < this.config.minSizeForCompression) {
        return memory;
      }

      const compressionSettings = this.getTierCompressionSettings(memory.tierType);
      const compressed = await this.compressData(
        serializedMemory,
        compressionSettings.compressionRatio
      );

      this.updateCompressionStats(serializedMemory.length, compressed.length);

      return {
        ...memory,
        content: compressed,
        metadata: {
          ...memory.metadata,
          compression: {
            originalSize: serializedMemory.length,
            compressedSize: compressed.length,
            compressionRatio: compressed.length / serializedMemory.length
          }
        }
      };
    } catch (error) {
      console.error('Compression error:', error);
      return memory; // Return uncompressed on error
    }
  }

  async decompressMemory(memory: any): Promise<any> {
    try {
      if (!memory.metadata?.compression) {
        return memory; // Return as-is if not compressed
      }

      const decompressed = await this.decompressData(memory.content);
      const originalMemory = JSON.parse(decompressed);

      return {
        ...originalMemory,
        metadata: {
          ...originalMemory.metadata,
          decompression: {
            timestamp: Date.now()
          }
        }
      };
    } catch (error) {
      console.error('Decompression error:', error);
      return memory; // Return compressed on error
    }
  }

  // Compression utilities
  private async compressData(
    data: string,
    targetRatio: number
  ): Promise<Buffer> {
    const compressionLevel = this.calculateCompressionLevel(targetRatio);
    const buffer = Buffer.from(data, 'utf8');
    return await deflateAsync(buffer, { level: compressionLevel });
  }

  private async decompressData(data: Buffer): Promise<string> {
    const decompressed = await inflateAsync(data);
    return decompressed.toString('utf8');
  }

  // Storage management
  async optimizeStorage(): Promise<void> {
    const currentRatio = this.stats.compressedSize / this.stats.originalSize;
    
    if (currentRatio > this.config.optimizationThreshold) {
      await this.recompressMemories();
      this.stats.lastOptimizationTime = Date.now();
    }
  }

  async cleanupCompressedData(): Promise<void> {
    // Implement cleanup based on tier retention periods
    for (const [tier, settings] of Object.entries(this.config.tierSpecificSettings)) {
      if (settings.retentionPeriod !== Infinity) {
        await this.cleanupTierData(tier as MemoryTierType, settings.retentionPeriod);
      }
    }
  }

  // Helper methods
  private getTierCompressionSettings(tier: MemoryTierType) {
    return this.config.tierSpecificSettings[tier];
  }

  private calculateCompressionLevel(targetRatio: number): number {
    // Convert target ratio to compression level (0-9)
    return Math.floor((1 - targetRatio) * 9);
  }

  private updateCompressionStats(
    originalSize: number,
    compressedSize: number
  ): void {
    this.stats.originalSize += originalSize;
    this.stats.compressedSize += compressedSize;
    this.stats.totalMemoriesCompressed++;
    this.stats.compressionRatio = this.stats.compressedSize / this.stats.originalSize;
    this.stats.averageCompressionRatio = 
      (this.stats.averageCompressionRatio * (this.stats.totalMemoriesCompressed - 1) +
        (compressedSize / originalSize)) /
      this.stats.totalMemoriesCompressed;
  }

  private async recompressMemories(): Promise<void> {
    // Implementation for recompressing memories with better ratios
    // This would be called during optimization
  }

  private async cleanupTierData(
    tier: MemoryTierType,
    retentionPeriod: number
  ): Promise<void> {
    // Implementation for cleaning up old compressed data
    // Based on tier retention periods
  }

  // Public methods for external interaction
  public getCompressionStats(): CompressionStats {
    return { ...this.stats };
  }

  public async validateCompression(
    memory: any,
    maxSizeThreshold?: number
  ): Promise<boolean> {
    const threshold = maxSizeThreshold || this.config.minSizeForCompression;
    const compressionMetadata = memory.metadata?.compression;

    if (!compressionMetadata) {
      return true; // Not compressed, no validation needed
    }

    return (
      compressionMetadata.compressedSize < threshold &&
      compressionMetadata.compressionRatio <= 
        this.config.tierSpecificSettings[memory.tierType as MemoryTierType].compressionRatio
    );
  }

  public async estimateCompressionRatio(data: string): Promise<number> {
    const compressed = await this.compressData(data, 0.5);
    return compressed.length / data.length;
  }
}