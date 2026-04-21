// Bitbucket Server/DC REST client — fetches commits and PR activity.
// (Bitbucket Cloud endpoints are similar but not identical; this module
// targets Bitbucket Server which pairs with Jira Server/DC 8.20.x.)

import { request, joinUrl, buildAuthHeader } from './httpClient'
import { isYesterday, yesterdayRange } from '../utils/date'

function headers(token) {
  return {
    Accept: 'application/json',
    ...buildAuthHeader(token),
  }
}

async function get(baseUrl, token, path, params) {
  const res = await request({
    method: 'GET',
    url: joinUrl(baseUrl, path),
    headers: headers(token),
    params,
  })
  if (!res.ok) {
    throw new Error(`Bitbucket ${res.status}: ${res.error || path}`)
  }
  return res.data
}

/**
 * Extract Jira issue keys (e.g. ABC-123) from a commit message or PR title.
 */
export function extractIssueKeys(text = '') {
  const re = /\b[A-Z][A-Z0-9_]+-\d+\b/g
  return Array.from(new Set(String(text).match(re) || []))
}

/**
 * Fetch commits made yesterday from a project/repo. Paginates internally and
 * stops as soon as it sees commits older than the yesterday window.
 */
export async function getCommitsYesterday({
  baseUrl,
  token,
  projectKey,
  repoSlug,
  limit = 500,
}) {
  if (!baseUrl || !projectKey || !repoSlug) return []

  const { start } = yesterdayRange()
  const commits = []
  let startAt = 0
  const pageSize = 100

  while (commits.length < limit) {
    const data = await get(
      baseUrl,
      token,
      `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/commits`,
      { start: startAt, limit: pageSize }
    )
    const values = data.values || []
    if (values.length === 0) break

    let stop = false
    for (const c of values) {
      const ts = c.authorTimestamp || c.committerTimestamp
      if (ts && ts < start.getTime()) {
        stop = true
        break
      }
      if (isYesterday(ts)) {
        commits.push({
          hash: c.id,
          displayId: c.displayId,
          message: c.message,
          author: c.author?.name || c.author?.emailAddress,
          authorEmail: c.author?.emailAddress,
          authorDisplayName: c.author?.displayName,
          at: new Date(ts).toISOString(),
          issueKeys: extractIssueKeys(c.message || ''),
        })
      }
    }

    if (stop || data.isLastPage) break
    startAt = data.nextPageStart ?? startAt + pageSize
  }

  return commits
}

/**
 * Fetch open/merged PRs with activity yesterday.
 */
export async function getPullRequestsYesterday({
  baseUrl,
  token,
  projectKey,
  repoSlug,
  state = 'ALL',
  limit = 200,
}) {
  if (!baseUrl || !projectKey || !repoSlug) return []
  const data = await get(
    baseUrl,
    token,
    `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests`,
    { state, order: 'NEWEST', limit }
  )

  const prs = (data.values || []).filter((pr) => {
    const created = pr.createdDate
    const updated = pr.updatedDate
    const closed = pr.closedDate
    return isYesterday(created) || isYesterday(updated) || isYesterday(closed)
  })

  return prs.map((pr) => ({
    id: pr.id,
    title: pr.title,
    state: pr.state,
    author: pr.author?.user?.name || pr.author?.user?.displayName,
    authorDisplayName: pr.author?.user?.displayName,
    createdAt: new Date(pr.createdDate).toISOString(),
    updatedAt: pr.updatedDate ? new Date(pr.updatedDate).toISOString() : null,
    mergedAt: pr.closedDate && pr.state === 'MERGED' ? new Date(pr.closedDate).toISOString() : null,
    url: pr.links?.self?.[0]?.href,
    issueKeys: extractIssueKeys(pr.title || ''),
  }))
}

/**
 * Group commits + PRs by user (by `author` login / email / displayName).
 */
export function groupBitbucketByUser({ commits = [], pullRequests = [] }) {
  const by = new Map()
  const add = (keyCandidates, kind, item) => {
    const key = keyCandidates.find(Boolean)?.toLowerCase()
    if (!key) return
    if (!by.has(key)) by.set(key, { commits: [], pullRequests: [] })
    by.get(key)[kind].push(item)
  }
  for (const c of commits) add([c.author, c.authorEmail, c.authorDisplayName], 'commits', c)
  for (const p of pullRequests) add([p.author, p.authorDisplayName], 'pullRequests', p)
  return by
}

export async function testConnection({ baseUrl, token }) {
  try {
    const me = await get(baseUrl, token, '/rest/api/1.0/users?limit=1')
    return { ok: true, user: me }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
