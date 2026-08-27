import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { asc, sql } from 'drizzle-orm'
import Dashboard from '@/components/Dashboard'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const rows = await db.select().from(contacts)
    .orderBy(
      sql`${contacts.lastEngaged} ASC NULLS FIRST`,
      asc(contacts.queuePos),
      asc(contacts.id)
    )
    .limit(200) // load first 200 for initial render; rest loaded client-side

  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(contacts)
  const [{ engaged }] = await db.select({ engaged: sql<number>`count(*) filter (where eng_count > 0)::int` }).from(contacts)

  return <Dashboard initialContacts={rows} totalCount={total} engagedCount={engaged} />
}
