'use client'

import { useState, useEffect, useRef } from 'react'
import type { Contact } from '@/lib/schema'

const STATUSES = [
  { value: 'to-contact',     label: 'To Contact',      color: '#8892B0', bg: '#F0F3F9' },
  { value: 'contacted',      label: 'Contacted',        color: '#0369A1', bg: '#E0F2FE' },
  { value: 'replied',        label: 'Replied',          color: '#7C3AED', bg: '#EDE9FE' },
  { value: 'in-conversation',label: 'In Conversation',  color: '#B45309', bg: '#FEF3C7' },
  { value: 'proposal-sent',  label: 'Proposal Sent',    color: '#BE185D', bg: '#FCE7F3' },
  { value: 'follow-up',      label: 'Follow Up',        color: '#DC2626', bg: '#FEE2E2' },
  { value: 'closed',         label: 'Closed / Won',     color: '#16A34A', bg: '#DCFCE7' },
  { value: 'not-suitable',   label: 'Not Suitable',     color: '#6B7280', bg: '#F3F4F6' },
]

const statusMap = Object.fromEntries(STATUSES.map(s => [s.value, s]))

interface Props {
  initialLeads: Contact[]
}

const STAGE_TABS = [
  { value: 'all',            label: 'All' },
  { value: 'follow-up',     label: 'Follow Up' },
  { value: 'in-conversation', label: 'In Conversation' },
  { value: 'proposal-sent', label: 'Proposal Sent' },
  { value: 'replied',       label: 'Replied' },
  { value: 'contacted',     label: 'Contacted' },
  { value: 'to-contact',    label: 'To Contact' },
  { value: 'closed',        label: 'Clients' },
  { value: 'not-suitable',  label: 'Not Suitable' },
]

