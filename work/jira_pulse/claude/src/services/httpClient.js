// Thin wrapper around the preload IPC HTTP proxy.
// Falls back to `fetch` when running in a plain browser (preview mode).

export function buildAuthHeader(token) {
  if (!token) return {}
  const trimmed = String(token).trim()
  if (!trimmed) return {}
  // Accept explicit "Bearer xxx" / "Basic xxx" or raw tokens (→ Bearer).
  if (/^(Bearer|Basic)\s+/i.test(trimmed)) {
    return { Authorization: trimmed }
  }
  return { Authorization: `Bearer ${trimmed}` }
}

function hasElectronApi() {
  return typeof window !== 'undefined' && window.api && typeof window.api.request === 'function'
}

export async function request(opts) {
  if (hasElectronApi()) return window.api.request(opts)

  // Browser fallback (dev preview only). This may fail with CORS against
  // real Jira instances — that's fine; the Electron build is the supported path.
  try {
    const url = new URL(opts.url)
    if (opts.params) {
      Object.entries(opts.params).forEach(([k, v]) => {
        if (v !== undefined && v !== null) url.searchParams.set(k, v)
      })
    }
    const res = await fetch(url.toString(), {
      method: opts.method || 'GET',
      headers: opts.headers,
      body: opts.data ? JSON.stringify(opts.data) : undefined,
    })
    const text = await res.text()
    let data
    try { data = JSON.parse(text) } catch { data = text }
    return { ok: res.ok, status: res.status, data }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  }
}

export function joinUrl(base, path) {
  return `${String(base || '').replace(/\/+$/, '')}${path.startsWith('/') ? '' : '/'}${path}`
}
