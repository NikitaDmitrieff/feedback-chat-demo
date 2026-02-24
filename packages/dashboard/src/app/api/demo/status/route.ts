import { createStatusHandler } from '@nikitadmitrieff/feedback-chat/server'

const handler = createStatusHandler({
  password: process.env.DEMO_FEEDBACK_PASSWORD ?? 'demo',
})

export const { GET, POST } = handler
