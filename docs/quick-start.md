# Quick Start

## Choose Your Tier

Pick your tier first, then follow the matching setup path.

| Tier | What you get | Cost | What you need |
|------|-------------|------|---------------|
| **Chat only** | AI conversations, localStorage persistence | ~$0.01/conversation | API key + password |
| **+ GitHub** | Chat + auto-creates GitHub issues from feedback | same | + GitHub token/repo |
| **+ Pipeline** | Chat + GitHub + agent writes code → PR → preview → approve in widget | + ~$5/mo Railway | + Claude Max + Railway |

**If you have Claude Max ($200/mo), you get unlimited feedback-to-code automation for the cost of a ~$5/mo Railway instance.**

## Pre-Flight Check

`@ai-sdk/react` explicitly excludes `react@19.1.0` and `19.1.1`. This is a **build breaker**. Check your version:

```bash
npm ls react
```

If you're on 19.1.0 or 19.1.1, upgrade first:

```bash
npm install react@latest react-dom@latest
```

## Installation

### Option A: Let Claude install it (recommended)

If you use Claude Code, just say:

> Install @nikitadmitrieff/feedback-chat in my app — I want the [Chat / +GitHub / +Pipeline] tier

Claude reads the CLAUDE.md in this repo and follows the tier-specific setup steps.

### Option B: CLI wizard

```bash
npx feedback-chat init
```

Creates API routes, configures `.env.local`, and patches your CSS for Tailwind v4.

### Option C: Manual setup

Follow the tier-specific guide:

- [Chat only setup](./chat-only-setup.md)
- [GitHub integration](./github-integration.md)
- [Pipeline setup](./pipeline-setup.md)

## Peer dependencies

```json
{
  "react": "^18 || ^19 (19.1.2+ if on React 19)",
  "react-dom": "^18 || ^19",
  "next": ">=14",
  "@assistant-ui/react": ">=0.12",
  "@assistant-ui/react-ai-sdk": ">=1.3",
  "@assistant-ui/react-markdown": ">=0.12",
  "ai": ">=6",
  "@ai-sdk/anthropic": ">=1"
}
```

## Verification

After setup, verify it works:

1. Run `npm run dev`
2. Open the app — you should see a feedback trigger bar at the bottom-center
3. Click it, enter your feedback password, send a message
4. **(+ GitHub)** Submit feedback and check the repo's Issues tab for a new issue
5. **(+ Pipeline)** The PipelineTracker should show stage progression through to `preview_ready`
