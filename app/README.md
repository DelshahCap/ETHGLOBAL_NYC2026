# app/ — HPD Rent Escrow frontend

Next.js admin/test panel + read-only tenant view for the EscrowVault on Arc testnet.

## Local dev
```bash
cd app
cp .env.local.example .env.local   # fill in 4 funded Arc testnet keys; KV optional (in-memory fallback)
npm install
npm run dev                        # http://localhost:3000/admin
```

## Env vars
- `TENANT_PRIVATE_KEY`, `LANDLORD_PRIVATE_KEY`, `CONTRACTOR_PRIVATE_KEY`, `ORACLE_PRIVATE_KEY` — server-only signers (Circle faucet: https://faucet.circle.com).
- `NEXT_PUBLIC_PRIVY_APP_ID` — optional, enables the Privy panel.
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` — Vercel KV; omit locally for in-memory store.

## Deploy (Vercel)
1. New Vercel project, **Root Directory = `app`**.
2. Add the env vars above (mark the 4 keys + KV as not-public).
3. Add a Vercel KV (Upstash) integration to populate the KV vars.
4. Deploy → HTTPS URL works as a PWA (add to home screen).

## Scripts
`npm run dev | build | start | typecheck | test | e2e`
