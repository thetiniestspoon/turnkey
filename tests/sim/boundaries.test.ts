// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// These are the tests that keep the promise the design makes: the simulation layer is
// offline, credential-free and reproducible. They are cheap, they are blunt, and they
// fail loudly the moment someone reaches for a clock, a coin, or a socket.

const SIM_DIR = path.resolve(__dirname, '../../scripts/sim')

function simSourceFiles(dir = SIM_DIR): string[] {
  const out: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...simSourceFiles(p))
    else if (entry.name.endsWith('.ts')) out.push(p)
  }
  return out
}

// Strip comments before scanning, so the prose explaining WHY a thing is banned does
// not itself trip the ban.
function code(file: string): string {
  return fs.readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

describe('the simulation layer has no clock', () => {
  it.each(simSourceFiles())('%s does not read wall-clock time', (file) => {
    // A backtest that stamps itself with the current time cannot be byte-compared
    // against a previous run, which is how reproducibility silently dies.
    expect(code(file)).not.toMatch(/Date\.now\s*\(|new Date\s*\(/)
  })
})

describe('the simulation layer has no unseeded randomness', () => {
  it.each(simSourceFiles())('%s does not call Math.random', (file) => {
    expect(code(file)).not.toMatch(/Math\.random\s*\(/)
  })
})

describe('the simulation layer opens no sockets and spawns no subprocesses', () => {
  it.each(simSourceFiles())('%s does not spawn a process', (file) => {
    // Replay must cost $0 and must never be rate-limited. No `claude -p`, ever.
    expect(code(file)).not.toMatch(/child_process|spawnSync|execSync/)
  })

  it.each(simSourceFiles())('%s does not make network calls', (file) => {
    expect(code(file)).not.toMatch(/\bfetch\s*\(|node:https?|createClient\s*\(/)
  })
})

describe('the live seam is the only place the live env var is named', () => {
  it('mentions TURNKEY_SIM_LIVE_SOURCE in exactly one library file', () => {
    const hits = simSourceFiles()
      .filter((f) => f.includes(`${path.sep}lib${path.sep}`))
      .filter((f) => code(f).includes('TURNKEY_SIM_LIVE_SOURCE'))
    expect(hits.map((f) => path.basename(f))).toEqual(['source.ts'])
  })
})
