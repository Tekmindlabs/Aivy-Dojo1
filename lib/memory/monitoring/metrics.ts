export class MemoryMetrics {
  private metrics: Map<string, number> = new Map();
  
  trackOperation(operation: string): void {
    const current = this.metrics.get(operation) || 0;
    this.metrics.set(operation, current + 1);
  }
  
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }
}
