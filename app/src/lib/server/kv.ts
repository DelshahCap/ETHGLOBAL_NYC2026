import 'server-only'

// Uses Vercel KV when KV_REST_API_URL + KV_REST_API_TOKEN are present;
// otherwise an in-memory map so local dev and unit tests work with no service.
type KvLike = {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<unknown>
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
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import('@vercel/kv')
    client = kv as unknown as KvLike
  } else {
    client = makeMemoryKv()
  }
  return client
}
