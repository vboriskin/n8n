// Analytics engine — takes raw Jira issues (with changelog + worklog + comments
// attached) plus optional Confluence/Bitbucket activity, and produces:
//   - per-issue metrics
//   - per-employee metrics (with comments/confluence/bitbucket attached)
//   - team summary
//   - insights (structured signals)

import { isYesterday, daysBetween } from '../utils/date'

// ----- pure helpers ---------------------------------------------------------

function assigneeKey(issue) {
  const a = issue.fields?.assignee
  if (!a) return '__unassigned__'
  return a.key || a.accountId || a.name || a.emailAddress || a.displayName || '__unassigned__'
}

function assigneeDisplay(issue) {
  const a = issue.fields?.assignee
  if (!a) return 'Unassigned'
  return a.displayName || a.name || a.emailAddress || 'Unknown'
}

function commentAuthorKey(c) {
  const a = c.author || c.updateAuthor
  if (!a) return null
  return a.key || a.accountId || a.name || a.emailAddress || null
}

function worklogAuthorKey(w) {
  const a = w.author
  if (!a) return null
  return a.key || a.accountId || a.name || a.emailAddress || null
}

// Seconds → pretty hours string
function fmtSeconds(seconds) {
  if (!seconds) return '0h'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h && m) return `${h}h ${m}m`
  if (h) return `${h}h`
  return `${m}m`
}

function lastActivityForIssue(issue) {
  // Prefer the most recent of: updated, last comment, last worklog, last changelog.
  const candidates = []
  if (issue.fields?.updated) candidates.push(new Date(issue.fields.updated))
  const comments = issue.commentsFull || issue.fields?.comment?.comments || []
  for (const c of comments) {
    if (c.updated) candidates.push(new Date(c.updated))
    else if (c.created) candidates.push(new Date(c.created))
  }
  const worklogs = issue.worklogs || issue.fields?.worklog?.worklogs || []
  for (const w of worklogs) {
    if (w.started) candidates.push(new Date(w.started))
    if (w.updated) candidates.push(new Date(w.updated))
  }
  const histories = issue.changelog?.histories || []
  for (const h of histories) {
    if (h.created) candidates.push(new Date(h.created))
  }
  const valid = candidates.filter((d) => !isNaN(d))
  if (!valid.length) return null
  return new Date(Math.max(...valid.map((d) => d.getTime())))
}

// ----- per-issue computation ------------------------------------------------

export function computeIssueMetrics(issue, config) {
  const statuses = (config.statusesInProgress || []).map((s) => s.toLowerCase())
  const thresholdDays = Number(config.staleDaysThreshold ?? 3)
  const now = new Date()

  const status = issue.fields?.status?.name || ''
  const isInProgress = statuses.includes(status.toLowerCase())

  const assigneeId = assigneeKey(issue)

  const worklogs = issue.worklogs || issue.fields?.worklog?.worklogs || []
  const comments = issue.commentsFull || issue.fields?.comment?.comments || []

  const worklogsYesterday = worklogs.filter((w) =>
    isYesterday(w.started || w.created)
  )
  const worklogsYesterdayByAssignee = worklogsYesterday.filter(
    (w) => worklogAuthorKey(w) === assigneeId
  )

  const commentsYesterdayByAssignee = comments
    .filter(
      (c) =>
        commentAuthorKey(c) === assigneeId &&
        isYesterday(c.created || c.updated)
    )
    .map((c) => ({
      issueKey: issue.key,
      issueSummary: issue.fields?.summary || '',
      commentText: extractCommentText(c),
      createdAt: c.created || c.updated,
      authorDisplay: c.author?.displayName || c.author?.name || '',
    }))

  // Any comment yesterday (not just assignee) — counts as "partial" activity.
  const anyCommentYesterday = comments.some((c) =>
    isYesterday(c.created || c.updated)
  )

  const histories = issue.changelog?.histories || []
  const changelogYesterday = histories.some((h) => isYesterday(h.created))

  let activityYesterday = 'NO'
  if (worklogsYesterday.length > 0) activityYesterday = 'YES'
  else if (anyCommentYesterday || changelogYesterday) activityYesterday = 'PARTIAL'

  const lastActivityAt = lastActivityForIssue(issue)
  const daysSinceActivity = lastActivityAt ? daysBetween(lastActivityAt, now) : null

  // "daysInProgress" — look back through the changelog for the most recent
  // transition INTO an in-progress status; otherwise fall back to `updated`.
  let daysInProgress = 0
  if (isInProgress) {
    let enteredAt = null
    for (let i = histories.length - 1; i >= 0; i -= 1) {
      const h = histories[i]
      const statusItem = (h.items || []).find((it) => it.field === 'status')
      if (statusItem && statuses.includes(String(statusItem.toString || '').toLowerCase())) {
        enteredAt = new Date(h.created)
        break
      }
    }
    if (!enteredAt && issue.fields?.updated) enteredAt = new Date(issue.fields.updated)
    if (enteredAt && !isNaN(enteredAt)) daysInProgress = daysBetween(enteredAt, now)
  }

  const isStale =
    isInProgress &&
    lastActivityAt !== null &&
    daysSinceActivity !== null &&
    daysSinceActivity > thresholdDays

  const loggedYesterdaySeconds = worklogsYesterdayByAssignee.reduce(
    (sum, w) => sum + (w.timeSpentSeconds || 0),
    0
  )

  return {
    key: issue.key,
    summary: issue.fields?.summary || '',
    status,
    assigneeId,
    assigneeDisplay: assigneeDisplay(issue),
    priority: issue.fields?.priority?.name,
    issueType: issue.fields?.issuetype?.name,
    url: issue.self ? deriveIssueUrl(issue) : null,
    isInProgress,
    daysInProgress,
    lastUpdated: issue.fields?.updated || null,
    lastActivityAt: lastActivityAt ? lastActivityAt.toISOString() : null,
    daysSinceActivity,
    activityYesterday,
    isStale,
    hasCommentYesterday: commentsYesterdayByAssignee.length > 0,
    loggedYesterdaySeconds,
    loggedYesterdayPretty: fmtSeconds(loggedYesterdaySeconds),
    commentsYesterday: commentsYesterdayByAssignee,
  }
}

