import crypto from 'node:crypto'

/** Generate a new API key. Returns { raw, hash, prefix }. */
export function generateApiKey() {
  const raw = `fc_live_${crypto.randomBytes(24).toString('base64url')}`
  const hash = crypto.createHash('sha256').update(raw).digest('hex')
  const prefix = raw.slice(0, 16)
  return { raw, hash, prefix }
}

/** Hash an API key for lookup. */
export function hashApiKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex')
}
