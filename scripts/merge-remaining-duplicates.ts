/**
 * Merge every remaining duplicate person down to a single record.
 *
 * Nothing is deleted. For each group of records sharing a name:
 *   - pick a keeper (furthest along the pipeline, then most complete)
 *   - move everything the others hold onto the keeper, notes included
 *   - hide the others (excluded = 1)
 *
 * Conflicting notes are kept in full, stacked under a divider — tidy later.
 *
 *   npx tsx --env-file=.env.local scripts/merge-remaining-duplicates.ts --dry
 *   npx tsx --env-file=.env.local scripts/merge-remaining-duplicates.ts
 */
import { sql } from '@vercel/postgres'
import { writeFileSync } from 'fs'

const DRY = process.argv.includes('--dry')

const STAGE_RANK: Record<string, number> = {
  'closed': 8,
  'proposal-sent': 7,
  'follow-up': 6,
  'booked-discovery-call': 5,
  'in-conversation': 4,
  'replied': 3,
  'contacted': 2,
  'to-contact': 1,
  'not-suitable': 0,
}

const flat = (s: string | null) => (s ?? '').replace(/\s+/g, ' ').trim()
const rank = (s: string | null) => (s && STAGE_RANK[s] !== undefined ? STAGE_RANK[s] : -1)

function completeness(r: any) {
  return (flat(r.notes) ? flat(r.notes).length / 100 : 0) +
    (r.eng_count ?? 0) +
    (r.email ? 2 : 0) +
    (flat(r.what_to_sell) ? 2 : 0) +
    (r.last_contact ? 2 : 0) +
    (r.future_contact ? 2 : 0) +
    (r.linkedin_url ? 1 : 0) +
    (r.fb_url || r.messenger_url ? 1 : 0)
}

/** Keep every distinct note, in one block, without repeating what's already there. */
function mergeNotes(keeper: any, others: any[]) {
  const blocks: string[] = []
  const seen: string[] = []

  for (const r of [keeper, ...others]) {
    const n = (r.notes ?? '').trim()
    if (!n) continue
    const f = flat(n).toLowerCase()
    if (seen.some(s => s.includes(f))) continue   // already covered word-for-word
    seen.push(f)
    blocks.push(n)
  }

  if (blocks.length <= 1) return blocks[0] ?? null
  return blocks.join('\n\n--- merged from a duplicate record ---\n\n')
}

function laterDate(a: any, b: any) {
  if (!a) return b
  if (!b) return a
  return new Date(a) > new Date(b) ? a : b
}

async function main() {
  const { rows } = await sql`
    SELECT * FROM contacts
    WHERE excluded = 0 OR excluded IS NULL OR lead_status IS NOT NULL
    ORDER BY id
  `

  const groups = new Map<string, any[]>()
  for (const r of rows) {
    const k = flat(r.name).toLowerCase()
    if (!k) continue
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k)!.push(r)
  }

  const work: Array<{ keeper: any; others: any[]; patch: any }> = []

  for (const [, recs] of groups) {
    if (recs.length < 2) continue

    const ranked = [...recs].sort((a, b) =>
      rank(b.lead_status) - rank(a.lead_status) || completeness(b) - completeness(a))
    const keeper = ranked[0]
    const others = ranked.slice(1)

    const patch: any = {}

    const notes = mergeNotes(keeper, others)
    if (notes !== (keeper.notes ?? null)) patch.notes = notes

    for (const f of ['email', 'linkedin_url', 'threads_url', 'fb_url', 'messenger_url'] as const) {
      if (!keeper[f]) {
        const found = others.find(o => o[f])
        if (found) patch[f] = found[f]
      }
    }

    const sells = [keeper, ...others].map(r => flat(r.what_to_sell)).filter(Boolean)
    const uniqueSells = [...new Set(sells)]
    if (uniqueSells.length && uniqueSells.join(' / ') !== flat(keeper.what_to_sell)) {
      patch.what_to_sell = uniqueSells.join(' / ')
    }

    let last = keeper.last_contact
    for (const o of others) last = laterDate(last, o.last_contact)
    if (last !== keeper.last_contact) patch.last_contact = last

    if (!keeper.future_contact) {
      const fu = others.find(o => o.future_contact)
      if (fu) patch.future_contact = fu.future_contact
    }

    const eng = [keeper, ...others].reduce((a, r) => a + (r.eng_count ?? 0), 0)
    if (eng !== (keeper.eng_count ?? 0)) patch.eng_count = eng

    work.push({ keeper, others, patch })
  }

  console.log('duplicate people:', work.length)
  console.log('records to hide:', work.reduce((a, w) => a + w.others.length, 0))
  console.log('keepers gaining merged notes:', work.filter(w => w.patch.notes !== undefined).length)

  if (DRY) {
    console.log('\nDRY RUN — nothing written.\n')
    for (const w of work.slice(0, 8)) {
      console.log(`${w.keeper.name}  keep #${w.keeper.id} (${w.keeper.lead_status ?? 'no stage'})` +
        `  hide ${w.others.map(o => '#' + o.id).join(' ')}` +
        `  fields: ${Object.keys(w.patch).join(', ') || 'none'}`)
    }
    return
  }

  writeFileSync('remaining-merge-backup.json',
    JSON.stringify(work.map(w => ({ keeper: w.keeper, hidden: w.others })), null, 2))
  console.log('\nBacked up to remaining-merge-backup.json')

  let patched = 0
  for (const { keeper, patch } of work) {
    if (!Object.keys(patch).length) continue
    await sql`
      UPDATE contacts SET
        notes          = COALESCE(${patch.notes ?? null},          notes),
        email          = COALESCE(${patch.email ?? null},          email),
        linkedin_url   = COALESCE(${patch.linkedin_url ?? null},   linkedin_url),
        threads_url    = COALESCE(${patch.threads_url ?? null},    threads_url),
        fb_url         = COALESCE(${patch.fb_url ?? null},         fb_url),
        messenger_url  = COALESCE(${patch.messenger_url ?? null},  messenger_url),
        what_to_sell   = COALESCE(${patch.what_to_sell ?? null},   what_to_sell),
        last_contact   = COALESCE(${patch.last_contact ?? null},   last_contact),
        future_contact = COALESCE(${patch.future_contact ?? null}, future_contact),
        eng_count      = COALESCE(${patch.eng_count ?? null},      eng_count)
      WHERE id = ${keeper.id}
    `
    patched++
  }
  console.log('keepers updated:', patched)

  const hideIds = work.flatMap(w => w.others.map(o => o.id))
  const hidden = await sql`
    UPDATE contacts
    SET excluded = 1, lead_status = NULL, tags = ARRAY[]::text[], queue_pos = NULL
    WHERE id = ANY(${hideIds as any})
    RETURNING id
  `
  console.log('records hidden:', hidden.rowCount)

  const left = await sql`
    SELECT COUNT(*)::int AS n FROM (
      SELECT lower(trim(name)) FROM contacts
      WHERE excluded = 0 OR excluded IS NULL OR lead_status IS NOT NULL
      GROUP BY lower(trim(name)) HAVING COUNT(*) > 1
    ) t
  `
  console.log('\nDuplicate people remaining:', left.rows[0].n)
}

main()
