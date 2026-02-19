import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createSupabaseClient } from './supabase.js'

const ANTHROPIC_TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token'
const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const REFRESH_BUFFER_MS = 5 * 60 * 1000 // refresh 5 min before expiry
const SYSTEM_CRED_KEY = 'system_claude_oauth'

interface OAuthCredentials {
  claudeAiOauth: {
    accessToken: string
    refreshToken: string
    expiresAt: number
    scopes: string[]
    subscriptionType?: string
    rateLimitTier?: string
  }
}

const credsPath = join(homedir(), '.claude', '.credentials.json')

/**
 * Initialize credentials at startup.
 * Priority: 1) Supabase system row (survives restarts), 2) CLAUDE_CREDENTIALS_JSON env var (initial seed)
 */
export async function initCredentials(): Promise<boolean> {
  mkdirSync(join(homedir(), '.claude'), { recursive: true })

  // Try Supabase first — this has the latest refreshed tokens
  try {
    const supabase = createSupabaseClient()
    const { data } = await supabase
      .from('system_credentials')
      .select('value')
      .eq('key', SYSTEM_CRED_KEY)
      .single()

    if (data?.value) {
      writeFileSync(credsPath, data.value)
      console.log('[oauth] Loaded credentials from Supabase (persistent)')
      return true
    }
  } catch {
    // Table might not exist yet or DB unreachable — fall through to env var
  }

  // Fall back to env var (initial seed or manual update)
  const credsJson = process.env.CLAUDE_CREDENTIALS_JSON
  if (!credsJson) return false

  writeFileSync(credsPath, credsJson)
  console.log('[oauth] Wrote initial credentials from env var')

  // Persist to Supabase so future restarts use the DB
  await persistToSupabase(credsJson)

  return true
}

function readCredentials(): OAuthCredentials | null {
  try {
    return JSON.parse(readFileSync(credsPath, 'utf-8'))
  } catch {
    return null
  }
}

function writeCredentials(creds: OAuthCredentials): void {
  const json = JSON.stringify(creds)
  writeFileSync(credsPath, json)
}

/** Persist credentials to Supabase so they survive container restarts. */
async function persistToSupabase(json: string): Promise<void> {
  try {
    const supabase = createSupabaseClient()
    await supabase
      .from('system_credentials')
      .upsert({ key: SYSTEM_CRED_KEY, value: json }, { onConflict: 'key' })
    console.log('[oauth] Persisted refreshed credentials to Supabase')
  } catch (err) {
    console.warn('[oauth] Failed to persist to Supabase (non-fatal):', err)
  }
}

/**
 * Ensure the OAuth access token is valid before running Claude CLI.
 * If expired (or about to expire), refresh it using the refresh token.
 * Persists refreshed tokens to Supabase for container restart survival.
 * Returns true if credentials are ready, false if unavailable.
 */
export async function ensureValidToken(): Promise<boolean> {
  const creds = readCredentials()
  if (!creds) {
    console.warn('[oauth] No credentials file found')
    return false
  }

  const oauth = creds.claudeAiOauth
  const now = Date.now()

  if (oauth.expiresAt > now + REFRESH_BUFFER_MS) {
    const minutesLeft = Math.round((oauth.expiresAt - now) / 60_000)
    console.log(`[oauth] Token valid (${minutesLeft} min remaining)`)
    return true
  }

  console.log('[oauth] Token expired or expiring soon, refreshing...')

  try {
    const res = await fetch(ANTHROPIC_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: oauth.refreshToken,
      }),
    })

    if (!res.ok) {
      const body = await res.text()
      console.error(`[oauth] Refresh failed (${res.status}): ${body}`)
      return false
    }

    const data = (await res.json()) as {
      access_token: string
      refresh_token: string
      expires_in: number
    }

    creds.claudeAiOauth = {
      ...oauth,
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: now + data.expires_in * 1000,
    }

    const json = JSON.stringify(creds)
    writeCredentials(creds)
    await persistToSupabase(json) // survive container restarts

    console.log(
      `[oauth] Token refreshed, valid for ${Math.round(data.expires_in / 60)} min`
    )
    return true
  } catch (err) {
    console.error('[oauth] Refresh request failed:', err)
    return false
  }
}
