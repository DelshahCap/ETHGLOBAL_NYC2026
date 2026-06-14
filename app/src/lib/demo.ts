// Demo escrow parameters for the tenant self-create flow. Override via NEXT_PUBLIC_*
// env vars at deploy time. The violationId MUST match what Don's CRE workflow is
// configured to poll, or settlement won't fire on stage.
const ZERO = '0x0000000000000000000000000000000000000000' as const

export const DEMO = {
  // HPD ViolationID the escrow tracks (coordinate with the oracle backend).
  violationId: process.env.NEXT_PUBLIC_DEMO_VIOLATION_ID ?? '18100032',
  // The other two parties' wallet addresses (their desktop Privy wallets).
  landlord: (process.env.NEXT_PUBLIC_DEMO_LANDLORD ?? ZERO) as `0x${string}`,
  contractor: (process.env.NEXT_PUBLIC_DEMO_CONTRACTOR ?? ZERO) as `0x${string}`,
  // USDC amounts as decimal strings (6-dp conversion happens via toMicro).
  principal: process.env.NEXT_PUBLIC_DEMO_PRINCIPAL ?? '1',
  contractorFee: process.env.NEXT_PUBLIC_DEMO_FEE ?? '0.3',
} as const

export const DEMO_PARTIES_SET =
  DEMO.landlord !== ZERO && DEMO.contractor !== ZERO
