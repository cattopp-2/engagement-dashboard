/**
 * One-off script to add a single lead to the contacts table
 * Run: npx tsx --env-file=.env.local scripts/add-lead.ts
 */
import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/vercel-postgres'
import { contacts } from '../lib/schema'

const db = drizzle(sql)

async function addLead() {
  const result = await db.insert(contacts).values({
    name: 'Aurelia Rogalli',
    source: 'linkedin',
    tags: ['warm'],
    linkedinUrl: 'https://www.linkedin.com/in/aureliarogalli/',
    leadStatus: 'in-conversation',
    lastContact: '2026-09-05',
    lastEngaged: '2026-09-05',
    engCount: 1,
  }).returning()

  console.log('Added:', result[0])
}

addLead().catch(console.error)
