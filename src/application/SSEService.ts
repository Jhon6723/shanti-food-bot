export interface SSEEvent {
  type: 'orderCreated' | 'orderUpdated' | 'orderDeleted';
  data: unknown;
}

export type SSESubscriber = (event: SSEEvent) => void;

export class SSEService {
  private readonly subscribers = new Set<SSESubscriber>();

  subscribe(cb: SSESubscriber): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  broadcast(event: SSEEvent): void {
    for (const cb of this.subscribers) {
      try {
        cb(event);
      } catch {
        // Ignore subscriber errors to avoid breaking others
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }
}

// Singleton instance — shared across routes and services
export const sseService = new SSEService();