export default function LeadsDashboard({ initialLeads }: Props) {
  const [leads, setLeads] = useState<Contact[]>(initialLeads)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState('all')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [editNotes, setEditNotes] = useState<Record<number, string>>({})
  const notesTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({})
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(async () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (activeTab !== 'all') params.set('status', activeTab)
      const res = await fetch(`/api/leads?${params}`)
      const rows: Contact[] = await res.json()
      setLeads(rows)
    }, 300)
  }, [search, activeTab])

  async function updateLead(id: number, patch: Partial<Contact>) {
    const res = await fetch('/api/leads', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...patch }),
    })
    const updated: Contact = await res.json()
    setLeads(prev => prev.map(l => l.id === id ? updated : l))
  }

  function handleNotesChange(id: number, val: string) {
    setEditNotes(prev => ({ ...prev, [id]: val }))
    if (notesTimers.current[id]) clearTimeout(notesTimers.current[id])
    notesTimers.current[id] = setTimeout(() => updateLead(id, { notes: val }), 800)
  }

  // Count by status for badge display
  const countByStatus = STATUSES.reduce((acc, s) => {
    acc[s.value] = leads.filter(l => l.leadStatus === s.value).length
    return acc
  }, {} as Record<string, number>)

  return (
    <div style={{ minHeight: '100vh', background: '#F4F6FA', fontFamily: "'DM Sans', system-ui, sans-serif", fontSize: 14, color: '#1A1F36' }}>

      {/* Top bar */}
      <div style={{ background: '#fff', borderBottom: '1px solid #DDE1ED', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '11px 18px', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '0.01em' }}>Lead Pipeline</span>
          <Stat val={leads.length} label="Showing" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 6, padding: '6px 10px', fontFamily: 'inherit', fontSize: 13, color: '#1A1F36', outline: 'none', width: 160, marginLeft: 'auto' }}
          />
          <NavLinks active="leads" />
        </div>
        {/* Pipeline stage tabs */}
        <div style={{ display: 'flex', gap: 2, padding: '0 18px', overflowX: 'auto' }}>
          {STAGE_TABS.map(tab => {
            const count = tab.value === 'all' ? initialLeads.length : initialLeads.filter(l => l.leadStatus === tab.value).length
            const s = statusMap[tab.value]
            const isActive = activeTab === tab.value
            return (
              <button key={tab.value} onClick={() => setActiveTab(tab.value)} style={{
                fontSize: 12, fontWeight: 500, padding: '8px 12px', border: 'none', borderBottom: isActive ? '2px solid #3B7EF6' : '2px solid transparent',
                background: 'transparent', color: isActive ? '#3B7EF6' : '#4B5270', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {tab.label}
                {count > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 5px', borderRadius: 10, background: isActive ? '#3B7EF6' : (s?.bg ?? '#F0F3F9'), color: isActive ? '#fff' : (s?.color ?? '#4B5270') }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: 960, margin: '0 auto' }}>

        {leads.map(lead => (
          <div key={lead.id} style={{ marginBottom: 8 }}>
            <LeadCard lead={lead} expanded={expanded === lead.id} onToggle={() => setExpanded(expanded === lead.id ? null : lead.id)}
              notes={editNotes[lead.id] ?? lead.notes ?? ''} onNotesChange={val => handleNotesChange(lead.id, val)} onUpdate={patch => updateLead(lead.id, patch)} />
          </div>
        ))}

        {leads.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#8892B0' }}>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#1A1F36', marginBottom: 6 }}>No leads found</p>
            <p>Try adjusting your search or filter.</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>{title}</h2>
        <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 11, color: '#8892B0', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 4, padding: '2px 6px' }}>{count}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {children}
      </div>
    </div>
  )
}

function LeadCard({ lead, expanded, onToggle, notes, onNotesChange, onUpdate }: {
  lead: Contact
  expanded: boolean
  onToggle: () => void
  notes: string
  onNotesChange: (val: string) => void
  onUpdate: (patch: Partial<Contact>) => void
}) {
  const status = statusMap[lead.leadStatus ?? ''] ?? statusMap['to-contact']

  return (
    <div style={{ background: '#fff', border: '1px solid #DDE1ED', borderRadius: 10, overflow: 'hidden', boxShadow: lead.isHotLead ? '0 0 0 2px rgba(220,38,38,0.15)' : 'none' }}>

      {/* Summary row */}
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ width: 34, height: 34, borderRadius: '50%', background: lead.isHotLead ? 'rgba(220,38,38,0.1)' : 'rgba(59,126,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: lead.isHotLead ? '#DC2626' : '#3B7EF6', flexShrink: 0, fontFamily: 'DM Mono, monospace' }}>
          {lead.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.name}</div>
          {lead.whatToSell && <div style={{ fontSize: 11, color: '#8892B0', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lead.whatToSell}</div>}
        </div>
        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: status.bg, color: status.color, whiteSpace: 'nowrap', flexShrink: 0 }}>
          {status.label}
        </span>
        {lead.lastContact && (
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#8892B0', flexShrink: 0 }}>
            {lead.lastContact}
          </span>
        )}
        {lead.futureContact && (
          <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, color: '#B45309', flexShrink: 0, background: '#FEF3C7', padding: '2px 6px', borderRadius: 4 }}>
            FU: {lead.futureContact}
          </span>
        )}
        <SocialLinks lead={lead} />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8892B0" strokeWidth="2.5" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid #DDE1ED', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Status + Hot toggle */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginRight: 4 }}>Status</div>
            {STATUSES.map(s => (
              <button key={s.value} onClick={() => onUpdate({ leadStatus: s.value })}
                style={{ fontSize: 11, fontWeight: 500, padding: '4px 9px', borderRadius: 20, border: lead.leadStatus === s.value ? `1.5px solid ${s.color}` : '1.5px solid transparent', background: s.bg, color: s.color, cursor: 'pointer', fontFamily: 'inherit' }}>
                {s.label}
              </button>
            ))}
            <button onClick={() => onUpdate({ isHotLead: !lead.isHotLead })}
              style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, padding: '4px 12px', borderRadius: 20, border: lead.isHotLead ? '1.5px solid #DC2626' : '1.5px solid #DDE1ED', background: lead.isHotLead ? '#FEE2E2' : '#F0F3F9', color: lead.isHotLead ? '#DC2626' : '#4B5270', cursor: 'pointer', fontFamily: 'inherit' }}>
              {lead.isHotLead ? '🔥 Hot' : 'Mark Hot'}
            </button>
          </div>

          {/* Social links — editable */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <UrlField label="FB Profile" value={lead.fbUrl ?? ''} onChange={val => onUpdate({ fbUrl: val })} />
            <UrlField label="Messenger" value={lead.messengerUrl ?? ''} onChange={val => onUpdate({ messengerUrl: val })} />
            <UrlField label="LinkedIn" value={lead.linkedinUrl ?? ''} onChange={val => onUpdate({ linkedinUrl: val })} />
            <UrlField label="Threads" value={lead.threadsUrl ?? ''} onChange={val => onUpdate({ threadsUrl: val })} />
          </div>

          {/* What to sell */}
          <TextField label="What to offer" value={lead.whatToSell ?? ''} onChange={val => onUpdate({ whatToSell: val })} />

          {/* Future contact date */}
          <DateField label="Follow-up date" value={lead.futureContact ?? ''} onChange={val => onUpdate({ futureContact: val })} />

          {/* Notes */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>Notes</div>
            <textarea value={notes} onChange={e => onNotesChange(e.target.value)}
              style={{ width: '100%', minHeight: 80, background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '9px 11px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', resize: 'vertical', outline: 'none', lineHeight: 1.5, boxSizing: 'border-box' }} />
          </div>
        </div>
      )}
    </div>
  )
}

