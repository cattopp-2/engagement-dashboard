'use client'

import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(false)
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    if (res.ok) {
      router.push('/')
      router.refresh()
    } else {
      setError(true)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F4F6FA]">
      <div className="bg-white border border-[#DDE1ED] rounded-xl p-8 shadow-md w-full max-w-sm">
        <h1 className="text-lg font-bold text-[#1A1F36] mb-1">Engagement Dashboard</h1>
        <p className="text-sm text-[#8892B0] mb-6">Enter your password to continue.</p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="border border-[#DDE1ED] rounded-lg px-3 py-2.5 text-sm font-sans text-[#1A1F36] outline-none focus:border-[#3B7EF6] bg-[#F0F3F9]"
          />
          {error && <p className="text-xs text-red-500">Incorrect password.</p>}
          <button
            type="submit"
            disabled={loading || !password}
            className="bg-[#3B7EF6] text-white rounded-lg py-2.5 text-sm font-semibold hover:bg-[#2563EB] transition-colors disabled:opacity-50"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
