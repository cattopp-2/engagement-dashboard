import { sql } from '@vercel/postgres'

async function migrate() {
  await sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS linkedin_messages text`
  console.log('Column linkedin_messages added (or already existed)')
  process.exit(0)
}

migrate().catch(e => { console.error(e); process.exit(1) })
