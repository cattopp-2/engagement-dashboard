'use client'

import { useState, useEffect, useRef } from 'react'
import type { Contact } from '@/lib/schema'

const TAGS = [
  { key: 'to-check', label: 'Already Connected', color: '#D97706', bg: '#FEF3C7' },
]

const TAG_COLOR: Record<string, string> = Object.fromEntries(TAGS.map(t => [t.key, t.color]))

const PIPELINE_STAGES = [
  { value: 'to-contact',           label: 'To Contact',           color: '#8892B0', bg: '#F0F3F9' },
  { value: 'contacted',            label: 'Contacted',             color: '#0369A1', bg: '#E0F2FE' },
  { value: 'replied',              label: 'Replied',               color: '#7C3AED', bg: '#EDE9FE' },
  { value: 'in-conversation',      label: 'In Conversation',       color: '#B45309', bg: '#FEF3C7' },
  { value: 'booked-discovery-call',label: 'Booked Discovery Call', color: '#7C3AED', bg: '#EDE9FE' },
  { value: 'proposal-sent',        label: 'Proposal Sent',         color: '#BE185D', bg: '#FCE7F3' },
  { value: 'follow-up',            label: 'Follow Up',             color: '#DC2626', bg: '#FEE2E2' },
  { value: 'closed',               label: 'Clients',               color: '#16A34A', bg: '#DCFCE7' },
  { value: 'not-suitable',         label: 'Not Suitable',          color: '#6B7280', bg: '#F3F4F6' },
]

const PIPELINE_MAP = Object.fromEntries(PIPELINE_STAGES.map(s => [s.value, s]))

const SOURCE_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  friend:   { bg: 'rgba(59,126,246,0.10)', color: '#3B7EF6', label: 'Friend' },
  follower: { bg: 'rgba(139,92,246,0.10)', color: '#8B5CF6', label: 'Follower' },
  both:     { bg: 'rgba(8,145,178,0.10)',  color: '#0891B2', label: 'Friend + Follower' },
  linkedin: { bg: 'rgba(2,136,209,0.10)',  color: '#0288D1', label: 'LinkedIn' },
}

