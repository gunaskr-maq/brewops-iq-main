import { getStores, getTickets } from '../data/index'

export interface StoreAudit {
  storeId: string
  weightedScore: number | null
  trend: 'up' | 'down' | 'flat' | null
  daysSinceLastTicket: number | null
  dormant: boolean
  status: 'thriving' | 'attention' | 'critical' | 'inactive'
}

// Half-up rounding to 2 decimal places
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

// Validate date format YYYY-MM-DD
function validateDate(dateStr: string): void {
  const regex = /^\d{4}-\d{2}-\d{2}$/
  if (!regex.test(dateStr)) {
    throw new Error(`Invalid date: ${dateStr}`)
  }
}

// Calculate UTC days between two dates
function daysDiffUTC(fromDate: string, toDate: string): number {
  // Parse YYYY-MM-DD and create UTC dates
  const [fromYear, fromMonth, fromDay] = fromDate.split('-').map(Number)
  const [toYear, toMonth, toDay] = toDate.split('-').map(Number)

  const from = new Date(Date.UTC(fromYear, fromMonth - 1, fromDay))
  const to = new Date(Date.UTC(toYear, toMonth - 1, toDay))

  const diffMs = to.getTime() - from.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export function auditStores(asOf: string): StoreAudit[] {
  // Validate date format
  validateDate(asOf)

  const stores = getStores()
  const tickets = getTickets()

  const results: StoreAudit[] = []

  for (const store of stores) {
    // Filter tickets for this store with date <= asOf
    const storeTickets = tickets
      .filter((t) => t.storeId === store.id && t.date <= asOf)
      .slice() // Copy to preserve loader array
      .sort((a, b) => {
        // Sort most recent first: date descending, then id descending
        const dateCmp = b.date.localeCompare(a.date)
        if (dateCmp !== 0) return dateCmp
        return b.id.localeCompare(a.id)
      })

    // Calculate weighted score using up to 4 most recent tickets
    let weightedScore: number | null = null
    const weights = [4, 3, 2, 1]
    if (storeTickets.length > 0) {
      let totalWeighted = 0
      let totalWeight = 0
      for (let i = 0; i < Math.min(4, storeTickets.length); i++) {
        totalWeighted += storeTickets[i].csat * weights[i]
        totalWeight += weights[i]
      }
      weightedScore = round2(totalWeighted / totalWeight)
    }

    // Calculate trend
    let trend: 'up' | 'down' | 'flat' | null = null
    if (storeTickets.length >= 2) {
      const latestCsat = storeTickets[0].csat
      // Mean of next 1-3 tickets (indices 1-3)
      const nextTickets = storeTickets.slice(1, 4)
      const meanCsat =
        nextTickets.reduce((sum, t) => sum + t.csat, 0) / nextTickets.length

      if (latestCsat > meanCsat) {
        trend = 'up'
      } else if (latestCsat < meanCsat) {
        trend = 'down'
      } else {
        trend = 'flat'
      }
    }

    // Calculate days since last ticket
    let daysSinceLastTicket: number | null = null
    let dormant = false
    if (storeTickets.length > 0) {
      const lastTicketDate = storeTickets[0].date
      daysSinceLastTicket = daysDiffUTC(lastTicketDate, asOf)
      dormant = daysSinceLastTicket > 21
    } else {
      dormant = true
    }

    // Determine status
    let status: 'thriving' | 'attention' | 'critical' | 'inactive'
    if (storeTickets.length === 0) {
      status = 'inactive'
    } else if (weightedScore! < 3) {
      status = 'critical'
    } else if (weightedScore! < 4) {
      status = 'attention'
    } else {
      status = 'thriving'
    }

    results.push({
      storeId: store.id,
      weightedScore,
      trend,
      daysSinceLastTicket,
      dormant,
      status,
    })
  }

  // Sort by storeId ascending
  results.sort((a, b) => a.storeId.localeCompare(b.storeId))

  return results
}
