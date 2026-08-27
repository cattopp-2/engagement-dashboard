import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, asc, isNull, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const tag = searchParams.get('tag') || ''

  let query = db.select().from(contacts)

  const rows = await db.select().from(contacts)
    .orderBy(
      sql`${contacts.lastEngaged} ASC NULLS FIRST`,
      asc(contacts.queuePos),
      asc(contacts.id)
    )

  let filtered = rows
  if (search) {
    filtered = filtered.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
  }
  if (tag === 'untagged') {
    filtered = filtered.filter(c => !c.tags || c.tags.length === 0)
  } else if (tag === 'engaged') {
    filtered = filtered.filter(c => (c.engCount ?? 0) > 0)
  } else if (tag && tag !== 'all') {
    filtered = filtered.filter(c => c.tags?.includes(tag))
  }

  return NextResponse.json(filtered)
}

export async function PATCH(req: NextRequest) {
  const { id, tags, notes } = await req.json()
  const updated = await db.update(contacts)
    .set({ tags, notes })
    .where(eq(contacts.id, id))
    .returning()
  return NextResponse.json(updated[0])
}
