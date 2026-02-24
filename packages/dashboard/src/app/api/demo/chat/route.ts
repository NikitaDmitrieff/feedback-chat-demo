import { createFeedbackHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createFeedbackHandler({
  password: process.env.DEMO_FEEDBACK_PASSWORD ?? 'demo',
  projectContext:
    'This is a demo of feedback-chat, an AI-powered feedback widget for Next.js apps. The widget lets users submit feedback, which gets turned into GitHub issues and optionally implemented automatically by an AI agent. Help visitors understand what feedback-chat does, how to install it, and what problems it solves.',
})

export const POST = handler.POST
