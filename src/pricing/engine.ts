import { getOffers, getMenuItem, getMember } from '../data/index'
import type {
  Member,
  Offer,
  PercentOffOffer,
  BundleOffer,
  SpendThresholdOffer,
} from '../data/index'

export interface CartLine {
  productId: string
  qty: number
}

export interface PriceTicketInput {
  lines: CartLine[]
  memberId: string | null
  date: string
}

export interface PricedLine {
  productId: string
  qty: number
  unitPrice: number
  gross: number
  appliedOfferId: string | null
  discount: number
  net: number
}

export interface PricedTicket {
  lines: PricedLine[]
  orderLevel: { appliedOfferId: string | null; discount: number }
  subtotal: number
  total: number
}

// Half-up rounding to 2 decimal places
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Check if an offer is active on a given date
function isOfferActive(offer: Offer, date: string): boolean {
  return date >= offer.validFrom && date <= offer.validTo
}

// Check if offer is eligible for a member
function isOfferEligible(offer: Offer, member: Member | null): boolean {
  if (!offer.eligibleTiers) {
    // No tier restriction, everyone is eligible
    return true
  }
  if (!member) {
    // Offer requires a member but we have walk-in
    return false
  }
  return offer.eligibleTiers.includes(member.tier)
}

// Check if offer matches day of week
function isDayOfWeekMatch(offer: Offer, date: string): boolean {
  if (!offer.dayOfWeek) {
    return true
  }
  // Parse ISO date string (YYYY-MM-DD)
  const [yearStr, monthStr, dayStr] = date.split('-')
  const year = parseInt(yearStr, 10)
  const month = parseInt(monthStr, 10)
  const day = parseInt(dayStr, 10)
  
  const utcDate = new Date(Date.UTC(year, month - 1, day))
  const weekdayIndex = utcDate.getUTCDay()
  const weekdayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const weekday = weekdayNames[weekdayIndex]
  
  return offer.dayOfWeek.includes(weekday as any)
}

// Get all active and eligible offers
function getActiveEligibleOffers(
  date: string,
  member: Member | null
): Offer[] {
  return getOffers().filter((offer) => {
    return (
      isOfferActive(offer, date) &&
      isOfferEligible(offer, member) &&
      isDayOfWeekMatch(offer, date)
    )
  })
}

// Apply line offers (percent_off and bundle)
function applyLineOffers(
  pricedLines: PricedLine[],
  activeOffers: Offer[],
  lines: CartLine[]
): PricedLine[] {
  const result = pricedLines.map((line) => ({ ...line }))

  for (let i = 0; i < result.length; i++) {
    const line = result[i]
    let bestDiscount = 0
    let bestOfferId: string | null = null
    let bestOfferIndex = Infinity

    // Try each active offer
    for (let offerIdx = 0; offerIdx < activeOffers.length; offerIdx++) {
      const offer = activeOffers[offerIdx]

      if (offer.type === 'percent_off') {
        const percentOffer = offer as PercentOffOffer
        // Check if this offer applies to this line
        const scope = percentOffer.scope
        let applies = false

        if (
          scope.category &&
          getMenuItem(line.productId)?.category === scope.category
        ) {
          applies = true
        } else if (scope.productIds && scope.productIds.includes(line.productId)) {
          applies = true
        }

        if (applies) {
          const discount = round2(
            (line.gross * percentOffer.percent) / 100
          )
          const clampedDiscount = Math.min(discount, line.gross)

          if (
            clampedDiscount > bestDiscount ||
            (clampedDiscount === bestDiscount &&
              (offerIdx < bestOfferIndex ||
                (offerIdx === bestOfferIndex &&
                  offer.id < (bestOfferId || ''))))
          ) {
            bestDiscount = clampedDiscount
            bestOfferId = offer.id
            bestOfferIndex = offerIdx
          }
        }
      } else if (offer.type === 'bundle') {
        const bundleOffer = offer as BundleOffer
        const [buyId, getId] = bundleOffer.products

        // Only apply bundle discount to buy lines
        if (line.productId === buyId) {
          // Calculate cart-wide quantities
          let buyQty = 0
          let getQty = 0
          for (const cartLine of lines) {
            if (cartLine.productId === buyId) {
              buyQty += cartLine.qty
            } else if (cartLine.productId === getId) {
              getQty += cartLine.qty
            }
          }

          const pairs = Math.min(buyQty, getQty)
          if (pairs > 0) {
            const discount = round2(pairs * bundleOffer.amountOff)
            const clampedDiscount = Math.min(discount, line.gross)

            if (clampedDiscount > 0) {
              if (
                clampedDiscount > bestDiscount ||
                (clampedDiscount === bestDiscount &&
                  (offerIdx < bestOfferIndex ||
                    (offerIdx === bestOfferIndex &&
                      offer.id < (bestOfferId || ''))))
              ) {
                bestDiscount = clampedDiscount
                bestOfferId = offer.id
                bestOfferIndex = offerIdx
              }
            }
          }
        }
      }
    }

    result[i].appliedOfferId = bestOfferId
    result[i].discount = bestDiscount
    result[i].net = round2(Math.max(0, line.gross - bestDiscount))
  }

  return result
}

