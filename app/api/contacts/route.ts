import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, asc, sql, ilike } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''

  const baseQuery = db.select().from(contacts).orderBy(
    sql`${contacts.lastEngaged} ASC NULLS FIRST`,
    asc(contacts.queuePos),
    asc(contacts.id)
  ).limit(500)

  let rows
  if (search) {
    rows = await db.select().from(contacts)
      .where(ilike(contacts.name, `%${search}%`))
      .orderBy(
        sql`${contacts.lastEngaged} ASC NULLS FIRST`,
        asc(contacts.queuePos),
        asc(contacts.id)
      )
      .limit(200)
  } else {
    rows = await baseQuery
  }

  let filtered = rows
  if (tag === 'untagged') {
    filtered = rows.filter(c => !c.tags || c.tags.length === 0)
  } else if (tag === 'engaged') {
    filtered = rows.filter(c => (c.engCount ?? 0) > 0)
  } else if (tag && tag !== 'all') {
    filtered = rows.filter(c => c.tags?.includes(tag))
  }

  return NextResponse.json(filtered)
}

export async function PATCH(req: NextRequest) {
  const { id, tags, notes, fbUrl } = await req.json()
  const updated = await db.update(contacts)
    .set({ tags, notes, fbUrl })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}
