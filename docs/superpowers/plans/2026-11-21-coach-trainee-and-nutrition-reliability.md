# Coach↔Trainee Experience + Nutrition Reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every coach↔trainee action correct on both sides (especially coach goals applying to trainee daily targets), and make food calorie lookup trustworthy for common Hebrew/English queries.

**Architecture:** Two parallel tracks after merging open nutrition PR #5. Track A extends existing coaching APIs/UI so proposed goals surface to the trainee, accept/reject works end-to-end, and accepted goals write into the trainee’s daily targets (with server + client validation). Track B hardens the local → Open Food Facts → AI nutrition pipeline with safer matching and soft-drink / absurd-macro guards. Cross-cutting rule: any feature that changes shared state must ship with API tests + both UIs + a regression that proves the other side sees the change.

**Tech Stack:** FastAPI + SQLAlchemy coaching models, React/Vite coach + daily tracker hooks, existing `/sync` blobs, `nutrition_lookup.py` + `ai_fallback.py` + `hebrew_ingredients.json`.

**Spec:** Approved product decisions (2026-11-21 chat):
1. Accepted coach goals **update** daily calorie/macro/steps targets (not display-only).
2. Keep current invitation flow (in-app email match); no invite link/code this round.
3. Sync: coach opening a trainee should see the same nutrition/tracking the trainee has (via sync). Show server `updated_at` + stale hint. No “request sync” button — coach is assumed to be reviewing trainees’ data.
4. Run coach-trainee and nutrition reliability as **two parallel tracks** in one plan.
5. Prerequisite: merge PR #5 (cola / protein) before nutrition track work on main.

## Global Constraints

- Do not invent invite email/WhatsApp links in this round.
- Do not add websockets; keep poll/visibility patterns already used.
- Bilateral rule: for every coach action that affects a trainee (and vice versa), implement API + coach UI + trainee UI + tests that assert both sides.
- Preserve existing coaching lifecycle (end/revoke/notices/invite cleanup).
- Hebrew UI copy; RTL-safe.
- Prefer extending existing files over new frameworks.
- No secrets in commits; no destructive DB resets.

## Review Focus

1. Accepted goal must change the trainee’s live daily target, not only a goals list.
2. Rejected / superseded goals must never apply.
3. Coach seeing stale empty “today” must not be confused with “no history” (freshness + history UX already partially shipped — keep consistent).
4. Nutrition: substring false-positives (cola→chocolat, חלב→חלבון) and AI soft-drink hallucinations.
5. Sync blob size / silent push failure should not strand coach views without feedback where we touch sync.

---

## Prerequisite (before Track B on main)

### Task 0: Merge PR #5 (cola nutrition fix)

**Files:** existing PR branch `cursor/fix-cola-ai-protein-be37`

- [ ] Confirm CI green on PR #5
- [ ] Merge to `main`
- [ ] Rebase / branch Track B from updated `main`
- [ ] Production release tag only after user asks (not automatic)

---

# Track A — Coach ↔ Trainee (parallel)

## File map (Track A)

| File | Responsibility |
|------|----------------|
| `backend/app/api/routes/coach.py` | Goal accept applies target; optional helper to resolve active accepted goals |
| `backend/app/models/coach.py` | Schemas only if response needs applied-target fields |
| `backend/tests/test_coaching.py` / `test_coaching_lifecycle.py` | Accept applies; reject does not; revoke supersedes |
| `frontend/src/services/coachApi.ts` | Already has goal APIs — wire usage |
| `frontend/src/hooks/useCoach.ts` | Load/ack trainee goals; refresh after accept |
| `frontend/src/components/coach/TraineeInvitationsPanel.tsx` or new `TraineeGoalsPanel.tsx` | Trainee sees proposed goals + accept/reject |
| `frontend/src/hooks/useDailyTracker.ts` (or plan/settings write path) | Apply accepted calorie/macro/steps goals into daily targets |
| `frontend/src/components/coach/TraineeDashboard.tsx` | Show server `updated_at` freshness (not only local poll time) |
| `frontend/src/hooks/useCoach.test.tsx` + new FE goal tests | Bilateral UI regressions |

## Task A1: Trainee UI for proposed goals (accept / reject)

**Why:** APIs exist; trainee never sees proposals today.

- [ ] Add failing FE test: proposed goal appears for trainee; accept/reject calls API
- [ ] Build `TraineeGoalsPanel` (or section inside coach tab trainee side) listing `GET /trainee/goals` with status `proposed`
- [ ] Wire accept → `POST /trainee/goals/{id}/accept`, reject → reject
- [ ] After action, refresh list; show empty state when none
- [ ] Commit

