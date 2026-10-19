/**
 * Let a contact sit in more than one pipeline stage.
 *
 * Adds lead_statuses (a list) alongside the old single lead_status and fills
 * it from whatever each contact already had. lead_status stays in place and
 * keeps holding the furthest-along stage, so nothing that reads it breaks.
 *
 *   npx tsx --env-file=.env.local scripts/add-lead-statuses.ts
 */

import { db } from '../lib/db'
import { sql } from 'drizzle-orm'

async function main() {
  await db.execute(sql`ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_statuses text[]`)
  console.log('column ready')

  const filled = await db.execute(sql`
    UPDATE contacts
    SET lead_statuses = ARRAY[lead_status]
    WHERE lead_status IS NOT NULL
      AND (lead_statuses IS NULL OR lead_statuses = '{}')
    RETURNING id
  `)
  console.log(`${filled.rows.length} contacts given their existing stage`)

  const check = await db.execute(sql`
    SELECT unnest(lead_statuses) AS stage, COUNT(*)::int AS count
    FROM contacts WHERE lead_statuses IS NOT NULL
    GROUP BY 1 ORDER BY 2 DESC
  `)
  console.table(check.rows)
}

main().then(() => process.exit(0), err => { console.error(err); process.exit(1) })