// Apply order-level offers (spend_threshold)
function applyOrderOffer(
  pricedLines: PricedLine[],
  subtotal: number,
  activeOffers: Offer[]
): { appliedOfferId: string | null; discount: number } {
  let bestOffer: SpendThresholdOffer | null = null
  let maxDiscount = 0

  const spendOffers = activeOffers.filter(
    (o) => o.type === 'spend_threshold'
  ) as SpendThresholdOffer[]

  for (const offer of spendOffers) {
    // Determine qualification amount
    let qualificationAmount = subtotal

    if (offer.category) {
      // Sum line nets in this category
      qualificationAmount = 0
      for (const pricedLine of pricedLines) {
        if (getMenuItem(pricedLine.productId)?.category === offer.category) {
          qualificationAmount += pricedLine.net
        }
      }
    }

    // Check if threshold is met
    if (qualificationAmount >= offer.minSubtotal) {
      const discount = offer.amountOff

      if (discount > maxDiscount) {
        maxDiscount = discount
        bestOffer = offer
      } else if (discount === maxDiscount && bestOffer) {
        // Ties: earlier validFrom, then smaller id
        const cmp = offer.validFrom.localeCompare(bestOffer.validFrom)
        if (cmp < 0 || (cmp === 0 && offer.id < bestOffer.id)) {
          bestOffer = offer
        }
      }
    }
  }

  if (bestOffer) {
    // Clamp discount so it doesn't exceed subtotal, but report full amount
    const clampedDiscount = round2(bestOffer.amountOff)
    return {
      appliedOfferId: bestOffer.id,
      discount: clampedDiscount,
    }
  }

  return { appliedOfferId: null, discount: 0 }
}

export function priceTicket(input: PriceTicketInput): PricedTicket {
  const { lines, memberId, date } = input

  // Validate member exists if provided
  let member: Member | null = null
  if (memberId !== null) {
    const foundMember = getMember(memberId)
    if (!foundMember) {
      throw new Error(`Unknown member: ${memberId}`)
    }
    member = foundMember
  }

  // Validate and create priced lines
  const pricedLines: PricedLine[] = []

  for (const line of lines) {
    // Validate qty
    if (!Number.isInteger(line.qty) || line.qty <= 0) {
      throw new Error(`Invalid qty for ${line.productId}`)
    }

    // Get product
    const product = getMenuItem(line.productId)
    if (!product) {
      throw new Error(`Unknown product: ${line.productId}`)
    }

    // Calculate gross
    const gross = round2(product.basePrice * line.qty)

    pricedLines.push({
      productId: line.productId,
      qty: line.qty,
      unitPrice: product.basePrice,
      gross,
      appliedOfferId: null,
      discount: 0,
      net: gross,
    })
  }

  // Get active and eligible offers
  const activeOffers = getActiveEligibleOffers(date, member)

  // Apply line offers
  const linesWithDiscounts = applyLineOffers(pricedLines, activeOffers, lines)

  // Calculate subtotal
  const subtotal = round2(
    linesWithDiscounts.reduce((sum, line) => sum + line.net, 0)
  )

  // Apply order offer
  const orderLevel = applyOrderOffer(
    linesWithDiscounts,
    subtotal,
    activeOffers
  )

  // Calculate total
  const total = round2(Math.max(0, subtotal - orderLevel.discount))

  return {
    lines: linesWithDiscounts,
    orderLevel,
    subtotal,
    total,
  }
}
