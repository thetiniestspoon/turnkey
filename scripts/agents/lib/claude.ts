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
//
// EXPLICIT_SIGNATURES alone are unambiguous enough to trigger a positive on
// their own — real Claude-CLI rate-limit output always includes one of these
// phrases. AMBIGUOUS_SIGNATURES (a bare 429, "resets at") can appear inside
// ordinary LLM JSON output (e.g. a numeric field or a market-notes string), so
// they only count when an EXPLICIT_SIGNATURES phrase also appears in the text
// — otherwise a false positive silently skips a whole night's run.
const EXPLICIT_SIGNATURES = [
  /usage limit/i,
  /rate limit/i,
  /\b\d+-hour limit/i,
  /too many requests/i,
  /quota/i,
]

// Note: AMBIGUOUS_SIGNATURES only ever contribute a positive when an
// EXPLICIT_SIGNATURES phrase is also present — and in that case the explicit
// phrase alone already makes isRateLimited true. So in practice a bare 429 or
// "resets at" with no limit/quota language never flips the result, which is
// exactly the fix: those ambiguous tokens can no longer cause a false
// positive on ordinary LLM JSON output.
const AMBIGUOUS_SIGNATURES = [/\b429\b/, /resets? at/i]

export function isRateLimited(text: string): boolean {
  const s = String(text ?? '')
  const hasExplicit = EXPLICIT_SIGNATURES.some((re) => re.test(s))
  const hasAmbiguous = AMBIGUOUS_SIGNATURES.some((re) => re.test(s))
  return hasExplicit || (hasAmbiguous && hasExplicit)
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
