export class MemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly context?: any
  ) {
    super(message);
    this.name = 'MemoryError';
  }
}

export class ErrorHandler {
  private static async logError(error: MemoryError): Promise<void> {
    console.error(`[MemoryError] ${error.code}: ${error.message}`, {
      context: error.context,
      stack: error.stack
    });
  }

  private static async notifyAdmin(error: MemoryError): Promise<void> {
    // TODO: Implement actual notification system
    console.warn(`[Admin Notification] ${error.code}: ${error.message}`);
  }

  static async handleError(error: any): Promise<void> {
    if (error instanceof MemoryError) {
      await this.logError(error);
      await this.notifyAdmin(error);
    }
    throw error;
  }
}
