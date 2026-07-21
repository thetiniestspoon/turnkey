# Turnkey — decision simulation & backtest harness (WS3 Phase 3)

Turnkey's analyst emits a confidence and three numeric forecasts. Nothing checked
whether any of it was right. This harness closes that loop, offline.

**It runs with no network, no credentials, no database and no LLM.** That is not a
limitation to work around — it is the design. See
`docs/superpowers/specs/2026-07-21-turnkey-simulation-design.md`.

## Run it

```
npm run sim:backtest
```

Replays the checked-in fixture corpus and prints the calibration score plus a plain
account of where the model was wrong. `npm test` runs the same thing as a golden test.

```
npm run sim:backtest -- --corpus=DIR --seed=N --json=out.json
npm run sim:corpus                 # regenerate the fixture corpus from its seed
npm run sim:typecheck
npx tsx scripts/agents/run-nightly.ts --stage=simulate     # via the WS3 harness
```

## The loop

| Step | Where |
|---|---|
| **Observe** — a corpus: properties + recorded analyst output + a policy | `lib/corpus.ts` |
| **Decide** — pure `decide(observation, policy, calibration) → Decision` | `lib/decide.ts` |
| **Record** — a ledger row per property, under a hashed run id | `lib/ledger.ts` |
| **Resolve** — realized returns from the corpus's outcomes | `lib/outcome.ts` |
| **Score** — Brier, skill, reliability, signed bias, confusion | `lib/score.ts` |
| **Feed back** — fit the per-bucket reliability gap; next run applies it | `lib/calibrate.ts` |

A **buying decision** is BUY or PASS on one property, under one policy, at the observed
list price. Five gates in order: `criteria` → `strategy` → `hurdle` → `confidence` →
BUY. Gate 1 reuses `passesFilter` from `scripts/agents/lib/orchestrate.ts` verbatim, so
the simulator rejects exactly what production rejects.

**The feedback signal is the per-bucket reliability gap** — the empirical clear-rate of
decisions in a confidence band minus the mean forecast in that band.

## Reading the score

The headline is a **Brier score** on a held-out half of the corpus. 0 is perfect, 0.25
is someone who always says "50/50", 1 is confidently wrong every time. The calibration
map is fitted on the *other* half, so the improvement number is out-of-sample.

**A bad score is a real result. A score that cannot be reproduced is not.** Every run is
identified by `sha256(corpus, seed, policy, engine version)`. Same inputs, same run id,
same numbers — `tests/sim/golden.test.ts` pins it.

## The fixture corpus is synthetic

`tests/fixtures/sim/synthetic-trenton-2026q2/` is **generated, not observed**, and every
report says so. It contains two deliberately planted biases (renovation cost
under-forecast; confidence inflated at the top of the range).

**A calibration number measured on a corpus whose bias was planted says nothing about
the real Turnkey analyst.** It says the harness detects bias that is present. Replacing
this corpus with recorded production data is what would make the number mean something
about the model.

## Guardrails

`tests/sim/boundaries.test.ts` fails the build if anything under `scripts/sim/` reads
the wall clock, calls `Math.random`, spawns a subprocess, or opens a socket. Those are
the four ways this harness could quietly stop being reproducible or stop being free.

## The live seam

One seam, in `lib/source.ts`, gated on a boolean presence check of
`TURNKEY_SIM_LIVE_SOURCE`. It reads no key and logs no value. When set, it calls a
function that throws and names the one remaining operator step. Opening it is a reviewed
code change, not a config flip.

## To go live

One step, unchanged since 2026-07-17: a `SUPABASE_SERVICE_ROLE_KEY` line in
`turnkey/.env`, added by hand, in an editor, from the Supabase dashboard. Never pasted
into a chat, a command, or a console. Then apply migration `00007` (which is
documentation only until that point), then review a fixture run, and only then consider
the live seam.
