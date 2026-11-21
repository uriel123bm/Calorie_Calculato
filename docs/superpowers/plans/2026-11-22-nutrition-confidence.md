# Nutrition confidence — don’t count an unsure number

Approved 2026-11-22: exact local matches and strong Open Food Facts matches apply immediately. AI estimates and weak matches show the number and the matched name, and enter the meal total only after «אישור». Zeros from a failed lookup are not a ready value.

## Rules

- Local exact name or alias: `needs_confirmation = false`.
- Local partial match: suggest, `needs_confirmation = true`.
- Open Food Facts score ≥ 0.75: apply. Score 0.40–0.75: suggest and confirm. Score < 0.40: no suggestion.
- Skip an OFF product whose calories disagree with 4·protein + 4·carbs + 9·fat (gap over 40 kcal and ratio outside 0.55–1.8).
- AI with the same disagreement, or the existing soft-drink hallucination, returns confidence 0 / source `unknown`.
- A plausible AI estimate always needs confirmation.
- Personal library stays authoritative and does not ask again.

## Bench

Hebrew queries with a calorie band, a protein ceiling, and whether confirmation is required: קולה, חלב, מים, שמן זית, במבה, תה, אורז, אורז לבן מבושל, קוטג.
