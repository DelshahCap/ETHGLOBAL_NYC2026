import { describe, it, expect } from 'vitest'
import { toMicro, fromMicro, formatUsdc } from '@/lib/usdc'

describe('usdc 6-decimal helpers', () => {
  it('toMicro parses a decimal string to micro-USDC bigint', () => {
    expect(toMicro('1')).toBe(1_000_000n)
    expect(toMicro('1.1')).toBe(1_100_000n)
    expect(toMicro('0.000001')).toBe(1n)
  })
  it('fromMicro is the inverse of toMicro', () => {
    expect(fromMicro(1_100_000n)).toBe('1.1')
    expect(fromMicro(toMicro('1.1'))).toBe('1.1')
  })
  it('formatUsdc renders a human label', () => {
    expect(formatUsdc(1_100_000n)).toBe('1.1 USDC')
  })
})