function SocialLinks({ lead }: { lead: Contact }) {
  const links = [
    { url: lead.fbUrl, icon: 'FB', color: '#3B7EF6' },
    { url: lead.messengerUrl, icon: 'M', color: '#7C3AED' },
    { url: (lead as any).linkedinUrl, icon: 'LI', color: '#0288D1' },
    { url: (lead as any).threadsUrl, icon: 'TH', color: '#1A1F36' },
  ].filter(l => l.url)

  if (!links.length) return null

  return (
    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
      {links.map(l => (
        <a key={l.icon} href={l.url!} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          style={{ fontSize: 9, fontWeight: 700, padding: '2px 5px', borderRadius: 4, background: `${l.color}18`, color: l.color, textDecoration: 'none', border: `1px solid ${l.color}30`, letterSpacing: '0.05em' }}>
          {l.icon}
        </a>
      ))}
    </div>
  )
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  const [local, setLocal] = useState(value)
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>{label}</div>
      <input type="text" value={local} onChange={e => setLocal(e.target.value)} onBlur={() => onChange(local)}
        style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  const [local, setLocal] = useState(value)
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 5 }}>{label}</div>
      <input type="date" value={local} onChange={e => { setLocal(e.target.value); onChange(e.target.value) }}
        style={{ background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none' }} />
    </div>
  )
}

function UrlField({ label, value, onChange }: { label: string; value: string; onChange: (val: string) => void }) {
  const [local, setLocal] = useState(value)
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.09em', color: '#8892B0', marginBottom: 4 }}>{label}</div>
      <input type="url" value={local} onChange={e => setLocal(e.target.value)} onBlur={() => onChange(local)}
        placeholder="https://…"
        style={{ width: '100%', background: '#F0F3F9', border: '1px solid #DDE1ED', borderRadius: 7, padding: '7px 10px', fontFamily: 'inherit', fontSize: 12, color: '#1A1F36', outline: 'none', boxSizing: 'border-box' }} />
    </div>
  )
}

function NavLinks({ active }: { active: 'queue' | 'leads' }) {
  return (
    <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
      <a href="/" style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active === 'queue' ? '#3B7EF6' : '#DDE1ED', background: active === 'queue' ? '#3B7EF6' : 'transparent', color: active === 'queue' ? '#fff' : '#4B5270', textDecoration: 'none' }}>
        Engagement Queue
      </a>
      <a href="/leads" style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 6, border: '1px solid', borderColor: active === 'leads' ? '#3B7EF6' : '#DDE1ED', background: active === 'leads' ? '#3B7EF6' : 'transparent', color: active === 'leads' ? '#fff' : '#4B5270', textDecoration: 'none' }}>
        Warm & Hot Leads
      </a>
    </div>
  )
}

function Stat({ val, label, color }: { val: number; label: string; color?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 16, fontWeight: 500, color: color ?? '#1A1F36' }}>{val}</span>
      <span style={{ fontSize: 10, color: '#8892B0', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</span>
    </div>
  )
}