function extractCommentText(c) {
  // Jira Server returns `body` as a string; DC/Cloud may return ADF JSON.
  if (typeof c.body === 'string') return c.body
  if (c.renderedBody) return c.renderedBody.replace(/<[^>]+>/g, '')
  return ''
}

function deriveIssueUrl(issue) {
  if (!issue.self) return null
  try {
    const u = new URL(issue.self)
    return `${u.protocol}//${u.host}/browse/${issue.key}`
  } catch {
    return null
  }
}

// ----- per-employee aggregation --------------------------------------------

export function aggregateEmployees(issueMetrics, config, { confluenceByUser, bitbucketByUser } = {}) {
  const byKey = new Map()

  for (const m of issueMetrics) {
    if (!byKey.has(m.assigneeId)) {
      byKey.set(m.assigneeId, {
        id: m.assigneeId,
        displayName: m.assigneeDisplay,
        issues: [],
        totalIssuesInProgress: 0,
        totalLoggedYesterdaySeconds: 0,
        lastActivityAt: null,
        staleIssuesCount: 0,
        inactiveIssuesCount: 0,
        commentsYesterday: [],
        confluenceActivity: [],
        bitbucket: { commits: [], pullRequests: [] },
      })
    }
    const emp = byKey.get(m.assigneeId)
    emp.issues.push(m)
    if (m.isInProgress) emp.totalIssuesInProgress += 1
    emp.totalLoggedYesterdaySeconds += m.loggedYesterdaySeconds || 0
    if (m.lastActivityAt) {
      const t = new Date(m.lastActivityAt).getTime()
      if (!emp.lastActivityAt || t > new Date(emp.lastActivityAt).getTime()) {
        emp.lastActivityAt = m.lastActivityAt
      }
    }
    if (m.isStale) emp.staleIssuesCount += 1
    if (m.isInProgress && m.activityYesterday === 'NO') emp.inactiveIssuesCount += 1
    if (m.commentsYesterday && m.commentsYesterday.length) {
      emp.commentsYesterday.push(...m.commentsYesterday)
    }
  }

  // Attach Confluence / Bitbucket activity by lowercased key match.
  if (confluenceByUser || bitbucketByUser) {
    for (const emp of byKey.values()) {
      const candidates = [emp.id, emp.displayName]
        .filter(Boolean)
        .map((s) => String(s).toLowerCase())
      if (confluenceByUser) {
        for (const k of candidates) {
          if (confluenceByUser.has(k)) {
            emp.confluenceActivity.push(...confluenceByUser.get(k))
          }
        }
      }
      if (bitbucketByUser) {
        for (const k of candidates) {
          if (bitbucketByUser.has(k)) {
            const bucket = bitbucketByUser.get(k)
            emp.bitbucket.commits.push(...(bucket.commits || []))
            emp.bitbucket.pullRequests.push(...(bucket.pullRequests || []))
          }
        }
      }
    }
  }

  // Add pretty formatted time + activity flag
  for (const emp of byKey.values()) {
    emp.totalLoggedYesterdayPretty = fmtSeconds(emp.totalLoggedYesterdaySeconds)
    emp.wasActiveYesterday =
      emp.totalLoggedYesterdaySeconds > 0 ||
      emp.commentsYesterday.length > 0 ||
      emp.issues.some((i) => i.activityYesterday !== 'NO') ||
      (emp.confluenceActivity || []).length > 0 ||
      (emp.bitbucket.commits || []).length > 0 ||
      (emp.bitbucket.pullRequests || []).length > 0
  }

  return Array.from(byKey.values()).sort((a, b) =>
    a.displayName.localeCompare(b.displayName)
  )
}

