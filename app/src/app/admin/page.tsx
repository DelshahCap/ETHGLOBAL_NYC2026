'use client'
import { useEffect, useState } from 'react'
import { StatusBar } from './components/StatusBar'
import { RolePanel, type Roles } from './components/RolePanel'
import { LifecycleRunner } from './components/LifecycleRunner'
import { ViolationEditor } from './components/ViolationEditor'
import { FunctionTester } from './components/FunctionTester'

export default function AdminPage() {
  const [roles, setRoles] = useState<Roles | null>(null)
  useEffect(() => { fetch('/api/roles').then((r) => r.json()).then((d) => { if (!d.error) setRoles(d) }) }, [])
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <h1 className="text-xl font-bold">Admin / Test Panel</h1>
      <StatusBar />
      <RolePanel roles={roles} />
      <LifecycleRunner roles={roles} />
      <ViolationEditor />
      <FunctionTester />
    </main>
  )
}
