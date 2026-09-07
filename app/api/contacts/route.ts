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
    whereClause = sql`${nameFilter}lead_status = ${leadStatus}`
  } else if (tag === 'pipeline') {
    whereClause = sql`${nameFilter}lead_status IS NOT NULL`
  } else if (tag === 'excluded') {
    whereClause = sql`${nameFilter}excluded = 1`
  } else if (tag === 'engaged') {
    whereClause = sql`${nameFilter}eng_count > 0 AND (excluded = 0 OR excluded IS NULL)`
  } else if (tag === 'untagged') {
    whereClause = sql`${nameFilter}(excluded = 0 OR excluded IS NULL) AND (tags IS NULL OR tags = '{}')`
  } else if (tag && tag !== 'all') {
    whereClause = sql`${nameFilter}tags @> ARRAY[${tag}]::text[] AND (excluded = 0 OR excluded IS NULL)`
  } else {
    whereClause = sql`${nameFilter}(excluded = 0 OR excluded IS NULL) AND (eng_count = 0 OR eng_count IS NULL) AND NOT (tags @> ARRAY['to-check']::text[])`
  }

  // Return pipeline counts if requested
  if (searchParams.get('counts') === '1') {
    const rows = await db.execute(sql`SELECT lead_status, COUNT(*)::int AS count FROM contacts WHERE lead_status IS NOT NULL GROUP BY lead_status`)
    return NextResponse.json(rows.rows)
  }

  // Return tag counts if requested
  if (searchParams.get('counts') === 'tags') {
    const [allRow, untaggedRow, engagedRow, pipelineRow, excludedRow, icpRow, coachRow, warmRow, peerRow, clientRow, vaRow, toCheckRow] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE (excluded = 0 OR excluded IS NULL) AND (tags IS NULL OR tags = '{}')`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE eng_count > 0 AND (excluded = 0 OR excluded IS NULL)`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM contacts WHERE lead_status IS NOT NULL`),
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
    .limit(500)

  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const { name, fbUrl, messengerUrl, linkedinUrl, threadsUrl, leadStatus, notes } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  const created = await db.insert(contacts).values({
    name: name.trim(),
    engCount: 0,
    excluded: 0,
    ...(fbUrl ? { fbUrl } : {}),
    ...(messengerUrl ? { messengerUrl } : {}),
    ...(linkedinUrl ? { linkedinUrl } : {}),
    ...(threadsUrl ? { threadsUrl } : {}),
    ...(leadStatus ? { leadStatus } : {}),
    ...(notes ? { notes } : {}),
  }).returning()
  return NextResponse.json(created[0])
}

export async function PATCH(req: NextRequest) {
  const { id, tags, notes, fbUrl, messengerUrl, excluded, linkedinUrl, linkedinMessages, leadStatus, whatToSell, futureContact, isHotLead } = await req.json()
  const updated = await db.update(contacts)
    .set({
      tags, notes, fbUrl, messengerUrl,
      ...(excluded !== undefined ? { excluded: excluded ? 1 : 0 } : {}),
      ...(linkedinUrl !== undefined ? { linkedinUrl } : {}),
      ...(linkedinMessages !== undefined ? { linkedinMessages } : {}),
      ...(leadStatus !== undefined ? { leadStatus } : {}),
      ...(whatToSell !== undefined ? { whatToSell } : {}),
      ...(futureContact !== undefined ? { futureContact } : {}),
      ...(isHotLead !== undefined ? { isHotLead } : {}),
    })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}
