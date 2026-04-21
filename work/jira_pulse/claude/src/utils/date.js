// Date helpers. All times are treated in the *local* timezone of the machine —
// that's what "yesterday" means to the user looking at the dashboard.

export function startOfLocalDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function endOfLocalDay(d = new Date()) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

export function yesterdayRange(now = new Date()) {
  const start = startOfLocalDay(now)
  start.setDate(start.getDate() - 1)
  const end = new Date(start)
  end.setHours(23, 59, 59, 999)
  return { start, end }
}

export function isYesterday(date, now = new Date()) {
  if (!date) return false
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return false
  const { start, end } = yesterdayRange(now)
  return d >= start && d <= end
}

export function daysBetween(a, b) {
  if (!a || !b) return 0
  const da = a instanceof Date ? a : new Date(a)
  const db = b instanceof Date ? b : new Date(b)
  const ms = Math.abs(db - da)
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

export function formatRelative(date, now = new Date()) {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return '—'
  const diffMs = now - d
  const mins = Math.round(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.round(days / 30)
  if (months < 12) return `${months}mo ago`
  const years = Math.round(months / 12)
  return `${years}y ago`
}

export function formatDateTime(date) {
  if (!date) return '—'
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d)) return '—'
  return d.toLocaleString()
}

export function ymd(date) {
  const d = date instanceof Date ? date : new Date(date)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

/**
 * Build a Jira JQL-friendly date filter for "yesterday".
 * Jira accepts YYYY-MM-DD or YYYY/MM/DD.
 */
export function jqlYesterdayRange(now = new Date()) {
  const { start, end } = yesterdayRange(now)
  return { start: ymd(start), end: ymd(end) }
}
