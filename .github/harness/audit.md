# Phase B: store audit

Create `src/audit/storeAudit.ts`, using `getStores()` and `getTickets()` from
`src/data/index.ts`. Export:

```ts
interface StoreAudit {
  storeId: string
  weightedScore: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysSinceLastTicket: number | null
  dormant: boolean
  status: 'thriving' | 'attention' | 'critical' | 'inactive'
}
function auditStores(asOf: string): StoreAudit[]
```

- Require exact `YYYY-MM-DD` shape or throw `Error("Invalid date: <asOf>")`.
  Shape validation is the specified requirement; comparisons are ISO date strings.
- Return one result per store, sorted by `storeId` ascending. Never sort loader
  arrays in place.
- Count tickets for that store with `date <= asOf`. Sort copies most recent first:
  date descending, then id descending.
- Use at most four recent tickets with weights 4, 3, 2, 1. Weighted score is
  half-up `round2(sum(weight * csat) / sum(weights))`; null with none.
- Trend is null with fewer than two. Otherwise latest `csat` is compared with the
  half-up rounded arithmetic mean of the next one to three tickets: greater is
  `up`, lower is `down`, equal is `flat`.
- `daysSinceLastTicket` is whole calendar days from latest ticket date to `asOf`,
  using UTC date-only arithmetic; null with none. `dormant` is true for null or
  strictly greater than 21; exactly 21 is false.
- Status uses the rounded weighted score: no tickets `inactive`; below 3
  `critical`; 3 through below 4 `attention`; 4 or above `thriving`. Dormancy does
  not affect status.
- Use robust two-decimal half-up rounding, not banker's or naive binary rounding.
- Preserve loader data and all inputs.
