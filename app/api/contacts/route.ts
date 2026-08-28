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

  if (search) {
    whereClause = sql`name ILIKE ${'%' + search + '%'}`
  } else if (tag === 'excluded') {
    whereClause = sql`excluded = 1`
  } else if (tag === 'engaged') {
    whereClause = sql`eng_count > 0 AND (excluded = 0 OR excluded IS NULL)`
  } else if (tag === 'untagged') {
    whereClause = sql`(excluded = 0 OR excluded IS NULL) AND (tags IS NULL OR tags = '{}')`
  } else if (tag && tag !== 'all') {
    whereClause = sql`(excluded = 0 OR excluded IS NULL) AND ${tag} = ANY(tags)`
  } else {
    // default: all queue (non-excluded)
    whereClause = sql`(excluded = 0 OR excluded IS NULL)`
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

export async function PATCH(req: NextRequest) {
  const { id, tags, notes, fbUrl, excluded } = await req.json()
  const updated = await db.update(contacts)
    .set({ tags, notes, fbUrl, ...(excluded !== undefined ? { excluded: excluded ? 1 : 0 } : {}) })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}
