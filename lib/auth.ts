import { cookies } from 'next/headers'

export function isAuthenticated(): boolean {
  const session = cookies().get('session')?.value
  return session === process.env.PASSWORD
}
