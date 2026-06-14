'use client'
import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { usePrivy, useLogin } from '@privy-io/react-auth'
import {
  fetchProfile, saveProfile, USER_ROLES, ROLE_LABELS, ROLE_BLURB,
  type Profile, type UserRole,
} from '@/lib/profile'

// Each role lands on its own dashboard after auth.
const ROUTE_FOR: Record<UserRole, string> = {
  tenant: '/tenant',
  landlord: '/landlord',
  contractor: '/contractor',
}

// Homepage entry point for real users.
//
// Flow (Privy v3): the button opens Privy's hosted email modal — it collects the
// email, emails a one-time passcode, verifies it, and figures out new-vs-returning
// itself. We never see or store a password. Because providers.tsx sets
// embeddedWallets.createOnLogin = 'users-without-wallets', a brand-new user is
// silently given an embedded wallet here; a returning user keeps their existing one.
//
// The ONE thing Privy's modal can't ask is our app role, so for a NEW user we show a
// "who are you?" step right after auth, persist it, then route into the app.
export function TenantAuth() {
  const router = useRouter()
  const { ready, authenticated, user, logout } = usePrivy()
  const [profile, setProfile] = useState<Profile | null>(null)
  const [needRole, setNeedRole] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const email = user?.email?.address

  // Resolve the stored role for whoever is authenticated (covers both a fresh
  // login callback and an already-authenticated session restored on page load).
  const resolveProfile = useCallback(async (userId: string) => {
    setErr('')
    const p = await fetchProfile(userId)
    if (p?.role) { setProfile(p); setNeedRole(false) }
    else { setProfile(null); setNeedRole(true) } // authenticated but no role yet → sign-up step
  }, [])

  const { login } = useLogin({
    onComplete: ({ user }) => { void resolveProfile(user.id) },
    onError: (e) => {
      // Privy reports a closed/cancelled modal as an error code (e.g.
      // 'exited_auth_flow'). That's normal user action, not a failure — ignore it.
      const code = typeof e === 'string' ? e : ''
      if (code.includes('exited') || code.includes('cancel')) { setErr(''); return }
      setErr(code || 'Login failed — please try again')
    },
  })

  useEffect(() => {
    if (authenticated && user) void resolveProfile(user.id)
    if (!authenticated) { setProfile(null); setNeedRole(false) }
  }, [authenticated, user, resolveProfile])

  async function pickRole(role: UserRole) {
    if (!user) return
    setBusy(true); setErr('')
    try {
      const saved = await saveProfile({ userId: user.id, role, email })
      setProfile(saved); setNeedRole(false)
      router.push(ROUTE_FOR[role])
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (!ready) return <Shell><p className="text-sm text-slate-400">Loading…</p></Shell>

  // Signed out → the login/sign-up entry point.
  if (!authenticated) {
    return (
      <Shell>
        <h2 className="font-semibold">Log in or sign up</h2>
        <p className="mb-3 text-sm text-slate-400">
          Enter your email — we’ll send a one-time code. New here? A secure wallet is created for you automatically.
        </p>
        <button
          onClick={() => login({ loginMethods: ['email'] })}
          className="w-full rounded bg-indigo-600 px-4 py-2.5 font-medium hover:bg-indigo-500"
        >
          Log in / Sign up with email
        </button>
        {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}
      </Shell>
    )
  }

  // Authenticated but new → ask the one thing Privy can't: which role.
  if (needRole) {
    return (
      <Shell>
        <h2 className="font-semibold">One last step — who are you?</h2>
        <p className="mb-3 text-sm text-slate-400">
          {email ? <>Signed in as <span className="text-slate-200">{email}</span>. </> : null}
          This sets up your view of the escrow.
        </p>
        <div className="grid gap-2">
          {USER_ROLES.map((r) => (
            <button
              key={r}
              disabled={busy}
              onClick={() => pickRole(r)}
              className="rounded border border-slate-700 bg-slate-800 px-4 py-3 text-left hover:border-indigo-500 disabled:opacity-50"
            >
              <span className="font-medium">{ROLE_LABELS[r]}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{ROLE_BLURB[r]}</span>
            </button>
          ))}
        </div>
        {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}
        <button onClick={logout} className="mt-3 text-xs text-slate-500 underline">Not you? Log out</button>
      </Shell>
    )
  }

  // Authenticated with a known role → quick return into the app.
  return (
    <Shell>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">Signed in</p>
          <p className="font-medium">
            {email ?? 'your account'}
            {profile && <span className="ml-2 rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-300">{ROLE_LABELS[profile.role]}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push(profile ? ROUTE_FOR[profile.role] : '/tenant')} className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500">
            Go to my dashboard
          </button>
          <button onClick={logout} className="text-xs text-slate-500 underline">Log out</button>
        </div>
      </div>
      {err && <p className="mt-2 text-sm text-rose-400">{err}</p>}
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">{children}</section>
}
