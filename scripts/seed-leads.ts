/**
 * Seed leads from Leads-Everyone.csv into contacts table
 * Run after migrate-leads.ts: npx tsx scripts/seed-leads.ts
 */
import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/vercel-postgres'
import { contacts } from '../lib/schema'
import * as fs from 'fs'
import * as path from 'path'

const db = drizzle(sql)

function parseDate(str: string): string | null {
  if (!str || !str.trim()) return null
  // Try to parse dates like "26 February 2026", "15 April 2026", "7 January 2026"
  const months: Record<string, string> = {
    January: '01', February: '02', March: '03', April: '04',
    May: '05', June: '06', July: '07', August: '08',
    September: '09', October: '10', November: '11', December: '12'
  }
  const match = str.trim().match(/^(\d{1,2})\s+(\w+)\s+(\d{4})$/)
  if (match) {
    const day = match[1].padStart(2, '0')
    const month = months[match[2]]
    const year = match[3]
    if (month) return `${year}-${month}-${day}`
  }
  return null
}

function mapStatus(pipelineStage: string): string {
  const s = (pipelineStage || '').toLowerCase()
  if (s.includes('in conversation')) return 'in-conversation'
  if (s.includes('had call') && s.includes('no sale')) return 'follow-up'
  if (s.includes('booked call')) return 'in-conversation'
  if (s.includes('had call')) return 'follow-up'
  if (s.includes('client')) return 'closed'
  if (s.includes('not suitable')) return 'not-suitable'
  if (s.includes('gone cold')) return 'follow-up'
  if (s.includes('warm lead')) return 'to-contact'
  if (s.includes('made enquiry')) return 'contacted'
  if (s.includes('reached out')) return 'contacted'
  if (s.includes('to ask for call')) return 'contacted'
  if (s.includes('said no')) return 'not-suitable'
  return 'to-contact'
}

async function seedLeads() {
  const csvPath = path.join(__dirname, '../../my leads table/Leads-Everyone.csv')
  const raw = fs.readFileSync(csvPath, 'utf-8')

  // Parse CSV manually to handle multiline quoted fields
  const lines: string[][] = []
  let current = ''
  let inQuote = false
  let row: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i]
    if (ch === '"') {
      if (inQuote && raw[i + 1] === '"') { current += '"'; i++ }
      else inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      row.push(current.trim()); current = ''
    } else if ((ch === '\n' || ch === '\r') && !inQuote) {
      if (ch === '\r' && raw[i + 1] === '\n') i++
      row.push(current.trim()); current = ''
      if (row.some(c => c)) lines.push(row)
      row = []
    } else {
      current += ch
    }
  }
  if (row.length) { row.push(current.trim()); lines.push(row) }

  const header = lines[0]
  const nameIdx = header.indexOf('Name')
  const emailIdx = header.indexOf('Email')
  const liIdx = header.indexOf('LI profile')
  const notesIdx = header.indexOf('notes')
  const messengerIdx = header.indexOf('FB Messenger Link')
  const fbIdx = header.indexOf('FB profile')
  const threadsIdx = header.indexOf('Threads profile')
  const lastContactIdx = header.indexOf('Last Contact')
  const futureContactIdx = header.indexOf('Future Contact')
  const whatToSellIdx = header.indexOf('What I want to sell')
  const pipelineIdx = header.indexOf('Pipeline Stage')

  const rows = lines.slice(1)
  const seen = new Set<string>()
  let inserted = 0

  for (const row of rows) {
    const name = row[nameIdx]?.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)

    const email = row[emailIdx]?.trim() || null
    const linkedinUrl = row[liIdx]?.trim() || null
    const notes = row[notesIdx]?.trim() || null
    const messengerUrl = row[messengerIdx]?.trim() || null
    const fbUrl = row[fbIdx]?.trim() || null
    const threadsUrl = row[threadsIdx]?.trim() || null
    const lastContact = parseDate(row[lastContactIdx]?.trim() || '')
    const futureContact = parseDate(row[futureContactIdx]?.trim() || '')
    const whatToSell = row[whatToSellIdx]?.trim() || null
    const pipelineStage = row[pipelineIdx]?.trim() || ''
    const leadStatus = mapStatus(pipelineStage)
    const isHotLead = ['in-conversation', 'follow-up'].includes(leadStatus)

    const tags: string[] = ['warm']
    if (isHotLead) tags.push('hot')

    try {
      await db.insert(contacts).values({
        name,
        source: 'linkedin',
        tags,
        notes,
        fbUrl,
        messengerUrl,
        email,
        linkedinUrl,
        threadsUrl,
        leadStatus,
        isHotLead,
        whatToSell,
        lastContact: lastContact as any,
        futureContact: futureContact as any,
        queuePos: 99999,
        excluded: 1, // exclude from main engagement queue
      }).onConflictDoNothing()
      inserted++
      console.log(`  ✓ ${name} (${leadStatus})`)
    } catch (e: any) {
      console.log(`  ✗ ${name}: ${e.message}`)
    }
  }

  console.log(`\nDone. Inserted ${inserted} leads.`)
  process.exit(0)
}

seedLeads().catch(e => { console.error(e); process.exit(1) })
