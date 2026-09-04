# Narrow repair pass

All three entry points exist and compile. Make only these confirmed corrections,
then run the required TypeScript check and build. Do not write or run tests.

1. In `src/pricing/engine.ts`, `src/audit/storeAudit.ts`, and
   `src/settlement/settle.ts`, replace the current money helper again. Calling
   `toFixed` and then converting back to `Number` before multiplying recreates
   the original IEEE artifact and can still make `1.005` round to `1.00`.
   Implement decimal exponent shifting: convert the absolute value with
   `Number(`${absValue}e2`)`, apply `Math.round`, then shift back with
   `Number(`${roundedInteger}e-2`)` and restore the sign. This must produce
   exactly `1.005 -> 1.01` and `2.175 -> 2.18`, use half-up rather than banker's
   rounding, and normalize zero.
2. In `src/pricing/engine.ts`, a selected `spend_threshold` offer's reported
   `orderLevel.discount` must be its full fixed `amountOff`, rounded to two
   decimals. Do not clamp that discount to subtotal. Only `total` is floored at
   zero via `round2(max(0, subtotal - orderDiscount))`.
3. While touching offer eligibility, apply presence semantics literally:
   `dayOfWeek` present with an empty array matches no weekday, and
   `eligibleTiers` present with an empty array makes nobody eligible. Do not use
   a non-empty-length guard for either optional field.

Preserve public APIs, input immutability, sorting, and all other behavior.
