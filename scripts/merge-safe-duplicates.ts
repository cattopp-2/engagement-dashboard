import { sql } from '@vercel/postgres'
import { writeFileSync } from 'fs'

const DRY = process.argv.includes('--dry')
const norm = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()

async function main() {
  const { rows } = await sql`
    SELECT c.* FROM contacts c
    JOIN (
      SELECT lower(trim(name)) AS key FROM contacts
      GROUP BY lower(trim(name)) HAVING COUNT(*) > 1
    ) d ON lower(trim(c.name)) = d.key
    WHERE c.excluded = 0 OR c.excluded IS NULL OR c.lead_status IS NOT NULL
    ORDER BY lower(trim(c.name)), c.id
  `

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const k = String(r.name).trim().toLowerCase()
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  const safe: any[] = []
  const skipped: any[] = []

  for (const [, recs] of groups) {
    if (recs.length !== 2) { skipped.push({ why: 'not a clean pair', recs: recs.map(r => r.id) }); continue }

    const li = recs.find(r => r.source === 'linkedin')
    const fb = recs.find(r => r !== li)
    if (!li || !fb) { skipped.push({ why: 'no linkedin copy', recs: recs.map(r => r.id) }); continue }

    // Nothing is lost if the duplicate's notes are empty, or already
    // contained word-for-word in the notes on the record we keep.
    const fbNotes = norm(fb.notes)
    const liNotes = norm(li.notes)
    const notesSafe = !fbNotes || fbNotes === liNotes || liNotes.includes(fbNotes)

    const blank =
      notesSafe &&
      (fb.eng_count ?? 0) === 0 &&
      !fb.lead_status &&
      !fb.email &&
      !norm(fb.what_to_sell) &&
      !fb.last_contact &&
      !fb.future_contact

    if (!blank) {
      const why = !notesSafe ? 'notes would be lost'
        : (fb.eng_count ?? 0) > 0 ? 'has engagement history'
        : 'has other data'
      skipped.push({ why, name: fb.name, id: fb.id })
      continue
    }

    safe.push({ li, fb })
  }

  console.log('clean blank duplicates:', safe.length)
  console.log('skipped (left alone):', skipped.length)
  const tally = skipped.reduce((a: any, s) => { a[s.why] = (a[s.why] || 0) + 1; return a }, {})
  console.log('skip reasons:', JSON.stringify(tally, null, 2))

  const linkCarry = safe.filter(({ li, fb }) =>
    (fb.fb_url || fb.messenger_url) && !(li.fb_url || li.messenger_url))
  console.log('of those, carrying a Facebook/Messenger link across first:', linkCarry.length)

  if (DRY) {
    console.log('\nDRY RUN — nothing written.')
    console.log('sample:', safe.slice(0, 5).map(s => s.fb.name + ' #' + s.fb.id + ' -> keep #' + s.li.id))
    return
  }

  writeFileSync('safe-clear-backup.json', JSON.stringify(safe.map(s => s.fb), null, 2))
  console.log('\nBacked up', safe.length, 'records to safe-clear-backup.json')

  for (const { li, fb } of linkCarry) {
    await sql`
      UPDATE contacts
      SET fb_url = COALESCE(fb_url, ${fb.fb_url}),
          messenger_url = COALESCE(messenger_url, ${fb.messenger_url})
      WHERE id = ${li.id}
    `
  }
  console.log('Carried links onto', linkCarry.length, 'keepers')

  const ids = safe.map(s => s.fb.id)
  const hidden = await sql`
    UPDATE contacts
    SET excluded = 1, lead_status = NULL, tags = ARRAY[]::text[], queue_pos = NULL
    WHERE id = ANY(${ids as any})
    RETURNING id
  `
  console.log('Hidden:', hidden.rowCount)

  const remaining = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT lower(trim(name)) FROM contacts
      WHERE excluded = 0 OR excluded IS NULL
      GROUP BY lower(trim(name)) HAVING COUNT(*) > 1
    ) t
  `
  const toContact = await sql`SELECT COUNT(*)::int AS n FROM contacts WHERE lead_status = 'to-contact'`
  console.log('\nDuplicate names still visible:', remaining.rows[0].n)
  console.log('To Contact count now:', toContact.rows[0].n)
}

main()
