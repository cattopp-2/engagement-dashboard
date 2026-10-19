import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, asc, sql, gt } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''

  // Build WHERE clause
  let whereClause: ReturnType<typeof sql> | undefined

  const nameFilter = search ? sql`name ILIKE ${'%' + search + '%'} AND ` : sql``

  // Pipeline stage filter takes priority — show ALL contacts with that stage regardless of excluded flag
  const leadStatus = searchParams.get('leadStatus') || ''
  if (leadStatus) {
    whereClause = sql`${nameFilter}lead_statuses @> ARRAY[${leadStatus}]::text[]`
  } else if (tag === 'pipeline') {
    whereClause = sql`${nameFilter}lead_statuses IS NOT NULL AND lead_statuses <> '{}'`
  } else if (tag === 'excluded') {
    whereClause = sql`${nameFilter}excluded = 1`
  } else if (tag === 'engaged') {
    whereClause = sql`${nameFilter}eng_count > 0 AND (excluded = 0 OR excluded IS NULL)`
  } else if (tag === 'untagged') {
    whereClause = sql`${nameFilter}(excluded = 0 OR excluded IS NULL) AND (tags IS NULL OR tags = '{}')`
  } else if (tag && tag !== 'all') {
    whereClause = sql`${nameFilter}tags @> ARRAY[${tag}]::text[] AND (excluded = 0 OR excluded IS NULL)`
  } else {
    whereClause = search ? sql`name ILIKE ${'%' + search + '%'}` : sql`TRUE`
  }

  // Return pipeline counts if requested
  if (searchParams.get('counts') === '1') {
    const rows = await db.execute(sql`SELECT unnest(lead_statuses) AS lead_status, COUNT(*)::int AS count FROM contacts WHERE lead_statuses IS NOT NULL GROUP BY 1`)
    return NextResponse.json(rows.rows)
  }

  // Return tag counts if requested
  if (searchParams.get('counts') === 'tags') {
    const [allRow, untaggedRow, engagedRow, pipelineRow, excludedRow, icpRow, coachRow, warmRow, peerRow, clientRow, vaRow, toCheckRow] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE (excluded = 0 OR excluded IS NULL) AND (tags IS NULL OR tags = '{}')`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE eng_count > 0 AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE lead_statuses IS NOT NULL AND lead_statuses <> '{}'`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE excluded = 1`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['icp']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['coach']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['warm']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['peer']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['client']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['va']::text[] AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE tags @> ARRAY['to-check']::text[] AND (excluded = 0 OR excluded IS NULL)`),
    ])
    return NextResponse.json({
      all:       (allRow.rows[0] as any).count,
      untagged:  (untaggedRow.rows[0] as any).count,
      engaged:   (engagedRow.rows[0] as any).count,
      pipeline:  (pipelineRow.rows[0] as any).count,
      excluded:  (excludedRow.rows[0] as any).count,
      icp:       (icpRow.rows[0] as any).count,
      coach:     (coachRow.rows[0] as any).count,
      warm:      (warmRow.rows[0] as any).count,
      peer:      (peerRow.rows[0] as any).count,
      client:    (clientRow.rows[0] as any).count,
      va:        (vaRow.rows[0] as any).count,
      'to-check': (toCheckRow.rows[0] as any).count,
    })
  }

  // Order: engaged tab sorts by most recent first; everything else by queue order
  const orderClause = tag === 'engaged'
    ? sql`last_engaged DESC NULLS LAST`
    : sql`last_engaged ASC NULLS FIRST, queue_pos ASC NULLS LAST, id ASC`

  const rows = await db.select().from(contacts)
    .where(whereClause)
    .orderBy(orderClause)
    .limit(6000)

  return NextResponse.json(rows)
}

// Furthest along the pipeline, so the single lead_status column can be kept
// in step with the list of stages a contact is in.
const STAGE_ORDER = [
  'not-suitable', 'said-no', 'to-contact', 'contacted', 'replied', 'instakit-dm',
  'in-conversation', 'booked-discovery-call', 'proposal-sent', 'follow-up', 'closed',
]

function furthest(stages: string[] | null | undefined): string | null {
  if (!stages?.length) return null
  return [...stages].sort((a, b) => STAGE_ORDER.indexOf(a) - STAGE_ORDER.indexOf(b)).pop() ?? null
}

export async function POST(req: NextRequest) {
  const { name, fbUrl, messengerUrl, linkedinUrl, threadsUrl, leadStatus, leadStatuses, notes } = await req.json()
  const stages: string[] = leadStatuses ?? (leadStatus ? [leadStatus] : [])
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const created = await db.insert(contacts).values({
    name: name.trim(),
    engCount: 0,
    excluded: 0,
    ...(fbUrl ? { fbUrl } : {}),
    ...(messengerUrl ? { messengerUrl } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(threadsUrl ? { threadsUrl } : {}),
    ...(stages.length ? { leadStatuses: stages, leadStatus: furthest(stages) } : {}),
    ...(notes ? { notes } : {}),
  }).returning()
  return NextResponse.json(created[0])
}

export async function PATCH(req: NextRequest) {
  const { id, name, tags, notes, fbUrl, messengerUrl, excluded, linkedinUrl, linkedinMessages, leadStatus, leadStatuses, whatToSell, lastContact, futureContact, isHotLead, engCount } = await req.json()
  const updated = await db.update(contacts)
    .set({
      tags, notes, fbUrl, messengerUrl,
      ...(name !== undefined ? { name } : {}),
      ...(engCount !== undefined ? { engCount } : {}),
      ...(excluded !== undefined ? { excluded: excluded ? 1 : 0 } : {}),
      ...(linkedinUrl !== undefined ? { linkedinUrl } : {}),
      ...(linkedinMessages !== undefined ? { linkedinMessages } : {}),
      ...(leadStatuses !== undefined
        ? { leadStatuses, leadStatus: furthest(leadStatuses) }
        : leadStatus !== undefined
          ? { leadStatus, leadStatuses: leadStatus ? [leadStatus] : [] }
          : {}),
      ...(whatToSell !== undefined ? { whatToSell } : {}),
      ...(lastContact !== undefined ? { lastContact } : {}),
      ...(futureContact !== undefined ? { futureContact } : {}),
      ...(isHotLead !== undefined ? { isHotLead } : {}),
    })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}

export async function DELETE(req: NextRequest) {
  const { id } = await req.json()
  if (typeof id !== 'number') {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }
  const deleted = await db.delete(contacts).where(eq(contacts.id, id)).returning()
  if (!deleted[0]) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  return NextResponse.json(deleted[0])
}
