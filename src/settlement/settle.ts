import { getRegion, getMenu } from '../data/index'
import { priceTicket, type CartLine } from '../pricing/engine'

export interface SettleRegionInput {
  regionId: string
  date: string
  tickets: Array<{
    storeId: string
    memberId: string | null
    lines: CartLine[]
  }>
}

export interface RegionSettlement {
  regionId: string
  date: string
  grossTotal: number
  lineDiscountTotal: number
  orderDiscountTotal: number
  discountTotal: number
  netTotal: number
  perCategory: Record<string, number>
  offerUsage: Record<string, number>
  bonus: number
  storesVisited: string[]
  storesMissed: string[]
}

// Half-up rounding to 2 decimal places
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

export function settleRegion(input: SettleRegionInput): RegionSettlement {
  const { regionId, date, tickets } = input

  // Find and validate region
  const region = getRegion(regionId)
  if (!region) {
    throw new Error(`Unknown region: ${regionId}`)
  }

  // Get all store IDs in the region
  const regionStoreIds = region.stores.map((s) => s.storeId)

  // Track visited stores (preserve order and deduplicate)
  const visitedStoresSet = new Set<string>()
  const storesVisitedOrdered: string[] = []

  // Price all tickets and collect data
  const pricedTickets = []
  let grossTotal = 0
  let lineDiscountTotal = 0
  let orderDiscountTotal = 0
  const categoryTotals: Record<string, number> = {}
  const offerUsageMap: Map<string, number> = new Map()

  for (const ticket of tickets) {
    // Validate store is in region
    if (!regionStoreIds.includes(ticket.storeId)) {
      throw new Error(`Store not in region: ${ticket.storeId}`)
    }

    // Track visited store (preserve first region order)
    if (!visitedStoresSet.has(ticket.storeId)) {
      visitedStoresSet.add(ticket.storeId)
      // Add in region order
      for (const regionStore of region.stores) {
        if (regionStore.storeId === ticket.storeId && !storesVisitedOrdered.includes(ticket.storeId)) {
          storesVisitedOrdered.push(ticket.storeId)
          break
        }
      }
    }

    // Price ticket
    const pricedTicket = priceTicket({
      lines: ticket.lines,
      memberId: ticket.memberId,
      date,
    })

    pricedTickets.push(pricedTicket)

    // Aggregate totals
    for (const line of pricedTicket.lines) {
      grossTotal += line.gross
      lineDiscountTotal += line.discount

      // Track category
      const product = getMenu().find((p) => p.id === line.productId)
      if (product) {
        categoryTotals[product.category] =
          (categoryTotals[product.category] || 0) + line.net
      }

      // Track line offer usage
      if (line.appliedOfferId) {
        offerUsageMap.set(
          line.appliedOfferId,
          (offerUsageMap.get(line.appliedOfferId) || 0) + 1
        )
      }
    }

    // Aggregate order discount
    orderDiscountTotal += pricedTicket.orderLevel.discount

    // Track order offer usage
    if (pricedTicket.orderLevel.appliedOfferId) {
      offerUsageMap.set(
        pricedTicket.orderLevel.appliedOfferId,
        (offerUsageMap.get(pricedTicket.orderLevel.appliedOfferId) || 0) + 1
      )
    }
  }

  // Calculate totals with rounding
  grossTotal = round2(grossTotal)
  lineDiscountTotal = round2(lineDiscountTotal)
  orderDiscountTotal = round2(orderDiscountTotal)
  const discountTotal = round2(lineDiscountTotal + orderDiscountTotal)
  const netTotal = round2(
    pricedTickets.reduce((sum, t) => sum + t.total, 0)
  )

  // Round category totals
  const perCategory: Record<string, number> = {}
  for (const category of Object.keys(categoryTotals).sort()) {
    perCategory[category] = round2(categoryTotals[category])
  }

  // Build offer usage record (sorted keys)
  const offerUsage: Record<string, number> = {}
  for (const offerId of Array.from(offerUsageMap.keys()).sort()) {
    offerUsage[offerId] = offerUsageMap.get(offerId)!
  }

  // Calculate bonus: 3% of first 250, 6% of portion 250-750, 10% of over 750
  let bonus = 0
  if (netTotal <= 250) {
    bonus = round2(netTotal * 0.03)
  } else if (netTotal <= 750) {
    const firstTier = 250 * 0.03
    const secondTier = (netTotal - 250) * 0.06
    bonus = round2(firstTier + secondTier)
  } else {
    const firstTier = 250 * 0.03
    const secondTier = 500 * 0.06
    const thirdTier = (netTotal - 750) * 0.1
    bonus = round2(firstTier + secondTier + thirdTier)
  }

  // Determine stores missed (preserve region order, dedupe)
  const storesMissed: string[] = []
  for (const regionStore of region.stores) {
    if (!visitedStoresSet.has(regionStore.storeId)) {
      storesMissed.push(regionStore.storeId)
    }
  }

  return {
    regionId,
    date,
    grossTotal,
    lineDiscountTotal,
    orderDiscountTotal,
    discountTotal,
    netTotal,
    perCategory,
    offerUsage,
    bonus,
    storesVisited: storesVisitedOrdered,
    storesMissed,
  }
}
