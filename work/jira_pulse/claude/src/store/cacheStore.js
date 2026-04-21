// Cache store — stores the last analytics snapshot so the UI renders
// instantly on app start while we refresh in the background.

const KEY = 'team-pulse:cache'

function hasElectronApi() {
  return typeof window !== 'undefined' && window.api && typeof window.api.getCache === 'function'
}

export async function loadCache() {
  try {
    if (hasElectronApi()) return (await window.api.getCache()) || {}
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export async function saveCache(data) {
  try {
    if (hasElectronApi()) return await window.api.setCache(data)
    localStorage.setItem(KEY, JSON.stringify(data))
    return true
  } catch {
    return false
  }
}

export async function clearCache() {
  try {
    if (hasElectronApi()) return await window.api.clearCache()
    localStorage.removeItem(KEY)
    return true
  } catch {
    return false
  }
}
