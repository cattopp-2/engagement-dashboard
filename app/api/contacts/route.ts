import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, asc, sql, ilike, ne } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''
  const showExcluded = tag === 'excluded'

  // By default hide excluded; when filter is 'excluded' show only excluded
  const excludeFilter = showExcluded
    ? sql`${contacts.excluded} = 1`
    : sql`(${contacts.excluded} = 0 OR ${contacts.excluded} IS NULL)`

  let rows
  if (search) {
    rows = await db.select().from(contacts)
      .where(sql`${contacts.name} ILIKE ${`%${search}%`}`)
      .orderBy(sql`${contacts.lastEngaged} ASC NULLS FIRST`, asc(contacts.queuePos), asc(contacts.id))
      .limit(200)
  } else {
    rows = await db.select().from(contacts)
      .where(excludeFilter)
      .orderBy(sql`${contacts.lastEngaged} ASC NULLS FIRST`, asc(contacts.queuePos), asc(contacts.id))
      .limit(500)
  }

  let filtered = rows
  if (!showExcluded && !search) {
    // tag filters apply only to the normal queue view
    if (tag === 'untagged') filtered = rows.filter(c => !c.tags || c.tags.length === 0)
    else if (tag === 'engaged') filtered = rows.filter(c => (c.engCount ?? 0) > 0)
    else if (tag && tag !== 'all') filtered = rows.filter(c => c.tags?.includes(tag))
  }

  return NextResponse.json(filtered)
}

export async function PATCH(req: NextRequest) {
  const { id, tags, notes, fbUrl, excluded } = await req.json()
  const updated = await db.update(contacts)
    .set({ tags, notes, fbUrl, ...(excluded !== undefined ? { excluded: excluded ? 1 : 0 } : {}) })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}
