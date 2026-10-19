import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { sql } from 'drizzle-orm'
import LeadsDashboard from '@/components/LeadsDashboard'

export default async function LeadsPage() {
  const leads = await db.select().from(contacts)
    .orderBy(sql`is_hot_lead DESC, last_contact DESC NULLS LAST, future_contact ASC NULLS LAST, name ASC`)
    .limit(6000)

  return <LeadsDashboard initialLeads={leads} />
}
