import { pgTable, serial, text, integer, date, timestamp, boolean } from 'drizzle-orm/pg-core'

export const contacts = pgTable('contacts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  source: text('source'),           // 'friend' | 'follower' | 'both' | 'linkedin'
  tags: text('tags').array(),
  notes: text('notes'),
  fbUrl: text('fb_url'),
  messengerUrl: text('messenger_url'),
  engCount: integer('eng_count').default(0),
  lastEngaged: date('last_engaged'),
  queuePos: integer('queue_pos'),
  excluded: integer('excluded').default(0), // 0 = in queue, 1 = excluded
  createdAt: timestamp('created_at').defaultNow(),
  // Lead tracking fields
  email: text('email'),
  linkedinUrl: text('linkedin_url'),
  threadsUrl: text('threads_url'),
  leadStatus: text('lead_status'),  // 'to-contact' | 'contacted' | 'replied' | 'in-conversation' | 'proposal-sent' | 'follow-up' | 'closed' | 'not-suitable'
  isHotLead: boolean('is_hot_lead').default(false),
  whatToSell: text('what_to_sell'),
  lastContact: date('last_contact'),
  futureContact: date('future_contact'),
})

export type Contact = typeof contacts.$inferSelect