const TAG_FILTERS = [
  { key: 'all',      label: 'All',                inactiveColor: '#4B5270', inactiveBg: '#F0F3F9' },
  { key: 'untagged', label: 'To Be Engaged',      inactiveColor: '#6B7280', inactiveBg: '#F3F4F6' },
  { key: 'engaged',  label: 'Engaged',            inactiveColor: '#16A34A', inactiveBg: '#DCFCE7' },
  { key: 'to-check', label: 'Already Connected',  inactiveColor: '#D97706', inactiveBg: '#FEF3C7' },
  { key: 'excluded', label: 'Excluded',           inactiveColor: '#4B5270', inactiveBg: '#F0F3F9' },
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
  const [activePipeline, setActivePipeline] = useState('')
  const [pipelineCounts, setPipelineCounts] = useState<Record<string, number>>({})
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({})
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', linkedinUrl: '', fbUrl: '', messengerUrl: '', threadsUrl: '', leadStatus: 'to-contact', notes: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [todayCount, setTodayCount] = useState(0)
  const [totalEngaged, setTotalEngaged] = useState(initEngaged)
  const [flash, setFlash] = useState(false)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [notes, setNotes] = useState('')
  const [fbUrl, setFbUrl] = useState('')
  const [messengerUrl, setMessengerUrl] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  const [linkedinMessages, setLinkedinMessages] = useState('')
  const liMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const current = contacts.find(c => c.id === currentId) ?? null

  useEffect(() => {
    fetch('/api/contacts?counts=1')
      .then(r => r.json())
      .then((rows: { lead_status: string; count: number }[]) => {
        setPipelineCounts(Object.fromEntries(rows.map(r => [r.lead_status, r.count])))
      })
    fetch('/api/contacts?counts=tags')
      .then(r => r.json())
      .then((data: Record<string, number>) => setTagCounts(data))
  }, [])

  useEffect(() => {
    if (current) {
      setNotes(current.notes ?? '')
      setFbUrl(current.fbUrl ?? '')
      setMessengerUrl((current as any).messengerUrl ?? '')
      setLinkedinUrl((current as any).linkedinUrl ?? '')
      setLinkedinMessages((current as any).linkedinMessages ?? '')
    }
  }, [currentId])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeFilter !== 'all') params.set('tag', activeFilter)
      if (activePipeline) params.set('leadStatus', activePipeline)
      const res = await fetch(`/api/contacts?${params}`)
      const rows: Contact[] = await res.json()
      setContacts(rows)
      setCurrentId(rows[0]?.id ?? null)
    }, 300)
  }, [search, activeFilter, activePipeline])

  const filtered = contacts

  async function saveNewLead() {
    if (!addForm.name.trim()) return
    setAddSaving(true)
    const res = await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(addForm),
    })
    const created: Contact = await res.json()
    setContacts(prev => [created, ...prev])
    setAddForm({ name: '', linkedinUrl: '', fbUrl: '', messengerUrl: '', threadsUrl: '', leadStatus: 'to-contact', notes: '' })
    setShowAdd(false)
    setAddSaving(false)
  }

  async function patchContact(id: number, patch: Record<string, any>) {
    const contact = contacts.find(c => c.id === id)
    if (!contact) return null
    const res = await fetch('/api/contacts', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, tags: contact.tags, notes: contact.notes, ...patch }),
    })
    const updated: Contact = await res.json()
    setContacts(prev => prev.map(c => c.id === id ? updated : c))
    return updated
  }

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
    const nextFiltered = filtered.filter(c => c.id !== id)
    setCurrentId(nextFiltered[0]?.id ?? null)
  }

  async function toggleTag(id: number, tag: string) {
    const contact = contacts.find(c => c.id === id)
    if (!contact) return
    const cur = contact.tags ?? []
    const newTags = cur.includes(tag) ? cur.filter(t => t !== tag) : [...cur, tag]
    await patchContact(id, { tags: newTags })
  }

  function handleNotesChange(val: string) {
    setNotes(val)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(() => patchContact(current!.id, { notes: val }), 800)
  }

  async function toggleExclude(id: number, currentlyExcluded: boolean) {
    await patchContact(id, { excluded: !currentlyExcluded })
    setContacts(prev => prev.filter(c => c.id !== id))
    setCurrentId(filtered.filter(c => c.id !== id)[0]?.id ?? null)
  }

  function handleLinkedinMessagesChange(val: string) {
    setLinkedinMessages(val)
    if (liMsgTimer.current) clearTimeout(liMsgTimer.current)
    liMsgTimer.current = setTimeout(() => patchContact(current!.id, { linkedinMessages: val }), 800)
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
        <div style={{ fontSize: 11, color: '#8892B0' }}>{totalCount.toLocaleString()} contacts</div>
      </div>

      {/* Progress */}
      <div style={{ height: 2, background: '#DDE1ED', flexShrink: 0 }}>
        <div style={{ height: '100%', background: '#3B7EF6', width: `${(totalEngaged / totalCount) * 100}%`, transition: 'width 0.5s ease' }} />
      </div>

      {/* Main */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>

        {/* Focus panel */}
        <div style={{ width: '54%', flexShrink: 0, padding: '22px 22px 16px', borderLeft: '1px solid #DDE1ED', overflowY: 'auto', order: 2 }}>
          {current ? (
            <div style={{ background: '#fff', border: '1px solid #DDE1ED', borderRadius: 10, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>

              {/* Header */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 46, height: 46, borderRadius: '50%', background: (current as any).isHotLead ? 'rgba(220,38,38,0.1)' : 'rgba(59,126,246,0.10)', border: '1.5px solid #DDE1ED', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 700, color: (current as any).isHotLead ? '#DC2626' : '#3B7EF6', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
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
                    {current.lastEngaged && <span style={{ fontSize: 10, color: '#8892B0' }}>Last: {current.lastEngaged}</span>}
                    {(current as any).leadStatus && (() => {
                      const s = PIPELINE_MAP[(current as any).leadStatus]
                      return s ? <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color }}>{s.label}</span> : null
                    })()}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 7 }}>Status</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 14, alignItems: 'center' }}>
                {((current as any).engCount ?? 0) > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 9px', borderRadius: 20, background: '#DCFCE7', color: '#16A34A', border: '1.5px solid #16A34A' }}>
                    Engaged ✓
                  </span>
                )}
                {TAGS.map(t => {
                  const active = current.tags?.includes(t.key)
                  return (
                    <button key={t.key} onClick={() => toggleTag(current.id, t.key)} style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', border: `1.5px solid ${active ? t.color : '#DDE1ED'}`, background: active ? t.bg : '#F0F3F9', color: active ? t.color : '#8892B0', fontFamily: 'inherit', transition: 'all 0.12s' }}>
                      {t.label}
                    </button>
                  )
                })}
              </div>

              {/* Pipeline stage */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0' }}>Pipeline Stage</div>
                  <button onClick={() => patchContact(current.id, { isHotLead: !(current as any).isHotLead })}
                    style={{ fontSize: 11, fontWeight: 600, padding: '2px 9px', borderRadius: 20, border: (current as any).isHotLead ? '1.5px solid #DC2626' : '1.5px solid #DDE1ED', background: (current as any).isHotLead ? '#FEE2E2' : '#F0F3F9', color: (current as any).isHotLead ? '#DC2626' : '#4B5270', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                    {(current as any).isHotLead ? '🔥 Hot' : 'Mark Hot'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {PIPELINE_STAGES.map(s => (
                    <button key={s.value} onClick={() => patchContact(current.id, { leadStatus: (current as any).leadStatus === s.value ? null : s.value })}
                      style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', border: (current as any).leadStatus === s.value ? `1.5px solid ${s.color}` : '1.5px solid transparent', background: s.bg, color: s.color, fontFamily: 'inherit' }}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* What to offer + Follow-up date */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 2 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>What to offer</div>
                  <input type="text" defaultValue={(current as any).whatToSell ?? ''} key={`wts-${current.id}`}
                    onBlur={e => patchContact(current.id, { whatToSell: e.target.value })}
                    placeholder="e.g. Business Brain OS…"
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Follow-up date</div>
                  <input type="date" defaultValue={(current as any).futureContact ?? ''} key={`fu-${current.id}`}
                    onChange={e => patchContact(current.id, { futureContact: e.target.value || null })}
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* Social URLs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>FB Profile</div>
                  <input type="url" value={fbUrl} onChange={e => setFbUrl(e.target.value)} onBlur={e => patchContact(current.id, { fbUrl: e.target.value })} placeholder="facebook.com/name…"
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Messenger</div>
                  <input type="url" value={messengerUrl} onChange={e => setMessengerUrl(e.target.value)} onBlur={e => patchContact(current.id, { messengerUrl: e.target.value })} placeholder="facebook.com/messages/…"
                    style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>

              {/* LinkedIn */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>LinkedIn Profile</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input type="url" value={linkedinUrl} onChange={e => setLinkedinUrl(e.target.value)} onBlur={e => patchContact(current.id, { linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/…"
                    style={{ flex: 1, background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
                  {linkedinUrl && (
                    <a href={linkedinUrl} target="_blank" rel="noreferrer"
                      style={{ fontSize: 11, fontWeight: 600, padding: '7px 12px', borderRadius: 7, background: '#E3F0FB', color: '#0288D1', textDecoration: 'none', border: '1px solid #B3D9F5', whiteSpace: 'nowrap', flexShrink: 0 }}>
                      Open ↗
                    </a>
                  )}
                </div>
              </div>

              {/* LinkedIn messages */}
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>LinkedIn Messages</div>
                <textarea value={linkedinMessages} onChange={e => handleLinkedinMessagesChange(e.target.value)}
                  placeholder="Paste your LI message thread here…"
                  style={{ width: '100%', minHeight: 70, background: '#F0F3F9', border: '1px solid #B3D9F5', borderRadius: 7, padding: '9px 11px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
              </div>

              {/* Notes */}
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 7 }}>Notes</div>
              <textarea value={notes} onChange={e => handleNotesChange(e.target.value)} placeholder="Add a note…"
                style={{ width: '100%', minHeight: 68, background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '9px 11px', fontFamily: 'inherit', fontSize: 13, color: '#1A1F36', resize: 'vertical', outline: 'none', marginBottom: 16, lineHeight: 1.5 }} />

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
                  <input type="checkbox" checked={!current.excluded} onChange={() => toggleExclude(current.id, !!current.excluded)}
                    style={{ width: 15, height: 15, cursor: 'pointer', accentColor: '#3B7EF6' }} />
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
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, order: 1 }}>
          <div style={{ padding: '12px 16px 9px', borderBottom: '1px solid #DDE1ED', flexShrink: 0 }}>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center', marginBottom: 8 }}>
              <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name…"
                style={{ flex: 1, background: '#fff', border: '1px solid #DDE1ED', borderRadius: 6, padding: '7px 11px', fontFamily: 'inherit', fontSize: 13, color: '#1A1F36', outline: 'none' }} />
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8892B0', whiteSpace: 'nowrap' }}>
                {filtered.length.toLocaleString()} people
              </span>
              <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 7, background: '#3B7EF6', color: '#fff', border: 'none', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                + Add Lead
              </button>
            </div>
            {/* Tag filters */}
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Tags</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
              {TAG_FILTERS.map(f => {
                const isActive = activeFilter === f.key && !activePipeline
                const count = tagCounts[f.key]
                return (
                  <button key={f.key} onClick={() => { setActiveFilter(f.key); setActivePipeline('') }}
                    style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, border: '1px solid', borderColor: isActive ? '#3B7EF6' : '#DDE1ED', background: isActive ? '#3B7EF6' : f.inactiveBg, color: isActive ? '#fff' : f.inactiveColor, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 5 }}>
                    {f.label}
                    {count !== undefined && count > 0 && (
                      <span style={{ fontSize: 10, fontWeight: 700, lineHeight: 1, padding: '1px 5px', borderRadius: 10, background: isActive ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.08)', color: isActive ? '#fff' : f.inactiveColor }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Pipeline stage filters */}
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Pipeline Stage</div>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PIPELINE_STAGES.map(s => {
                const count = pipelineCounts[s.value] ?? 0
                const isActive = activePipeline === s.value
                return (
                  <button key={s.value} onClick={() => { setActivePipeline(isActive ? '' : s.value); setActiveFilter('pipeline') }}
                    style={{ fontSize: 10, fontWeight: 600, padding: '3px 8px', borderRadius: 20, border: '1px solid', borderColor: isActive ? s.color : '#DDE1ED', background: isActive ? s.bg : 'transparent', color: isActive ? s.color : '#8892B0', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {s.label}
                    {count > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '0px 4px', borderRadius: 8, background: isActive ? s.color : '#DDE1ED', color: isActive ? '#fff' : '#4B5270', minWidth: 14, textAlign: 'center' }}>
                        {count}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {filtered.map((c, i) => {
              const isCurrent = c.id === currentId
              const pipelineStage = (c as any).leadStatus ? PIPELINE_MAP[(c as any).leadStatus] : null
              return (
                <div key={c.id} onClick={() => setCurrentId(c.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 16px', cursor: 'pointer', borderBottom: '1px solid #DDE1ED', background: isCurrent ? 'rgba(59,126,246,0.08)' : 'transparent', borderLeft: isCurrent ? '3px solid #3B7EF6' : '3px solid transparent', paddingLeft: isCurrent ? 13 : 16, minHeight: 40, transition: 'background 0.1s' }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8892B0', width: 26, flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                  {pipelineStage && (
                    <span style={{ fontSize: 9, fontWeight: 600, padding: '1px 6px', borderRadius: 10, background: pipelineStage.bg, color: pipelineStage.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {pipelineStage.label}
                    </span>
                  )}
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

      {/* Add Lead modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: '100%', maxWidth: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Add New Lead</div>

            <AddField label="Name *" value={addForm.name} onChange={v => setAddForm(f => ({ ...f, name: v }))} placeholder="Full name" />
            <AddField label="LinkedIn URL" value={addForm.linkedinUrl} onChange={v => setAddForm(f => ({ ...f, linkedinUrl: v }))} placeholder="https://linkedin.com/in/…" />
            <AddField label="FB Profile URL" value={addForm.fbUrl} onChange={v => setAddForm(f => ({ ...f, fbUrl: v }))} placeholder="https://facebook.com/…" />
            <AddField label="Messenger URL" value={addForm.messengerUrl} onChange={v => setAddForm(f => ({ ...f, messengerUrl: v }))} placeholder="https://m.me/…" />
            <AddField label="Threads URL" value={addForm.threadsUrl} onChange={v => setAddForm(f => ({ ...f, threadsUrl: v }))} placeholder="https://threads.net/…" />

            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Pipeline Stage</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {PIPELINE_STAGES.map(s => (
                  <button key={s.value} onClick={() => setAddForm(f => ({ ...f, leadStatus: s.value }))}
                    style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, cursor: 'pointer', border: addForm.leadStatus === s.value ? `1.5px solid ${s.color}` : '1.5px solid transparent', background: s.bg, color: s.color, fontFamily: 'inherit' }}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Notes</div>
              <textarea value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Any context about this person…"
                style={{ width: '100%', minHeight: 70, background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '8px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', resize: 'vertical', outline: 'none', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={{ fontSize: 13, fontWeight: 500, padding: '8px 16px', borderRadius: 7, border: '1px solid #DDE1ED', background: '#F0F3F9', color: '#4B5270', cursor: 'pointer', fontFamily: 'inherit' }}>
                Cancel
              </button>
              <button onClick={saveNewLead} disabled={!addForm.name.trim() || addSaving}
                style={{ fontSize: 13, fontWeight: 600, padding: '8px 20px', borderRadius: 7, border: 'none', background: addForm.name.trim() ? '#3B7EF6' : '#DDE1ED', color: addForm.name.trim() ? '#fff' : '#8892B0', cursor: addForm.name.trim() ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                {addSaving ? 'Saving…' : 'Add Lead'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AddField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 4 }}>{label}</div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
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
