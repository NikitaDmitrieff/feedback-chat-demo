# feedback.chat — 3-Minute Demo Script

A step-by-step walkthrough for demoing feedback.chat live.

## Before You Start (setup checklist)
- [ ] Dashboard running at https://loop.joincoby.com (or localhost:3000)
- [ ] Demo project seeded: `cd packages/dashboard && npx tsx ../../scripts/seed-demo.ts`
- [ ] Widget visible on a consumer app (or use the landing page live demo)
- [ ] Browser tabs pre-opened: landing page, dashboard, project overview, feedback hub

## Act 1: The Problem (30 seconds)
**Say:** "Every product team has a feedback problem. Users talk in your chat support, in GitHub issues, in Slack. Most of it gets lost. We built feedback.chat to change that."

**Show:** The landing page hero section.

## Act 2: The Widget (60 seconds)
**Say:** "The widget is a single npm install. Users can chat with an AI advisor in your app. No signup needed."

**Show:**
1. The 'Try it now' live demo section on the landing page
2. Click a suggestion chip (e.g. 'The checkout flow is confusing')
3. Show the AI response + the 'Submit as feature request' option
4. Click it — show the 'Feature request captured' success screen

**Say:** "That just created a GitHub issue with the feature request, properly formatted."

## Act 3: The Dashboard (60 seconds)
**Say:** "Now flip to the dashboard. This is where the magic continues."

**Show:**
1. Navigate to the project overview — StatsBar, DigestCard, ProposalsCard (project: "PostPrep — College App Assistant")
2. Click 'Feedback' in sidebar — show the theme distribution chart
3. Point at themes: "AI has already clustered messages into 5 themes — Performance, UX / Mobile, Feature Requests, AI Quality, Integrations"
4. Click 'Minions' — show proposals tab: "These proposals were AI-generated from the themes"
5. Click on a proposal (e.g. 'Progress bar for AI feedback generation') — show the slide-over with scores, spec, approve button

## Act 4: The Pipeline (30 seconds)
**Say:** "When you approve a proposal, the agent implements it automatically."

**Show:**
1. On the pipeline tab — show a run with 'preview_ready' stage (triggered by Alex W.)
2. Click on the run — show the log viewer with Claude's output
3. Show the deployment preview link

**Say:** "That's it. Feedback to shipped feature in minutes, not weeks."

## Act 5: Tier + Install (optional, if technical audience)
**Say:** "You can start with just the chat tier — no GitHub, no agent. 5-minute setup."

**Show:** The tiers section on the landing page.

## Closing line
"feedback.chat — from feedback to PR, automatically. Any questions?"
