import { app } from 'electron'

export const config = {
  sentryDsn: process.env.SENTRY_DSN || '',
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.5,
  isDev: process.env.NODE_ENV === 'development' || !app.isPackaged,
}
