import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private client: Redis | null = null;
  private memoryStore = new Map<string, { value: string; expiry?: number }>();

  constructor(private config: ConfigService) {}

  getClient(): Redis | null {
    if (!this.client) {
      const uri = this.config.get('REDIS_URI');
      if (uri) {
        this.client = new Redis(uri);
      }
    }
    return this.client;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const c = this.getClient();
    if (c) {
      if (ttlSeconds) await c.setex(key, ttlSeconds, value);
      else await c.set(key, value);
    } else {
      const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
      this.memoryStore.set(key, { value, expiry });
      if (ttlSeconds) {
        setTimeout(() => this.memoryStore.delete(key), ttlSeconds * 1000);
      }
    }
  }

  async get(key: string): Promise<string | null> {
    const c = this.getClient();
    if (c) return c.get(key);
    const entry = this.memoryStore.get(key);
    if (!entry) return null;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.memoryStore.delete(key);
      return null;
    }
    return entry.value;
  }

  async del(key: string): Promise<void> {
    const c = this.getClient();
    if (c) await c.del(key);
    else this.memoryStore.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    const c = this.getClient();
    if (c) return (await c.exists(key)) === 1;
    const entry = this.memoryStore.get(key);
    if (!entry) return false;
    if (entry.expiry && Date.now() > entry.expiry) {
      this.memoryStore.delete(key);
      return false;
    }
    return true;
  }

  async onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }
}
