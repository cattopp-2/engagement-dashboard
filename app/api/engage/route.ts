import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { contacts } from '@/lib/schema'
import { eq, sql, max } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const { id, count } = await req.json()
  const today = new Date().toISOString().split('T')[0]

  // Get current max queue_pos so we can push this person to the end
  const [{ maxPos }] = await db.select({ maxPos: max(contacts.queuePos) }).from(contacts)
  const newPos = (maxPos ?? 0) + 1

  const updates: Record<string, unknown> = { queuePos: newPos }
  if (count) {
    updates.lastEngaged = today
    updates.engCount = sql`${contacts.engCount} + 1`
  }

  const updated = await db.update(contacts)
    .set(updates)
    .where(eq(contacts.id, id))
    .returning()

  return NextResponse.json(updated[0])
}
