import { insertAgentRun, updateAgentRun, type Db } from './db'

export const SUBSCRIPTION_MODEL = 'claude-code-subscription'

export function buildFinishPatch(args: {
  status: 'success' | 'error' | 'timeout'
  output_summary?: string
  input_summary?: string
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: args.status,
    cost_est: 0,
    tokens_used: 0,
    model: SUBSCRIPTION_MODEL,
    completed_at: new Date().toISOString(),
  }
  if (args.output_summary !== undefined) patch.output_summary = args.output_summary
  if (args.input_summary !== undefined) patch.input_summary = args.input_summary
  return patch
}

export function startRun(
  db: Db,
  agent_type: string,
  trigger: 'cron' | 'manual' | 'auto',
  input_summary?: string,
): Promise<string> {
  return insertAgentRun(db, { agent_type, trigger, input_summary })
}

export function finishRun(
  db: Db,
  id: string,
  args: Parameters<typeof buildFinishPatch>[0],
): Promise<void> {
  return updateAgentRun(db, id, buildFinishPatch(args))
}
