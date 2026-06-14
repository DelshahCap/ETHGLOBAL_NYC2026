// Client helper for the in-app test-USDC faucet (POST /api/fund). Amount is in
// whole USDC; the server converts to 6-dp micro and signs the transfer.
export async function fundWallet(to: string, amount = 5): Promise<{ hash: string }> {
  const r = await fetch('/api/fund', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ to, amount: String(amount) }),
  })
  if (!r.ok) {
    const body = (await r.json().catch(() => ({}))) as { error?: string }
    throw new Error(body.error ?? 'Faucet request failed')
  }
  return (await r.json()) as { hash: string }
}
