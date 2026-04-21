// Confluence Server/DC REST client — fetches pages updated "yesterday"
// and groups them by author.

import { request, joinUrl, buildAuthHeader } from './httpClient'
import { isYesterday, ymd, yesterdayRange } from '../utils/date'

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
    throw new Error(`Confluence ${res.status}: ${res.error || path}`)
  }
  return res.data
}

/**
 * Fetch content updated yesterday, with history and version expanded so we
 * can identify the last-update author. Uses CQL if available, else falls
 * back to the /content endpoint with a date filter via lastModified.
 */
export async function getPagesUpdatedYesterday({
  baseUrl,
  token,
  spaceKey,
  limit = 200,
}) {
  if (!baseUrl) return []
  const { start } = yesterdayRange()

  // Prefer the CQL search endpoint — far more reliable than /content filtering.
  const cqlParts = [`type = page`, `lastModified >= "${ymd(start)}"`]
  if (spaceKey) cqlParts.push(`space = "${spaceKey}"`)
  const cql = cqlParts.join(' AND ')

  const data = await get(baseUrl, token, '/rest/api/content/search', {
    cql,
    limit,
    expand: 'history,history.lastUpdated,version,space',
  })

  const results = (data.results || data.entities || []).filter((p) => {
    const when = p.version?.when || p.history?.lastUpdated?.when
    return isYesterday(when)
  })

  return results.map((p) => ({
    id: p.id,
    pageTitle: p.title,
    spaceKey: p.space?.key,
    updatedAt: p.version?.when || p.history?.lastUpdated?.when,
    authorKey:
      p.version?.by?.username ||
      p.version?.by?.accountId ||
      p.history?.lastUpdated?.by?.username ||
      null,
    authorName:
      p.version?.by?.displayName ||
      p.history?.lastUpdated?.by?.displayName ||
      null,
    url: p._links?.webui
      ? joinUrl(baseUrl, (p._links.base || '') + p._links.webui)
      : joinUrl(baseUrl, `/pages/viewpage.action?pageId=${p.id}`),
  }))
}

export function groupConfluenceByUser(pages) {
  const by = new Map()
  for (const p of pages) {
    const key = (p.authorKey || p.authorName || '').toLowerCase()
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

export async function testConnection({ baseUrl, token }) {
  try {
    const me = await get(baseUrl, token, '/rest/api/user/current')
    return { ok: true, user: me }
  } catch (err) {
    return { ok: false, error: err.message }
  }
}
