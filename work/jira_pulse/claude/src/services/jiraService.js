// Jira Server/DC 8.20.x REST API client.
// Uses the preload HTTP proxy so we're not blocked by browser CORS.

import { request, joinUrl, buildAuthHeader } from './httpClient'

const DEFAULT_FIELDS = [
  'summary',
  'status',
  'assignee',
  'reporter',
  'priority',
  'updated',
  'created',
  'issuetype',
  'project',
  'labels',
  'components',
  'duedate',
  'timetracking',
  'sprint',
  'customfield_10020', // common Sprint field on Server
]

function headers(token) {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...buildAuthHeader(token),
  }
}

// ----- low-level helpers ----------------------------------------------------

async function get(baseUrl, token, path, params) {
  const res = await request({
    method: 'GET',
    url: joinUrl(baseUrl, path),
    headers: headers(token),
    params,
  })
  if (!res.ok) {
    const msg =
      (res.data && res.data.errorMessages && res.data.errorMessages.join('; ')) ||
      res.error ||
      `Jira ${res.status}`
    throw new Error(`GET ${path} failed: ${msg}`)
  }
  return res.data
}

// ----- search with pagination ----------------------------------------------

/**
 * Search Jira issues by JQL, paginating through all results.
 * Returns an array of issue objects.
 */
export async function searchIssues({
  baseUrl,
  token,
  jql,
  fields = DEFAULT_FIELDS,
  expand = ['changelog'],
  pageSize = 100,
  maxPages = 20, // safety cap → 2000 issues
  onProgress,
}) {
  if (!baseUrl) throw new Error('Jira baseUrl is required')
  if (!jql) throw new Error('JQL is required')

  const all = []
  let startAt = 0
  let total = null
  let page = 0

  while (page < maxPages) {
    const data = await get(baseUrl, token, '/rest/api/2/search', {
      jql,
      startAt,
      maxResults: pageSize,
      fields: fields.join(','),
      expand: expand.join(','),
    })
    const issues = data.issues || []
    all.push(...issues)
    total = data.total ?? all.length

    if (typeof onProgress === 'function') {
      onProgress({ fetched: all.length, total })
    }

    if (all.length >= total || issues.length === 0) break
    startAt += pageSize
    page += 1
  }

  return all
}

// ----- per-issue endpoints --------------------------------------------------

export async function getIssue({ baseUrl, token, idOrKey, expand = ['changelog'] }) {
  return get(baseUrl, token, `/rest/api/2/issue/${encodeURIComponent(idOrKey)}`, {
    expand: expand.join(','),
  })
}

export async function getIssueWorklog({ baseUrl, token, idOrKey }) {
  const data = await get(
    baseUrl,
    token,
    `/rest/api/2/issue/${encodeURIComponent(idOrKey)}/worklog`
  )
  return data.worklogs || []
}

export async function getIssueComments({ baseUrl, token, idOrKey }) {
  const data = await get(
    baseUrl,
    token,
    `/rest/api/2/issue/${encodeURIComponent(idOrKey)}/comment`,
    { orderBy: 'created', maxResults: 1000 }
  )
  return data.comments || []
}

// ----- active sprint via Agile API -----------------------------------------

export async function getActiveSprintIssues({ baseUrl, token, boardId }) {
  if (!boardId) return []
  const data = await get(
    baseUrl,
    token,
    `/rest/agile/1.0/board/${boardId}/sprint`,
    { state: 'active' }
  )
  const sprints = data.values || []
  if (!sprints.length) return []
  const sprintId = sprints[0].id
  const issuesData = await get(
    baseUrl,
    token,
    `/rest/agile/1.0/sprint/${sprintId}/issue`,
    { maxResults: 500 }
  )
  return issuesData.issues || []
}

// ----- convenience: enrich a list of issues with worklog + comments --------

/**
 * Given an array of issue summaries (from searchIssues), fetch worklog + comments
 * for each in parallel (with concurrency). Returns the same array mutated with
 * `.worklogs` and `.commentsFull` on each issue.
 */
export async function enrichIssues({
  baseUrl,
  token,
  issues,
  concurrency = 6,
  onProgress,
}) {
  let done = 0
  const queue = issues.slice()
  const workers = Array.from({ length: Math.max(1, concurrency) }, async () => {
    while (queue.length) {
      const issue = queue.shift()
      if (!issue) break
      try {
        const [worklogs, comments] = await Promise.all([
          getIssueWorklog({ baseUrl, token, idOrKey: issue.key }).catch(() => []),
          getIssueComments({ baseUrl, token, idOrKey: issue.key }).catch(() => []),
        ])
        issue.worklogs = worklogs
        issue.commentsFull = comments
      } catch (err) {
        issue.worklogs = []
        issue.commentsFull = []
      }
      done += 1
      if (typeof onProgress === 'function') {
        onProgress({ done, total: issues.length })
      }
    }
  })
  await Promise.all(workers)
  return issues
}

// ----- optional: test connection -------------------------------------------

export async function testConnection({ baseUrl, token }) {
  try {
    const me = await get(baseUrl, token, '/rest/api/2/myself')
    return { ok: true, user: me }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
