'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import type { Contact } from '@/lib/schema'

const TAGS = [
  { key: 'icp',      label: 'ICP',        color: '#16A34A', bg: '#DCFCE7' },
  { key: 'coach',    label: 'Coach',      color: '#7C3AED', bg: '#EDE9FE' },
  { key: 'warm',     label: 'Warm Lead',  color: '#B45309', bg: '#FEF3C7' },
  { key: 'peer',     label: 'Peer',       color: '#0369A1', bg: '#E0F2FE' },
  { key: 'client',   label: 'Client',     color: '#BE185D', bg: '#FCE7F3' },
  { key: 'va',       label: 'VA/OBM',     color: '#6B7280', bg: '#F3F4F6' },
  { key: 'to-check', label: 'To Check',   color: '#D97706', bg: '#FEF3C7' },
]

const TAG_COLOR: Record<string, string> = Object.fromEntries(TAGS.map(t => [t.key, t.color]))

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  friend:   { bg: 'rgba(59,126,246,0.10)', color: '#3B7EF6', label: 'Friend' },
  follower: { bg: 'rgba(139,92,246,0.10)', color: '#8B5CF6', label: 'Follower' },
  both:     { bg: 'rgba(8,145,178,0.10)',  color: '#0891B2', label: 'Friend + Follower' },
  linkedin: { bg: 'rgba(2,136,209,0.10)',  color: '#0288D1', label: 'LinkedIn' },
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'untagged', label: 'Untagged' },
  { key: 'icp', label: 'ICP' },
  { key: 'coach', label: 'Coach' },
  { key: 'warm', label: 'Warm' },
  { key: 'peer', label: 'Peer' },
  { key: 'client', label: 'Client' },
  { key: 'va', label: 'VA/OBM' },
  { key: 'engaged', label: 'Engaged' },
  { key: 'to-check', label: 'To Check' },
  { key: 'excluded', label: 'Excluded' },
]

interface Props {
  initialContacts: Contact[]
  totalCount: number
  engagedCount: number
}

