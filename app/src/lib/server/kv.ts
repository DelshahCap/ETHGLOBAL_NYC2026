import 'server-only'

// Uses a hosted Redis (Vercel KV / Upstash) when credentials are present;
// otherwise an in-memory map so local dev and unit tests work with no service.
//
// Credential naming varies by how the store was connected:
//  - Vercel's first-party KV injects KV_REST_API_URL / KV_REST_API_TOKEN.
//  - The Upstash Marketplace integration injects UPSTASH_REDIS_REST_URL / _TOKEN.
// Accept either so the store connects regardless of which Vercel used.
type KvLike = {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<unknown>
}

function kvCreds(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN
  return url && token ? { url, token } : null
}

// 'kv' when real credentials are present, 'memory' for the ephemeral fallback.
export function kvBackend(): 'kv' | 'memory' {
  return kvCreds() ? 'kv' : 'memory'
}

function makeMemoryKv(): KvLike {
  const m = new Map<string, unknown>()
  return {
    async get<T>(key: string) { return (m.has(key) ? (m.get(key) as T) : null) },
    async set<T>(key: string, value: T) { m.set(key, value); return 'OK' },
  }
}

let client: KvLike | null = null

export async function getKv(): Promise<KvLike> {
  if (client) return client
  const creds = kvCreds()
  if (creds) {
    // Construct the Upstash REST client explicitly. Redis.fromEnv() only reads
    // UPSTASH_REDIS_REST_* names, but Vercel's integration provides KV_REST_API_*;
    // kvCreds() resolves either. get/set auto-(de)serialize JSON, matching KvLike.
    const { Redis } = await import('@upstash/redis')
    client = new Redis(creds) as unknown as KvLike
  } else {
    client = makeMemoryKv()
  }
  return client
}
