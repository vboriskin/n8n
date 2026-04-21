// Config store — thin wrapper around preload IPC, with a browser fallback
// (localStorage) so `npm run preview` in a plain browser still works.

const KEY = 'team-pulse:config'

export const DEFAULT_CONFIG = {
  jiraBaseUrl: '',
  jiraToken: '',
  jqlQuery: 'project = DEMO AND sprint in openSprints()',
  statusesInProgress: ['In Progress', 'In Review', 'In Development'],
  staleDaysThreshold: 3,
  confluenceBaseUrl: '',
  confluenceToken: '',
  bitbucketBaseUrl: '',
  bitbucketToken: '',
  bitbucketProjectKey: '',
  bitbucketRepoSlug: '',
  theme: 'system', // 'light' | 'dark' | 'system'
}

function hasElectronApi() {
  return typeof window !== 'undefined' && window.api && typeof window.api.getConfig === 'function'
}

export async function loadConfig() {
  try {
    if (hasElectronApi()) {
      const saved = await window.api.getConfig()
      return { ...DEFAULT_CONFIG, ...(saved || {}) }
    }
    const raw = localStorage.getItem(KEY)
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : { ...DEFAULT_CONFIG }
  } catch (err) {
    console.warn('[configStore] loadConfig failed', err)
    return { ...DEFAULT_CONFIG }
  }
}

export async function saveConfig(cfg) {
  try {
    if (hasElectronApi()) {
      await window.api.setConfig(cfg)
      return true
    }
    localStorage.setItem(KEY, JSON.stringify(cfg))
    return true
  } catch (err) {
    console.error('[configStore] saveConfig failed', err)
    return false
  }
}
