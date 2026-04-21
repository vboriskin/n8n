// Global app state: config, analytics snapshot, loading/error, theme.
// Exposes `useApp()` and `useAppActions()` hooks.

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { loadConfig, saveConfig, DEFAULT_CONFIG } from '../store/configStore'
import { loadCache, saveCache } from '../store/cacheStore'
import * as jira from '../services/jiraService'
import * as confluence from '../services/confluenceService'
import * as bitbucket from '../services/bitbucketService'
import { buildAnalytics } from '../services/analyticsService'

const Ctx = createContext(null)

export function AppProvider({ children }) {
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ phase: '', done: 0, total: 0 })
  const [error, setError] = useState(null)
  const [theme, setTheme] = useState('system') // 'light' | 'dark' | 'system'
  const [route, setRoute] = useState('dashboard')
  const bootRef = useRef(false)

  // ---------- bootstrap ----------
  useEffect(() => {
    if (bootRef.current) return
    bootRef.current = true
    ;(async () => {
      const cfg = await loadConfig()
      setConfig(cfg)
      setTheme(cfg.theme || 'system')
      const cached = await loadCache()
      if (cached && cached.analytics) {
        setAnalytics(cached.analytics)
      }
      // If Jira creds are present, auto-refresh in background.
      if (cfg.jiraBaseUrl && cfg.jiraToken && cfg.jqlQuery) {
        refresh(cfg).catch((e) => setError(e.message))
      } else {
        // Land the user on Settings so they can configure.
        setRoute('settings')
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- theme ----------
  useEffect(() => {
    const root = document.documentElement
    const apply = (mode) => {
      const effective =
        mode === 'system'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : mode
      root.classList.toggle('dark', effective === 'dark')
    }
    apply(theme)
    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)')
      const listener = () => apply('system')
      mql.addEventListener('change', listener)
      return () => mql.removeEventListener('change', listener)
    }
  }, [theme])

  // ---------- actions ----------
  const updateConfig = useCallback(
    async (patch) => {
      const next = { ...config, ...patch }
      setConfig(next)
      await saveConfig(next)
      return next
    },
    [config]
  )

  const setThemePersistent = useCallback(
    async (mode) => {
      setTheme(mode)
      await updateConfig({ theme: mode })
    },
    [updateConfig]
  )

  const refresh = useCallback(
    async (cfgOverride) => {
      const cfg = cfgOverride || config
      if (!cfg.jiraBaseUrl || !cfg.jiraToken || !cfg.jqlQuery) {
        setError('Jira URL, token, and JQL are required.')
        return
      }
      setLoading(true)
      setError(null)
      setProgress({ phase: 'Fetching Jira issues…', done: 0, total: 0 })

      try {
        // 1. Primary issue list
        const issues = await jira.searchIssues({
          baseUrl: cfg.jiraBaseUrl,
          token: cfg.jiraToken,
          jql: cfg.jqlQuery,
          onProgress: ({ fetched, total }) =>
            setProgress({ phase: 'Fetching Jira issues…', done: fetched, total }),
        })

        // 2. Enrich with worklogs + comments (parallel)
        setProgress({ phase: 'Enriching worklogs + comments…', done: 0, total: issues.length })
        await jira.enrichIssues({
          baseUrl: cfg.jiraBaseUrl,
          token: cfg.jiraToken,
          issues,
          concurrency: 6,
          onProgress: ({ done, total }) =>
            setProgress({ phase: 'Enriching worklogs + comments…', done, total }),
        })

        // 3. Sprint issues (best-effort)
        setProgress({ phase: 'Checking active sprint…', done: 0, total: 0 })
        let sprintIssues = []
        try {
          // Reuse the main JQL but filter to active sprints.
          const sprintJql = /sprint/i.test(cfg.jqlQuery)
            ? cfg.jqlQuery
            : `(${cfg.jqlQuery}) AND sprint in openSprints()`
          sprintIssues = await jira.searchIssues({
            baseUrl: cfg.jiraBaseUrl,
            token: cfg.jiraToken,
            jql: sprintJql,
            fields: ['summary', 'status', 'assignee', 'priority', 'updated'],
            expand: [],
            pageSize: 100,
            maxPages: 5,
          })
        } catch (e) {
          console.warn('Sprint JQL failed — skipping', e)
        }

        // 4. Confluence (optional)
        let confluencePages = []
        if (cfg.confluenceBaseUrl && cfg.confluenceToken) {
          setProgress({ phase: 'Fetching Confluence activity…', done: 0, total: 0 })
          try {
            confluencePages = await confluence.getPagesUpdatedYesterday({
              baseUrl: cfg.confluenceBaseUrl,
              token: cfg.confluenceToken,
            })
          } catch (e) {
            console.warn('Confluence fetch failed — skipping', e)
          }
        }

        // 5. Bitbucket (optional)
        let bitbucketCommits = []
        let bitbucketPullRequests = []
        if (
          cfg.bitbucketBaseUrl &&
          cfg.bitbucketToken &&
          cfg.bitbucketProjectKey &&
          cfg.bitbucketRepoSlug
        ) {
          setProgress({ phase: 'Fetching Bitbucket activity…', done: 0, total: 0 })
          try {
            const [commits, prs] = await Promise.all([
              bitbucket.getCommitsYesterday({
                baseUrl: cfg.bitbucketBaseUrl,
                token: cfg.bitbucketToken,
                projectKey: cfg.bitbucketProjectKey,
                repoSlug: cfg.bitbucketRepoSlug,
              }),
              bitbucket.getPullRequestsYesterday({
                baseUrl: cfg.bitbucketBaseUrl,
                token: cfg.bitbucketToken,
                projectKey: cfg.bitbucketProjectKey,
                repoSlug: cfg.bitbucketRepoSlug,
              }),
            ])
            bitbucketCommits = commits
            bitbucketPullRequests = prs
          } catch (e) {
            console.warn('Bitbucket fetch failed — skipping', e)
          }
        }

        // 6. Build analytics (pure)
        setProgress({ phase: 'Computing analytics…', done: 0, total: 0 })
        const result = buildAnalytics({
          config: cfg,
          issues,
          sprintIssues,
          confluencePages,
          bitbucketCommits,
          bitbucketPullRequests,
        })
        setAnalytics(result)
        await saveCache({ analytics: result, savedAt: new Date().toISOString() })
      } catch (e) {
        console.error(e)
        setError(e.message || String(e))
      } finally {
        setLoading(false)
        setProgress({ phase: '', done: 0, total: 0 })
      }
    },
    [config]
  )

  const value = useMemo(
    () => ({
      config,
      analytics,
      loading,
      progress,
      error,
      theme,
      route,
      setRoute,
      setTheme: setThemePersistent,
      updateConfig,
      refresh,
    }),
    [config, analytics, loading, progress, error, theme, route, setThemePersistent, updateConfig, refresh]
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp must be used inside <AppProvider>')
  return v
}
