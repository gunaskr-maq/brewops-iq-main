# Phase A: pricing engine

Create `src/pricing/engine.ts`. Export these interfaces and
`priceTicket(input: PriceTicketInput): PricedTicket`:

```ts
interface CartLine { productId: string; qty: number }
interface PriceTicketInput { lines: CartLine[]; memberId: string | null; date: string }
interface PricedLine {
  productId: string; qty: number; unitPrice: number; gross: number
  appliedOfferId: string | null; discount: number; net: number
}
interface PricedTicket {
  lines: PricedLine[]
  orderLevel: { appliedOfferId: string | null; discount: number }
  subtotal: number; total: number
}
```

Use only loaders from `src/data/index.ts`. Preserve input order and immutability.

## Validation

- Unknown product: `Error("Unknown product: <id>")`.
- Unknown non-null member: `Error("Unknown member: <id>")`.
- Non-integer or `qty <= 0`: `Error("Invalid qty for <productId>")`.
- Empty lines is valid with empty priced lines and all totals/discounts zero.

## Active and eligible offers

- Active when `validFrom <= date <= validTo`, both inclusive.
- If `dayOfWeek` exists, parse date components and use UTC weekday via
  `new Date(Date.UTC(y, m - 1, d)).getUTCDay()`; require its three-letter value.
- If `eligibleTiers` exists, require a known member with a listed tier. Otherwise
  every tier and walk-ins are eligible.
- Tier never grants an automatic discount.

## Line offers

Round gross first. For each line, choose at most one positive-discount offer:

- `percent_off`: match `scope.category` or `scope.productIds`; discount is
  `round2(gross * percent / 100)`.
- `bundle`: `[buyId, getId]`; only the buy line is discounted. Compute cart-wide
  quantities for both IDs, pairs = `min(buyQty, getQty)`, discount =
  `round2(pairs * amountOff)`. Repeated lines with the buy ID each evaluate from
  the specified cart-wide quantities. A zero discount is not applicable.
- Clamp each candidate discount to the line gross before comparing.
- Greatest clamped discount wins. Ties: earlier `validFrom`, then lexicographically
  smaller offer `id`.
- The same offer may win on multiple lines. Never cumulatively stack line offers.

For every line: `gross = round2(basePrice * qty)`, chosen `discount` rounded and
clamped, `net = round2(max(0, gross - discount))`.

## Order offers

After line pricing, set `subtotal = round2(sum(line.net))`. For each active,
eligible `spend_threshold`, qualification amount is either subtotal or, when
`category` exists, the sum of post-discount line nets in that category. The
threshold is inclusive. Choose at most one qualifier by greatest `amountOff`;
ties use earlier `validFrom`, then smaller `id`. Clamp and round its discount so
the order discount is the winning offer's full fixed `amountOff`, even when it
exceeds subtotal. Return `total = round2(max(0, subtotal - orderDiscount))`.
Only total is floored; do not clamp the reported order discount. Line and order
offers stack.

## Money

Every output money field is two-decimal numeric half-up, including gross, line
discount/net, subtotal, order discount, and total. Handle decimal float artifacts
so `1.005 -> 1.01` and `2.175 -> 2.18`; do not use banker's rounding or naive
`Math.round(value * 100) / 100`. A decimal-string/EPSILON-aware half-up helper is
acceptable. Normalize zero rather than returning `-0`.