## Task A2: Accepted goal updates daily targets

**Why:** Product choice (1-ב) — accept must change live targets.

- [ ] Add backend test: after accept, response or follow-up read shows goal `accepted`; document the exact client field mapping (calories→`targetCalories`, protein/carbs/fat→macro targets if present, steps→`stepsGoal`)
- [ ] On trainee accept (FE): write into daily tracker / personal plan fields that the home day UI already reads (match existing `useDailyTracker` / settings keys — do not invent a second target store)
- [ ] If multiple accepted goals of same type: newest accepted wins; superseded on relationship end already exists — keep that
- [ ] Push sync after applying so coach sees new targets on next trainee sync read
- [ ] Tests: accept calories goal → tracker target changes; reject → unchanged
- [ ] Commit

## Task A3: Coach dashboard freshness

**Why:** Clarify Q3 — coach needs to know if data is old.

- [ ] In `TraineeDashboard`, display `traineeSync.updated_at` as «נתוני מתאמן עודכנו לאחרונה: …»
- [ ] If `updated_at` missing or older than e.g. 24h, show soft stale hint (Hebrew)
- [ ] Keep existing manual refresh + 2‑min poll
- [ ] Test or light assertion that `updated_at` is rendered when present
- [ ] Commit

## Task A4: Bilateral validation checklist (goals + remove already done)

- [ ] Table in PR description proving for goals: coach propose → trainee sees → accept → targets update → coach refresh sees new target via sync
- [ ] Add API test for goal reject (currently thin)
- [ ] Ensure ending relationship still supersedes proposed goals (existing) and does not leave applied targets in a weird state (document: applied local targets stay unless we explicitly revert — **default: leave local targets as last accepted values**; do not auto-wipe trainee targets on remove)
- [ ] Commit

---

# Track B — Nutrition / calorie reliability (parallel)

## File map (Track B)

| File | Responsibility |
|------|----------------|
| `backend/app/services/nutrition_lookup.py` | Whole-word match, ranking, local catalog |
| `backend/app/data/hebrew_ingredients.json` | Trusted local entries (cola + more common drinks/foods as needed) |
| `backend/app/services/ai_fallback.py` | Soft-drink / absurd macro rejection + prompt tightening |
| `backend/app/api/routes/ingredients.py` | Lookup orchestration |
| `backend/tests/test_nutrition_lookup.py` / `test_ai_fallback.py` | Regressions |
| FE barcode/manual add only if needed for surfacing confidence |

## Task B1: Land / verify PR #5 behavior on main

- [ ] After merge, run nutrition + AI tests on main
- [ ] Confirm cola / קולה → ~0 protein, ~42 kcal/100g; no chocolat match
- [ ] Commit only if follow-up fixes needed

## Task B2: Generalize safe matching

- [ ] Extend whole-word / boundary matching to local + OFF title match (if not already complete from #5)
- [ ] Add regression cases: `חלב` ≠ `חלבון`, short tokens don’t substring-hit longer names
- [ ] Commit

## Task B3: Absurd-macro / soft-drink AI guards

- [ ] Keep/extend soft-drink rejection (high protein/fat/kcal for sodas)
- [ ] Add a small set of Hebrew staple drinks/foods to local catalog where AI historically hallucinates
- [ ] When confidence low / rejected AI: return clear “unknown / enter manually” rather than zeros presented as truth (match existing API contract; improve FE message if zeros currently look like real data)
- [ ] Tests for reject + fallback behavior
- [ ] Commit

## Task B4: Confidence surfacing (minimal FE)

- [ ] Where ingredient lookup fills manual-add fields, if source is AI/low confidence show short Hebrew warning before apply
- [ ] Test or manual checklist in PR
- [ ] Commit

---

## Parallel execution order

1. Task 0 (merge #5) — blocking for B, not for A  
2. Start A1–A2 and B2–B3 in parallel after #5 is in (or A immediately)  
3. A3 + A4 and B4  
4. Single or stacked PRs: prefer **two PRs** (`coach-goals-and-freshness`, `nutrition-reliability`) for cleaner review; same plan  
5. Production release only when user asks

## Out of scope (this round)

- Invite magic links / email sending  
- Coach “בקש סנכרון” push button  
- Websockets / realtime channel  
- Raising `MAX_BLOB_BYTES` (note as follow-up if history truncates)  
- Auto-reverting trainee targets when coach removes them  

## Done when

- Trainee can see, accept, reject coach goals; accept changes daily targets; both sides covered by tests  
- Coach sees last data update time for trainee  
- Cola/#5 merged; nutrition matching + AI guards covered by tests; low-confidence results don’t silently look authoritative  
- User approved this plan before implementation started  
