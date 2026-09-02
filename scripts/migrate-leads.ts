/**
 * Migration: add lead tracking columns to contacts table
 * Run once: npx tsx --env-file=.env.local scripts/migrate-leads.ts
 */
import { sql } from '@vercel/postgres'

async function migrate() {
  console.log('Adding lead tracking columns...')

  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS email text`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_url text`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS threads_url text`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status text`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_hot_lead boolean DEFAULT false`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS what_to_sell text`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contact date`
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS future_contact date`

  console.log('Migration complete.')
  process.exit(0)
}

migrate().catch(e => { console.error(e); process.exit(1) })
