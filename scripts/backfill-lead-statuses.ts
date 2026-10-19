/**
 * Put each contact's old single stage back into their stage list, wherever it
 * went missing. Adds only, never removes a stage.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-lead-statuses.ts
 */

import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function counts(label: string) {
  const rows = await db.execute(sql`
    SELECT unnest(lead_statuses) AS stage, COUNT(*)::int AS count FROM contacts
    WHERE lead_statuses IS NOT NULL GROUP BY 1 ORDER BY 2 DESC
  `)
  console.log(label)
  console.table(rows.rows)
}

async function main() {
  const drift = await db.execute(sql`
    SELECT id, name, lead_status FROM contacts
    WHERE lead_status IS NOT NULL
      AND (lead_statuses IS NULL OR NOT (lead_statuses @> ARRAY[lead_status]::text[]))
    ORDER BY id
  `)
  console.log(`${drift.rows.length} contacts have a stage missing from their list`)
  console.table(drift.rows.slice(0, 40))

  await counts('stage counts before:')

  const fixed = await db.execute(sql`
    UPDATE contacts
    SET lead_statuses = COALESCE(lead_statuses, '{}'::text[]) || ARRAY[lead_status]::text[]
    WHERE lead_status IS NOT NULL
      AND (lead_statuses IS NULL OR NOT (lead_statuses @> ARRAY[lead_status]::text[]))
    RETURNING id
  `)
  console.log(`${fixed.rows.length} contacts repaired`)

  await counts('stage counts after:')
}

main().then(() => process.exit(0), err => { console.error(err); process.exit(1) })
