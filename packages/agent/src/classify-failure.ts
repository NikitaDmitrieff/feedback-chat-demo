import Anthropic from '@anthropic-ai/sdk'

export type FailureCategory = 'docs_gap' | 'widget_bug' | 'agent_bug' | 'consumer_error' | 'transient'

export type FailureClassification = {
  category: FailureCategory
  analysis: string
  fix_summary: string
}

type LogEntry = { level: string; message: string }

interface ClassifyInput {
  logs: LogEntry[]
  lastError: string
  issueBody: string
  jobType: string
}

const VALID_CATEGORIES: FailureCategory[] = ['docs_gap', 'widget_bug', 'agent_bug', 'consumer_error', 'transient']

function getAnthropicClient(): Anthropic {
  // API key is required for classification — OAuth tokens don't support direct API calls
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  }

  // Fallback: let the SDK try default env vars
  console.warn('[classify] No ANTHROPIC_API_KEY set — classification requires an API key (OAuth tokens are not supported for direct API calls)')
  return new Anthropic()
}

export async function classifyFailure(input: ClassifyInput): Promise<FailureClassification | null> {
  const { logs, lastError, issueBody, jobType } = input

  if (logs.length === 0 && !lastError) return null

  const logText = logs
    .map((l) => `[${l.level}] ${l.message}`)
    .join('\n')

  let response
  try {
    const client = getAnthropicClient()

    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: `You are analyzing a failed agent run. The agent tried to implement a feature on a consumer's Next.js repo using the @nikitadmitrieff/feedback-chat widget.

Classify this failure into ONE of these categories:
- **docs_gap**: The failure happened because CLAUDE.md, installation instructions, or gotchas in the feedback-chat repo are incomplete or wrong. The agent didn't know how to handle a situation that should have been documented.
- **widget_bug**: The failure happened because the widget's source code (packages/widget/) has a bug — wrong exports, broken CSS, incompatible patterns, etc.
- **agent_bug**: The failure happened because the agent's own workflow logic (packages/agent/) is broken — cloning issues, validation logic, prompt construction, etc.
- **consumer_error**: The failure is the consumer's fault — bad config, missing env vars, incompatible dependencies, unusual project structure that we shouldn't need to support.
- **transient**: Network timeout, rate limit, flaky CI, GitHub API outage, or other temporary issue.

Job type: ${jobType}

Original issue body:
${issueBody.slice(0, 1000)}

Last error:
${lastError.slice(0, 1000)}

Run logs (last entries):
${logText.slice(-3000)}

Respond with ONLY a JSON object (no markdown, no code fences):
{"category": "one_of_the_five", "analysis": "One paragraph explaining what went wrong and why this category.", "fix_summary": "One sentence: what should be changed in the feedback-chat repo to prevent this. Use 'N/A' for consumer_error and transient."}`,
        },
      ],
    })
  } catch (err) {
    console.error('[classify] Haiku API call failed:', err instanceof Error ? err.message : err)
    return null
  }

  try {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    // Strip markdown code fences if Haiku wraps the JSON
    const cleaned = text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
    const parsed = JSON.parse(cleaned)

    if (!VALID_CATEGORIES.includes(parsed.category)) {
      console.error('[classify] Invalid category:', parsed.category)
      return null
    }

    return {
      category: parsed.category,
      analysis: String(parsed.analysis || ''),
      fix_summary: String(parsed.fix_summary || ''),
    }
  } catch {
    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    console.error('[classify] Failed to parse Haiku response:', text.slice(0, 300))
    return null
  }
}
