/**
 * Compare the old single stage against the new stage list, to find contacts
 * whose stage never made it into the list.
 *
 *   npx tsx --env-file=.env.local scripts/check-stage-drift.ts
 */

import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  const single = await db.execute(sql`
    SELECT lead_status, COUNT(*)::int AS count FROM contacts
    WHERE lead_status IS NOT NULL GROUP BY 1 ORDER BY 2 DESC
  `)
  console.log('old single stage column:')
  console.table(single.rows)

  const list = await db.execute(sql`
    SELECT unnest(lead_statuses) AS stage, COUNT(*)::int AS count FROM contacts
    WHERE lead_statuses IS NOT NULL GROUP BY 1 ORDER BY 2 DESC
  `)
  console.log('new stage list:')
  console.table(list.rows)

  const drift = await db.execute(sql`
    SELECT id, name, lead_status, lead_statuses FROM contacts
    WHERE lead_status IS NOT NULL
      AND (lead_statuses IS NULL OR NOT (lead_statuses @> ARRAY[lead_status]::text[]))
    ORDER BY id
  `)
  console.log(`${drift.rows.length} contacts whose single stage is missing from their list`)
  console.table(drift.rows.slice(0, 40))
}

main().then(() => process.exit(0), err => { console.error(err); process.exit(1) })
