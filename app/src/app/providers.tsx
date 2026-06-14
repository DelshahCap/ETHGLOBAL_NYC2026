'use client'
import { PrivyProvider } from '@privy-io/react-auth'
import { arcTestnet } from '@/lib/chain'

export function Providers({ children }: { children: React.ReactNode }) {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID
  if (!appId) return <>{children}</> // Privy optional; app works without it
  return (
    <PrivyProvider
      appId={appId}
      config={{
        defaultChain: arcTestnet,
        supportedChains: [arcTestnet],
        // v3 API: embeddedWallets uses nested { ethereum: { createOnLogin } }
        // instead of the flat { createOnLogin } shape from older versions
        embeddedWallets: { ethereum: { createOnLogin: 'users-without-wallets' } },
      }}
    >
      {children}
    </PrivyProvider>
  )
}
