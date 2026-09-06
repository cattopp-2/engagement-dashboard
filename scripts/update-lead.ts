import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/vercel-postgres'
import { contacts } from '../lib/schema'
import { ilike } from 'drizzle-orm'

const db = drizzle(sql)

async function update() {
  const result = await db.update(contacts)
    .set({
      leadStatus: 'booked-discovery-call',
      futureContact: '2026-09-08',
      notes: 'Discovery call booked: 8 Sep 10am',
    })
    .where(ilike(contacts.name, '%anke%'))
    .returning()

  console.log('Updated:', result)
}

update().catch(console.error)