export default function Dashboard({ initialContacts, totalCount, engagedCount: initEngaged }: Props) {
  const [contacts, setContacts] = useState<Contact[]>(initialContacts)
  const [currentId, setCurrentId] = useState<number | null>(initialContacts[0]?.id ?? null)
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState('all')
  const [todayCount, setTodayCount] = useState(0)
  const [totalEngaged, setTotalEngaged] = useState(initEngaged)
  const [flash, setFlash] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notes, setNotes] = useState('')
  const [fbUrl, setFbUrl] = useState('')
  const [messengerUrl, setMessengerUrl] = useState('')
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = contacts.find(c => c.id === currentId) ?? null

  useEffect(() => {
    if (current) {
      setNotes(current.notes ?? '')
      setFbUrl(current.fbUrl ?? '')
      setMessengerUrl((current as any).messengerUrl ?? '')
    }
  }, [currentId])

  // When search or filter changes, query the server (search uses ilike on full DB)
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeFilter !== 'all') params.set('tag', activeFilter)
      const res = await fetch(`/api/contacts?${params}`)
      const rows: Contact[] = await res.json()
      setContacts(rows)
      setCurrentId(rows[0]?.id ?? null)
    }, 300)
  }, [search, activeFilter])

  const filtered = contacts

  async function engage(id: number, count: boolean) {
    const res = await fetch('/api/engage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, count }),
    })
    const updated: Contact = await res.json()

    setContacts(prev => {
      const rest = prev.filter(c => c.id !== id)
      return [...rest, updated].sort((a, b) => {
        if (!a.lastEngaged && !b.lastEngaged) return (a.queuePos ?? 0) - (b.queuePos ?? 0)
        if (!a.lastEngaged) return -1
        if (!b.lastEngaged) return 1
        if (a.lastEngaged !== b.lastEngaged) return a.lastEngaged < b.lastEngaged ? -1 : 1
        return (a.queuePos ?? 0) - (b.queuePos ?? 0)
      })
    })

    if (count) {
      setTodayCount(n => n + 1)
      setTotalEngaged(n => n + 1)
      setFlash(true)
      setTimeout(() => setFlash(false), 1200)
    }

    // Advance to next in filtered list
    const nextFiltered = filtered.filter(c => c.id !== id)
    setCurrentId(nextFiltered[0]?.id ?? null)
  }

  async function toggleTag(id: number, tag: string) {
    const contact = contacts.find(c => c.id === id)
    if (!contact) return
    const current = contact.tags ?? []
    const newTags = current.includes(tag) ? current.filter(t => t !== tag) : [...current, tag]
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: newTags, notes: contact.notes }),
    })
    const updated: Contact = await res.json()
    setContacts(prev => prev.map(c => c.id === id ? updated : c))
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => saveNotes(val), 800)
  }

  async function saveNotes(val: string) {
    if (!current) return
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, tags: current.tags, notes: val, fbUrl: current.fbUrl }),
    })
    const updated: Contact = await res.json()
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  async function toggleExclude(id: number, currentlyExcluded: boolean) {
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, excluded: !currentlyExcluded }),
    })
    const updated: Contact = await res.json()
    // Remove from current view (they no longer belong in this filter)
    setContacts(prev => prev.filter(c => c.id !== id))
    const nextFiltered = filtered.filter(c => c.id !== id)
    setCurrentId(nextFiltered[0]?.id ?? null)
  }

  async function saveFbUrl(val: string) {
    if (!current) return
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, tags: current.tags, notes: current.notes, fbUrl: val, messengerUrl }),
    })
    const updated: Contact = await res.json()
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  async function saveMessengerUrl(val: string) {
    if (!current) return
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id, tags: current.tags, notes: current.notes, fbUrl, messengerUrl: val }),
    })
    const updated: Contact = await res.json()
    setContacts(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const initials = (name: string) => name.split(' ').map(w => w[0]).slice(0, 2).join('')

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: '#F4F6FA', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: '#1A1F36' }}>

      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '11px 18px', background: '#fff', borderBottom: '1px solid #DDE1ED', flexShrink: 0, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>Engagement Queue</span>
        <div style={{ display: 'flex', gap: 20, flex: 1 }}>
          <Stat val={todayCount} label="Today" />
          <Stat val={totalEngaged} label="Engaged" />
          <Stat val={totalCount - totalEngaged} label="Remaining" />
        </div>
        <div style={{ fontSize: 11, color: '#8892B0' }}>
          {totalCount.toLocaleString()} contacts
        </div>
      </div>

      {/* Progress */}
      <div style={{ height: 2, background: '#DDE1ED', flexShrink: 0 }}>
        <div style={{ height: '100%', background: '#3B7EF6', width: `${(totalEngaged / totalCount) * 100}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Focus panel */}
        <div style={{ width: '54%', flexShrink: 0, padding: '22px 22px 16px', borderRight: '1px solid #DDE1ED', overflowY: 'auto' }}>
          {current ? (
            <div style={{ background: '#fff', border: '1px solid #DDE1ED', borderRadius: 10, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
              {/* Header */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(59,126,246,0.10)', border: '1.5px solid #DDE1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: '#3B7EF6', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
                  {initials(current.name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2, marginBottom: 5 }}>{current.name}</div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    {current.source && SOURCE_STYLES[current.source] && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 20, textTransform: 'uppercase', letterSpacing: '0.07em', background: SOURCE_STYLES[current.source].bg, color: SOURCE_STYLES[current.source].color }}>
                        {SOURCE_STYLES[current.source].label}
                      </span>
                    )}
                    {(current.engCount ?? 0) > 0 && (
                      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8892B0', padding: '2px 6px', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 4 }}>
                        {current.engCount}×
                      </span>
                    )}
                    {current.lastEngaged && (
                      <span style={{ fontSize: 10, color: '#8892B0' }}>Last: {current.lastEngaged}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 7 }}>Tags — click to toggle</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14 }}>
                {TAGS.map(t => {
                  const active = current.tags?.includes(t.key)
                  return (
                    <button key={t.key} onClick={() => toggleTag(current.id, t.key)} style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', border: active ? `1.5px solid ${t.color}` : '1.5px solid transparent', background: t.bg, color: t.color, fontFamily: 'inherit', transition: 'opacity 0.12s' }}>
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {/* Facebook URLs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>FB Profile URL</div>
                  <input type="url" value={fbUrl} onChange={e => setFbUrl(e.target.value)} onBlur={e => saveFbUrl(e.target.value)} placeholder="facebook.com/name…"
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Messenger URL</div>
                  <input type="url" value={messengerUrl} onChange={e => setMessengerUrl(e.target.value)} onBlur={e => saveMessengerUrl(e.target.value)} placeholder="facebook.com/messages/…"
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Notes */}
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 7 }}>Notes</div>
              <textarea
                value={notes}
                onChange={e => handleNotesChange(e.target.value)}
                placeholder="Add a note…"
                style={{ width: '100%', minHeight: 68, background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, color: '#1A1F36', resize: 'vertical', outline: 'none', marginBottom: 16, lineHeight: 1.5 }}
              />

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={current.fbUrl || `https://www.facebook.com/search/people/?q=${encodeURIComponent(current.name)}`} target="_blank" rel="noreferrer"
                  style={{ background: 'rgba(59,126,246,0.10)', color: '#3B7EF6', border: '1px solid rgba(59,126,246,0.2)', padding: '11px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                  Profile
                </a>
                {(current as any).messengerUrl && (
                  <a href={(current as any).messengerUrl} target="_blank" rel="noreferrer"
                    style={{ background: 'rgba(139,92,246,0.10)', color: '#7C3AED', border: '1px solid rgba(139,92,246,0.2)', padding: '11px 14px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
                    Message
                  </a>
                )}
                <button onClick={() => engage(current.id, true)} style={{ flex: 1, background: '#3B7EF6', color: '#fff', border: 'none', padding: '11px 16px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontFamily: 'inherit' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  Done — Next
                </button>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#F0F3F9', border: '1px solid #DDE1ED', padding: '11px 14px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', color: current.excluded ? '#DC2626' : '#4B5270' }}>
                  <input
                    type="checkbox"
                    checked={!current.excluded}
                    onChange={() => toggleExclude(current.id, !!current.excluded)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#3B7EF6' }}
                  />
                  {current.excluded ? 'Excluded' : 'Include'}
                </label>
              </div>

              {flash && (
                <div style={{ background: '#DCFCE7', color: '#166534', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 7, marginTop: 10 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                  Moved to bottom
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#8892B0' }}>
              <p style={{ fontSize: 18, fontWeight: 600, color: '#1A1F36', marginBottom: 6 }}>No one here</p>
              <p>Try adjusting your filter.</p>
            </div>
          )}
        </div>

        {/* Queue panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
          <div style={{ padding: '12px 16px 9px', borderBottom: '1px solid #DDE1ED', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name…"
                style={{ flex: 1, background: '#fff', border: '1px solid #DDE1ED', borderRadius: 6, padding: '7px 11px', fontFamily: 'inherit', fontSize: 13, color: '#1A1F36', outline: 'none' }}
              />
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8892B0', whiteSpace: 'nowrap' }}>
                {filtered.length.toLocaleString()} people
              </span>
            </div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setActiveFilter(f.key)} style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, border: '1px solid', borderColor: activeFilter === f.key ? '#3B7EF6' : '#DDE1ED', background: activeFilter === f.key ? '#3B7EF6' : '#F0F3F9', color: activeFilter === f.key ? '#fff' : '#4B5270', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.map((c, i) => {
              const isCurrent = c.id === currentId
              const srcColor = c.source && SOURCE_STYLES[c.source] ? SOURCE_STYLES[c.source].color : '#8892B0'
              return (
                <div key={c.id} onClick={() => setCurrentId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #DDE1ED', background: isCurrent ? 'rgba(59,126,246,0.08)' : 'transparent', borderLeft: isCurrent ? '3px solid #3B7EF6' : '3px solid transparent', paddingLeft: isCurrent ? 13 : 16, minHeight: 40, transition: 'background 0.1s' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8892B0', width: 26, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  <span style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                    {(c.tags ?? []).map(t => (
                      <span key={t} style={{ width: 6, height: 6, borderRadius: '50%', background: TAG_COLOR[t] ?? '#ccc' }} />
                    ))}
                  </span>
                  {c.lastEngaged && (
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8892B0', flexShrink: 0 }}>{c.lastEngaged}</span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function Stat({ val, label }: { val: number; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{val.toLocaleString()}</span>
      <span style={{ fontSize: 10, color: '#8892B0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
    </div>
  )
}
