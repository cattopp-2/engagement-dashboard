/**
 * Merge duplicate contacts.
 *
 * Groups are built from exact name matches and from shared Messenger links,
 * the two signals that are safe to act on without a human eye. Similar
 * spellings are reported but never merged here.
 *
 * Run a dry run first (writes nothing):
 *   npx tsx --env-file=.env.local scripts/merge-duplicate-contacts.ts
 * Then apply:
 *   npx tsx --env-file=.env.local scripts/merge-duplicate-contacts.ts --apply
 *
 * Every record touched is written to backups/ before anything changes.
 */

import { db } from '../lib/db'
import { contacts } from '../lib/schema'
import { inArray, eq } from 'drizzle-orm'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

type Row = typeof contacts.$inferSelect

const APPLY = process.argv.includes('--apply')

// Furthest along wins. Anything not listed loses to anything listed.
const STAGE_ORDER = [
  'not-suitable',
  'said-no',
  'to-contact',
  'contacted',
  'replied',
  'instakit-dm',
  'in-conversation',
  'booked-discovery-call',
  'proposal-sent',
  'follow-up',
  'closed',
]

const rank = (stage: string | null) => (stage ? STAGE_ORDER.indexOf(stage) : -1)

const normName = (name: string) =>
  name.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

function buildGroups(rows: Row[]): Row[][] {
  const parent = new Map<number, number>()
  const find = (id: number): number => {
    const p = parent.get(id)!
    if (p === id) return p
    const root = find(p)
    parent.set(id, root)
    return root
  }
  const union = (a: number, b: number) => parent.set(find(a), find(b))

  rows.forEach(r => parent.set(r.id, r.id))

  const byName = new Map<string, Row[]>()
  const byMessenger = new Map<string, Row[]>()
  for (const r of rows) {
    const n = normName(r.name)
    if (n) {
      const list = byName.get(n) ?? []
      list.push(r)
      byName.set(n, list)
    }
    if (r.messengerUrl) {
      const list = byMessenger.get(r.messengerUrl) ?? []
      list.push(r)
      byMessenger.set(r.messengerUrl, list)
    }
  }
  for (const list of [...Array.from(byName.values()), ...Array.from(byMessenger.values())]) {
    for (let i = 1; i < list.length; i++) union(list[0].id, list[i].id)
  }

  const groups = new Map<number, Row[]>()
  for (const r of rows) {
    const root = find(r.id)
    const list = groups.get(root) ?? []
    list.push(r)
    groups.set(root, list)
  }
  return Array.from(groups.values()).filter(g => g.length > 1)
}

/** Oldest record wins: it holds the queue position and the longest history. */
function pickSurvivor(group: Row[]): Row {
  return [...group].sort((a, b) => a.id - b.id)[0]
}

function mergeGroup(group: Row[]) {
  const survivor = pickSurvivor(group)
  const others = group.filter(r => r.id !== survivor.id)
  const patch: Partial<Row> = {}

  const fillable = [
    'email', 'fbUrl', 'messengerUrl', 'linkedinUrl', 'threadsUrl',
    'whatToSell', 'lastContact', 'futureContact', 'linkedinMessages', 'source',
  ] as const

  for (const field of fillable) {
    if (survivor[field]) continue
    const donor = others.find(r => r[field])
    if (donor) (patch as any)[field] = donor[field]
  }

  // Notes: keep every distinct note, survivor's first.
  const notes: string[] = []
  for (const r of [survivor, ...others]) {
    const n = r.notes?.trim()
    if (n && !notes.some(existing => existing.toLowerCase() === n.toLowerCase())) notes.push(n)
  }
  const mergedNotes = notes.join('\n') || null
  if (mergedNotes !== (survivor.notes ?? null)) patch.notes = mergedNotes

  // Tags: union.
  const tags = Array.from(new Set(group.flatMap(r => r.tags ?? [])))
  if (tags.join('|') !== (survivor.tags ?? []).join('|')) patch.tags = tags

  // Stage: furthest along.
  const bestStage = group.reduce((best, r) => (rank(r.leadStatus) > rank(best) ? r.leadStatus : best), null as string | null)
  if (bestStage && bestStage !== survivor.leadStatus) patch.leadStatus = bestStage

  // Hot if any copy is hot. Engagement count: the highest. Last engaged: the latest.
  if (group.some(r => r.isHotLead) && !survivor.isHotLead) patch.isHotLead = true

  const bestEng = Math.max(...group.map(r => r.engCount ?? 0))
  if (bestEng !== (survivor.engCount ?? 0)) patch.engCount = bestEng

  const lastEngaged = group.map(r => r.lastEngaged).filter(Boolean).sort().pop() ?? null
  if (lastEngaged && lastEngaged !== survivor.lastEngaged) patch.lastEngaged = lastEngaged

  // Included beats excluded.
  const included = group.some(r => !r.excluded)
  if (included && survivor.excluded) patch.excluded = 0

  return { survivor, others, patch }
}

async function main() {
  const rows = await db.select().from(contacts)
  console.log(`${rows.length} contacts`)

  const groups = buildGroups(rows)
  const plans = groups.map(mergeGroup)
  const deleteIds = plans.flatMap(p => p.others.map(r => r.id))

  console.log(`${groups.length} duplicate groups`)
  console.log(`${plans.length} records kept, ${deleteIds.length} records to delete`)

  const backupDir = join(__dirname, '..', 'backups')
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().slice(0, 10)
  const touched = plans.flatMap(p => [p.survivor, ...p.others])
  writeFileSync(join(backupDir, `contacts-before-merge-${stamp}.json`), JSON.stringify(touched, null, 1))
  writeFileSync(
    join(backupDir, `merge-plan-${stamp}.json`),
    JSON.stringify(plans.map(p => ({ keep: p.survivor.id, name: p.survivor.name, delete: p.others.map(r => r.id), patch: p.patch })), null, 1)
  )
  console.log(`backup and plan written to backups/`)

  for (const p of plans.slice(0, 10)) {
    console.log(`  keep ${p.survivor.id} ${p.survivor.name} · delete ${p.others.map(r => r.id).join(', ')} · ${Object.keys(p.patch).join(', ') || 'no field changes'}`)
  }
  if (plans.length > 10) console.log(`  … ${plans.length - 10} more`)

  if (!APPLY) {
    console.log('\nDry run. Nothing written. Re-run with --apply to make the changes.')
    return
  }

  let updated = 0
  for (const p of plans) {
    if (Object.keys(p.patch).length) {
      await db.update(contacts).set(p.patch).where(eq(contacts.id, p.survivor.id))
      updated++
    }
  }
  console.log(`${updated} records updated`)

  for (let i = 0; i < deleteIds.length; i += 200) {
    await db.delete(contacts).where(inArray(contacts.id, deleteIds.slice(i, i + 200)))
  }
  console.log(`${deleteIds.length} duplicate records deleted`)

  const left = await db.select().from(contacts)
  console.log(`${left.length} contacts remain`)
}

main().then(() => process.exit(0), err => { console.error(err); process.exit(1) })
