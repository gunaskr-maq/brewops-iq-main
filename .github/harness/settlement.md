# Phase C: region settlement

Create `src/settlement/settle.ts`. Import and call `priceTicket` and import its
`CartLine` type from `../pricing/engine`; use data loaders, never JSON. Export:

```ts
interface SettleRegionInput {
  regionId: string; date: string
  tickets: Array<{ storeId: string; memberId: string | null; lines: CartLine[] }>
}
interface RegionSettlement {
  regionId: string; date: string
  grossTotal: number; lineDiscountTotal: number; orderDiscountTotal: number
  discountTotal: number; netTotal: number
  perCategory: Record<string, number>
  offerUsage: Record<string, number>
  bonus: number
  storesVisited: string[]; storesMissed: string[]
}
function settleRegion(input: SettleRegionInput): RegionSettlement
```

## Validation and pricing

- Find region via `getRegions()`/`getRegion`. If absent throw
  `Error("Unknown region: <regionId>")`.
- Each ticket store must occur in the region's stops; otherwise throw
  `Error("Store not in region: <storeId>")`. Multiple tickets/store and empty
  tickets are valid.
- Price every ticket exactly once with `priceTicket({ lines, memberId, date })`.
  Propagate its errors unchanged. Preserve all inputs and loader data.

## Aggregation

Use robust half-up two-decimal rounding for every returned money total:

- `grossTotal`: sum every priced line gross.
- `lineDiscountTotal`: sum every priced line discount.
- `orderDiscountTotal`: sum each priced ticket order discount.
- `discountTotal`: line discount total plus order discount total.
- `netTotal`: sum each priced ticket total.
- `perCategory`: use menu product categories and sum priced line nets. Do not
  allocate order discounts. Include only categories appearing in ticket lines;
  return keys inserted in ascending order.
- `offerUsage`: add one per priced line with an offer ID and one per ticket with
  an order offer ID. Omit unused offers; return keys inserted ascending.

Bonus is marginal on `netTotal`, rounded only at the end: 3% of first 250, 6% of
the portion over 250 through 750 (maximum 500 in this tier), and 10% of the
portion over 750.

For stores, deduplicate region stop IDs while preserving first region order.
`storesVisited` contains stops with at least one input ticket; `storesMissed`
contains all remaining stops. Ticket order must not determine either output.