// ----- team summary --------------------------------------------------------

export function buildTeamSummary(employees, issueMetrics, sprintNotStartedCount = 0) {
  const totalEmployees = employees.length
  const activeEmployeesYesterday = employees.filter((e) => e.wasActiveYesterday).length
  const totalIssuesInProgress = issueMetrics.filter((i) => i.isInProgress).length
  const issuesWithActivityYesterday = issueMetrics.filter(
    (i) => i.activityYesterday !== 'NO'
  ).length
  const totalLoggedYesterdaySeconds = issueMetrics.reduce(
    (s, i) => s + (i.loggedYesterdaySeconds || 0),
    0
  )
  const staleIssuesCount = issueMetrics.filter((i) => i.isStale).length

  return {
    totalEmployees,
    activeEmployeesYesterday,
    totalIssuesInProgress,
    issuesWithActivityYesterday,
    totalLoggedYesterdaySeconds,
    totalLoggedYesterdayPretty: fmtSeconds(totalLoggedYesterdaySeconds),
    staleIssuesCount,
    sprintNotStartedCount,
  }
}

// ----- insights engine -----------------------------------------------------

export function generateInsights({ summary, employees, issueMetrics, config }) {
  const insights = []
  const thresholdDays = Number(config.staleDaysThreshold ?? 3)

  // --- TEAM level ---
  if (
    summary.totalIssuesInProgress >= 5 &&
    summary.issuesWithActivityYesterday / Math.max(1, summary.totalIssuesInProgress) < 0.4
  ) {
    insights.push({
      level: 'warning',
      scope: 'team',
      message: 'Low activity on in-progress work',
      reason: `Only ${summary.issuesWithActivityYesterday}/${summary.totalIssuesInProgress} in-progress issues had any activity yesterday.`,
      recommendation: 'Review standup, identify blockers, and re-assign stuck items.',
    })
  }

  if (summary.staleIssuesCount >= 3) {
    insights.push({
      level: summary.staleIssuesCount >= 6 ? 'critical' : 'warning',
      scope: 'team',
      message: `${summary.staleIssuesCount} stale issues in progress`,
      reason: `Issues with no activity for more than ${thresholdDays} days.`,
      recommendation: 'Time-box them, move them back to backlog, or split into smaller tasks.',
    })
  }

  if (summary.sprintNotStartedCount >= 3) {
    insights.push({
      level: 'warning',
      scope: 'team',
      message: `${summary.sprintNotStartedCount} sprint tasks not started`,
      reason: 'These are in the active sprint but still in To Do / backlog.',
      recommendation: 'Validate scope; deprioritise or descope unrealistic commitments.',
    })
  }

  // Workload imbalance: highest load > 2x the median of in-progress counts
  const loads = employees.map((e) => e.totalIssuesInProgress).filter((n) => n > 0)
  if (loads.length >= 3) {
    const sorted = loads.slice().sort((a, b) => a - b)
    const median = sorted[Math.floor(sorted.length / 2)]
    const max = sorted[sorted.length - 1]
    if (median > 0 && max >= median * 2 && max >= 5) {
      const overloaded = employees
        .filter((e) => e.totalIssuesInProgress === max)
        .map((e) => e.displayName)
        .join(', ')
      insights.push({
        level: 'warning',
        scope: 'team',
        message: 'Workload imbalance',
        reason: `${overloaded} is holding ${max} in-progress issues (team median: ${median}).`,
        recommendation: 'Redistribute to under-loaded teammates or pair on them.',
      })
    }
  }

  // --- EMPLOYEE level ---
  for (const emp of employees) {
    if (emp.id === '__unassigned__') continue

    if (emp.totalIssuesInProgress > 5) {
      insights.push({
        level: 'warning',
        scope: 'employee',
        employeeId: emp.id,
        employeeName: emp.displayName,
        message: `${emp.displayName} has too many issues in progress`,
        reason: `${emp.totalIssuesInProgress} issues currently in progress.`,
        recommendation: 'Park lower-priority items; focus on 2–3 at a time.',
      })
    }

    if (emp.totalIssuesInProgress > 0 && !emp.wasActiveYesterday) {
      insights.push({
        level: 'info',
        scope: 'employee',
        employeeId: emp.id,
        employeeName: emp.displayName,
        message: `${emp.displayName} had no activity yesterday`,
        reason: 'No worklogs, comments, commits, or Confluence edits detected.',
        recommendation: 'Check in — they may be blocked, on PTO, or in meetings.',
      })
    }

    if (emp.staleIssuesCount >= 2) {
      insights.push({
        level: emp.staleIssuesCount >= 4 ? 'critical' : 'warning',
        scope: 'employee',
        employeeId: emp.id,
        employeeName: emp.displayName,
        message: `${emp.displayName} has ${emp.staleIssuesCount} stale issues`,
        reason: `Issues stalled for more than ${thresholdDays} days.`,
        recommendation: 'Unblock, split, or return to backlog.',
      })
    }

    if (emp.totalIssuesInProgress >= 3 && emp.totalLoggedYesterdaySeconds === 0) {
      insights.push({
        level: 'info',
        scope: 'employee',
        employeeId: emp.id,
        employeeName: emp.displayName,
        message: `${emp.displayName} has issues open but logged no work yesterday`,
        reason: `${emp.totalIssuesInProgress} in progress, 0h logged yesterday.`,
        recommendation: 'Encourage consistent worklog habits for forecasting.',
      })
    }
  }

  // Sort: critical → warning → info
  const order = { critical: 0, warning: 1, info: 2 }
  insights.sort((a, b) => (order[a.level] ?? 9) - (order[b.level] ?? 9))

  return insights
}

