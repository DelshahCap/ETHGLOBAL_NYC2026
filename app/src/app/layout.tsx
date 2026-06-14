import type { Metadata, Viewport } from 'next'
import { Bricolage_Grotesque, IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { SwRegister } from './sw-register'

// Display = Bricolage Grotesque (character), body = IBM Plex Sans (civic),
// mono = IBM Plex Mono (codes/addresses). Exposed as CSS vars; applied per-page.
const display = Bricolage_Grotesque({ subsets: ['latin'], variable: '--font-display', display: 'swap' })
const body = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-body', display: 'swap' })
const mono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-mono', display: 'swap' })

export const metadata: Metadata = {
  title: 'HPD Rent Escrow — Admin',
  manifest: '/manifest.webmanifest',
}
export const viewport: Viewport = { themeColor: '#0f172a' }

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`min-h-screen bg-slate-950 text-slate-100 antialiased ${display.variable} ${body.variable} ${mono.variable}`}>
        <SwRegister />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
