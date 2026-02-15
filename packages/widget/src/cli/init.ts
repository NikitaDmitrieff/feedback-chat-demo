import prompts from 'prompts'
import { existsSync, writeFileSync, appendFileSync, readFileSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const CHAT_ROUTE_TEMPLATE = (hasGithub: boolean) => `\
import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.FEEDBACK_PASSWORD!,${hasGithub ? `
  github: {
    token: process.env.GITHUB_TOKEN!,
    repo: process.env.GITHUB_REPO!,
  },` : ''}
})

export const POST = handler.POST
`

const STATUS_ROUTE_TEMPLATE = `\
import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.FEEDBACK_PASSWORD!,
})

export const { GET, POST } = handler
`

const SOURCE_DIRECTIVE = '@source "../node_modules/@nikitadmitrieff/feedback-chat/dist/**/*.js";'

function findAppDir(cwd: string): string | null {
  const candidates = [
    join(cwd, 'src', 'app'),
    join(cwd, 'app'),
  ]
  for (const dir of candidates) {
    if (existsSync(dir)) return dir
  }
  return null
}

function findGlobalsCss(cwd: string): string | null {
  const candidates = [
    join(cwd, 'src', 'app', 'globals.css'),
    join(cwd, 'app', 'globals.css'),
    join(cwd, 'styles', 'globals.css'),
    join(cwd, 'src', 'styles', 'globals.css'),
  ]
  for (const path of candidates) {
    if (existsSync(path)) return path
  }
  return null
}

function injectSourceDirective(cssPath: string): boolean {
  const content = readFileSync(cssPath, 'utf-8')
  if (content.includes(SOURCE_DIRECTIVE)) return false

  // Insert after @import "tailwindcss" line
  const lines = content.split('\n')
  let insertIndex = -1
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('@import') && lines[i].includes('tailwindcss')) {
      insertIndex = i + 1
      break
    }
  }

  if (insertIndex === -1) {
    // No tailwindcss import found — prepend
    writeFileSync(cssPath, SOURCE_DIRECTIVE + '\n' + content)
  } else {
    lines.splice(insertIndex, 0, SOURCE_DIRECTIVE)
    writeFileSync(cssPath, lines.join('\n'))
  }
  return true
}

function safeWriteFile(filePath: string, content: string, overwrite: boolean): boolean {
  if (existsSync(filePath) && !overwrite) {
    console.log(`  Skipped ${filePath} (already exists)`)
    return false
  }
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(filePath, content)
  return true
}

function appendEnvVar(envPath: string, key: string, value: string): void {
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf-8')
    if (existing.includes(`${key}=`)) return
  }
  appendFileSync(envPath, `${key}=${value}\n`)
}

async function main() {
  const cwd = resolve(process.cwd())

  console.log()
  console.log('  feedback-chat setup wizard')
  console.log('  ─────────────────────────────')
  console.log()

  // Detect Next.js app directory
  const appDir = findAppDir(cwd)
  if (!appDir) {
    console.error('  Could not find app/ or src/app/ directory.')
    console.error('  Make sure you run this from a Next.js project root.')
    process.exit(1)
  }

  console.log(`  Found Next.js app directory: ${appDir}`)
  console.log()

  // ── Widget Setup ──────────────────────────
  console.log('  ── Widget Setup ──────────────────────────')
  console.log()

  const widgetAnswers = await prompts([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Anthropic API key (for chat, uses Haiku)',
    },
    {
      type: 'password',
      name: 'password',
      message: 'Feedback password (gates access to the chatbot)',
    },
  ])

  if (!widgetAnswers.apiKey || !widgetAnswers.password) {
    console.log('  Cancelled.')
    process.exit(0)
  }

  // ── GitHub Integration ──────────────────────
  console.log()
  console.log('  ── GitHub Integration ──────────────────────')
  console.log()

  const githubAnswer = await prompts({
    type: 'confirm',
    name: 'enabled',
    message: 'Enable GitHub issues? (feedback creates issues for tracking)',
    initial: true,
  })

  let githubToken = ''
  let githubRepo = ''

  if (githubAnswer.enabled) {
    const ghAnswers = await prompts([
      {
        type: 'password',
        name: 'token',
        message: 'GitHub token (needs repo scope)',
      },
      {
        type: 'text',
        name: 'repo',
        message: 'GitHub repo (owner/name)',
      },
    ])
    githubToken = ghAnswers.token || ''
    githubRepo = ghAnswers.repo || ''
  }

  const hasGithub = !!(githubToken && githubRepo)

  // ── Overwrite check ──────────────────────
  let overwrite = false
  const chatRoutePath = join(appDir, 'api', 'feedback', 'chat', 'route.ts')
  const statusRoutePath = join(appDir, 'api', 'feedback', 'status', 'route.ts')

  if (existsSync(chatRoutePath) || existsSync(statusRoutePath)) {
    const overwriteAnswer = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: 'Route files already exist. Overwrite?',
      initial: false,
    })
    overwrite = overwriteAnswer.overwrite ?? false
  }

  // ── Create route files ──────────────────────
  console.log()

  if (safeWriteFile(chatRoutePath, CHAT_ROUTE_TEMPLATE(hasGithub), overwrite)) {
    console.log(`  Created ${chatRoutePath}`)
  }
  if (safeWriteFile(statusRoutePath, STATUS_ROUTE_TEMPLATE, overwrite)) {
    console.log(`  Created ${statusRoutePath}`)
  }

  // ── Patch Tailwind v4 CSS ──────────────────────
  const globalsCss = findGlobalsCss(cwd)
  if (globalsCss) {
    if (injectSourceDirective(globalsCss)) {
      console.log(`  Patched ${globalsCss} (added @source directive for Tailwind v4)`)
    } else {
      console.log(`  ${globalsCss} already has @source directive`)
    }
  } else {
    console.log()
    console.log('  ⚠ Could not find globals.css — add this line manually:')
    console.log(`    ${SOURCE_DIRECTIVE}`)
  }

  // ── Append to .env.local ──────────────────────
  const envPath = join(cwd, '.env.local')

  appendEnvVar(envPath, 'ANTHROPIC_API_KEY', widgetAnswers.apiKey)
  appendEnvVar(envPath, 'FEEDBACK_PASSWORD', widgetAnswers.password)

  if (hasGithub) {
    appendEnvVar(envPath, 'GITHUB_TOKEN', githubToken)
    appendEnvVar(envPath, 'GITHUB_REPO', githubRepo)
  }

  console.log(`  Updated ${envPath}`)

  // ── Done ──────────────────────
  console.log()
  console.log('  ── Add to your layout ──────────────────────')
  console.log()
  console.log("    // Create a client component (e.g., components/FeedbackButton.tsx):")
  console.log("    'use client'")
  console.log("    import { useState } from 'react'")
  console.log("    import { FeedbackPanel } from '@nikitadmitrieff/feedback-chat'")
  console.log("    import '@nikitadmitrieff/feedback-chat/styles.css'")
  console.log()
  console.log('    export function FeedbackButton() {')
  console.log('      const [open, setOpen] = useState(false)')
  console.log('      return <FeedbackPanel isOpen={open} onToggle={() => setOpen(!open)} />')
  console.log('    }')
  console.log()
  console.log('    // Then in your layout.tsx:')
  console.log("    import { FeedbackButton } from '@/components/FeedbackButton'")
  console.log('    // Inside <body>: <FeedbackButton />')
  console.log()
  console.log('  Done.')
  console.log()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