// ----- top-level orchestrator ----------------------------------------------

/**
 * Pure function — takes already-fetched raw data and spits out everything
 * the UI needs in one pass.
 */
export function buildAnalytics({
  config,
  issues = [],
  sprintIssues = [],
  confluencePages = [],
  bitbucketCommits = [],
  bitbucketPullRequests = [],
}) {
  const issueMetrics = issues.map((i) => computeIssueMetrics(i, config))

  // Build lookup maps from helpers
  const confluenceByUser = groupConfluenceByUser(confluencePages)
  const bitbucketByUser = groupBitbucketByUser({
    commits: bitbucketCommits,
    pullRequests: bitbucketPullRequests,
  })

  const employees = aggregateEmployees(issueMetrics, config, {
    confluenceByUser,
    bitbucketByUser,
  })

  const statuses = (config.statusesInProgress || []).map((s) => s.toLowerCase())
  const sprintNotStarted = sprintIssues.filter((i) => {
    const s = (i.fields?.status?.name || '').toLowerCase()
    return !statuses.includes(s) && s !== 'done' && s !== 'closed' && s !== 'resolved'
  })

  const summary = buildTeamSummary(employees, issueMetrics, sprintNotStarted.length)
  const insights = generateInsights({ summary, employees, issueMetrics, config })

  return {
    issueMetrics,
    employees,
    summary,
    insights,
    sprintNotStarted: sprintNotStarted.map((i) => ({
      key: i.key,
      summary: i.fields?.summary,
      status: i.fields?.status?.name,
      assignee: i.fields?.assignee?.displayName || 'Unassigned',
      priority: i.fields?.priority?.name,
    })),
    generatedAt: new Date().toISOString(),
  }
}

// ----- small re-exports for grouping helpers (so the UI can reuse them) ----

function groupConfluenceByUser(pages) {
  const by = new Map()
  for (const p of pages) {
    const key = String(p.authorKey || p.authorName || '').toLowerCase()
    if (!key) continue
    if (!by.has(key)) by.set(key, [])
    by.get(key).push({
      pageTitle: p.pageTitle,
      url: p.url,
      updatedAt: p.updatedAt,
    })
  }
  return by
}

function groupBitbucketByUser({ commits = [], pullRequests = [] }) {
  const by = new Map()
  const add = (candidates, kind, item) => {
    const key = candidates.find(Boolean)?.toLowerCase()
    if (!key) return
    if (!by.has(key)) by.set(key, { commits: [], pullRequests: [] })
    by.get(key)[kind].push(item)
  }
  for (const c of commits) add([c.author, c.authorEmail, c.authorDisplayName], 'commits', c)
  for (const p of pullRequests) add([p.author, p.authorDisplayName], 'pullRequests', p)
  return by
}
