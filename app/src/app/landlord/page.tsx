import { PartyDashboard } from '../components/PartyDashboard'

export default function LandlordPage() {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#EAEFF6] p-8 text-[#0E1A33]">
        <p className="text-sm">Login disabled — set <span className="font-mono">NEXT_PUBLIC_PRIVY_APP_ID</span> to enable.</p>
      </main>
    )
  }
  return <PartyDashboard role="landlord" />
}
