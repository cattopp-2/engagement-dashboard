import { sql } from '@vercel/postgres'
import { drizzle } from 'drizzle-orm/vercel-postgres'
import { contacts } from '../lib/schema'
import * as fs from 'fs'
import * as path from 'path'

const db = drizzle(sql)

interface Person { id: number; name: string; source: string }

async function seed() {
  const dataPath = path.join(__dirname, '../../Facebook friends and followers/connections')

  const friendsRaw = JSON.parse(fs.readFileSync(path.join(dataPath, 'friends/your_friends.json'), 'utf-8'))
  const followersRaw = JSON.parse(fs.readFileSync(path.join(dataPath, 'followers/people_who_followed_you.json'), 'utf-8'))

  const friends: string[] = friendsRaw.friends_v2.map((p: { name: string }) => p.name)
  const followers: string[] = followersRaw.followers_v3.map((p: { name: string }) => p.name)

  const seen = new Map<string, string>()
  friends.forEach(name => seen.set(name, 'friend'))
  followers.forEach(name => {
    if (seen.has(name)) seen.set(name, 'both')
    else seen.set(name, 'follower')
  })

  const rows = Array.from(seen.entries()).map(([name, source], i) => ({
    name,
    source,
    tags: [] as string[],
    notes: null,
    engCount: 0,
    lastEngaged: null,
    queuePos: i,
  }))

  console.log(`Seeding ${rows.length} contacts…`)

  // Insert in batches of 500
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    await db.insert(contacts).values(batch).onConflictDoNothing()
    console.log(`  ${Math.min(i + BATCH, rows.length)} / ${rows.length}`)
  }

  console.log('Done.')
  process.exit(0)
}

seed().catch(e => { console.error(e); process.exit(1) })
