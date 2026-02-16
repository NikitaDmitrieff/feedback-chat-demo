import type { SupabaseClient } from '@supabase/supabase-js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = SupabaseClient<any, any, any>

export class DbLogger {
  constructor(
    private supabase: AnySupabaseClient,
    private runId: string,
  ) {}

  async log(message: string, level = 'info') {
    console.log(`[${level}] ${message}`)
    await this.supabase.from('run_logs').insert({
      run_id: this.runId,
      level,
      message,
    })
  }

  async error(message: string) {
    return this.log(message, 'error')
  }

  async warn(message: string) {
    return this.log(message, 'warn')
  }
}
