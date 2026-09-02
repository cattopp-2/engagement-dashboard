import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, sql } from 'drizzle-orm'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''

  const nameFilter = search ? sql`name ILIKE ${'%' + search + '%'} AND ` : sql``
  const whereClause = status
    ? sql`${nameFilter}tags @> ARRAY['warm']::text[] AND lead_status = ${status}`
    : sql`${nameFilter}tags @> ARRAY['warm']::text[]`

  const rows = await db.select().from(contacts)
    .where(whereClause)
    .orderBy(sql`last_contact DESC NULLS LAST, future_contact ASC NULLS LAST, name ASC`)
    .limit(500)

  return NextResponse.json(rows)
}

export async function PATCH(req: NextRequest) {
  const { id, leadStatus, isHotLead, notes, linkedinUrl, threadsUrl, fbUrl, messengerUrl, email, whatToSell, lastContact, futureContact } = await req.json()

  const tags = isHotLead !== undefined
    ? (isHotLead ? ['warm', 'hot'] : ['warm'])
    : undefined

  const updated = await db.update(contacts)
    .set({
      ...(leadStatus !== undefined && { leadStatus }),
      ...(isHotLead !== undefined && { isHotLead, tags }),
      ...(notes !== undefined && { notes }),
      ...(linkedinUrl !== undefined && { linkedinUrl }),
      ...(threadsUrl !== undefined && { threadsUrl }),
      ...(fbUrl !== undefined && { fbUrl }),
      ...(messengerUrl !== undefined && { messengerUrl }),
      ...(email !== undefined && { email }),
      ...(whatToSell !== undefined && { whatToSell }),
      ...(lastContact !== undefined && { lastContact }),
      ...(futureContact !== undefined && { futureContact }),
    })
    .where(eq(contacts.id, id))
    .returning()

  return NextResponse.json(updated[0])
}
