import { spawnSync } from 'node:child_process'

export function extractJson(text: string): unknown | null {
  const s = String(text ?? '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b === -1 || b < a) return null
  try {
    return JSON.parse(s.slice(a, b + 1))
  } catch {
    return null
  }
}

// Best-effort match of Claude Code subscription rate/usage-limit output. Tune the
// list if real output differs; keep it conservative (false negative = a wasted
// retry next night, false positive = an unnecessary quiet-night skip).
const RATE_SIGNATURES = [
  /usage limit/i,
  /rate limit/i,
  /\b\d+-hour limit reached/i,
  /\b429\b/,
  /too many requests/i,
  /resets? at/i,
]

export function isRateLimited(text: string): boolean {
  const s = String(text ?? '')
  return RATE_SIGNATURES.some((re) => re.test(s))
}

export type ClaudeResult = { ok: boolean; text: string; error: string | null; rateLimited: boolean }

export function callClaude(opts: {
  prompt: string
  allowedTools?: string[]
  timeoutMs?: number
}): ClaudeResult {
  const argv = ['-p']
  if (opts.allowedTools && opts.allowedTools.length) {
    argv.push('--allowedTools', opts.allowedTools.join(','))
  }
  let res: ReturnType<typeof spawnSync>
  try {
    // stdin prompt (avoids arg-escaping multi-line JSON); shell:true so Windows
    // resolves the `claude` .cmd shim. Cred-free: no secret in prompt or argv.
    res = spawnSync('claude', argv, {
      input: opts.prompt,
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 180000,
      shell: true,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (e) {
    return { ok: false, text: '', error: String((e as Error).message ?? e), rateLimited: false }
  }
  const stdout = String(res.stdout ?? '')
  const stderr = String(res.stderr ?? '')
  const combined = `${stdout}\n${stderr}`
  const rateLimited = isRateLimited(combined)
  const err = res.error ? String((res.error as Error).message ?? res.error) : null
  const ok = !err && !rateLimited && res.status === 0 && stdout.trim().length > 0
  return { ok, text: stdout, error: err ?? (rateLimited ? 'rate-limited' : res.status !== 0 ? `exit ${res.status}` : null), rateLimited }
}
