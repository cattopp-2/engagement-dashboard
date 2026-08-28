import { pgTable, serial, text, integer, date, timestamp } from 'drizzle-orm/pg-core'

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  source: text('source'),           // 'friend' | 'follower' | 'both' | 'linkedin'
  tags: text('tags').array(),
  notes: text('notes'),
  fbUrl: text('fb_url'),
  engCount: integer('eng_count').default(0),
  lastEngaged: date('last_engaged'),
  queuePos: integer('queue_pos'),
  createdAt: timestamp('created_at').defaultNow(),
})

export type Contact = typeof contacts.$inferSelect
