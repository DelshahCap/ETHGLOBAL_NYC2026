import { parseUnits, formatUnits } from 'viem'

export const USDC_DECIMALS = 6

export function toMicro(amount: string): bigint {
  return parseUnits(amount, USDC_DECIMALS)
}

export function fromMicro(micro: bigint): string {
  return formatUnits(micro, USDC_DECIMALS)
}

export function formatUsdc(micro: bigint): string {
  return `${fromMicro(micro)} USDC`
}
