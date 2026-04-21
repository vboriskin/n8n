import React from 'react'
import { AlertTriangle, AlertOctagon, Info } from 'lucide-react'
import { cn } from '../utils/classNames'

const STYLES = {
  critical: {
    wrapper: 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10',
    title: 'text-rose-900 dark:text-rose-200',
    icon: 'text-rose-600 dark:text-rose-400',
    Icon: AlertOctagon,
  },
  warning: {
    wrapper: 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
    title: 'text-amber-900 dark:text-amber-200',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    wrapper: 'border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10',
    title: 'text-brand-900 dark:text-brand-200',
    icon: 'text-brand-600 dark:text-brand-400',
    Icon: Info,
  },
}

export default function InsightBanner({ insight, className }) {
  const s = STYLES[insight.level] || STYLES.info
  const Icon = s.Icon
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-2xl border p-4 shadow-card animate-fade-in',
        s.wrapper,
        className
      )}
    >
      <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', s.icon)} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={cn('text-sm font-semibold', s.title)}>{insight.message}</p>
          <span className="rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide opacity-70">
            {insight.scope}
          </span>
        </div>
        {insight.reason && (
          <p className="mt-1 text-xs text-ink-700 dark:text-ink-300">{insight.reason}</p>
        )}
        {insight.recommendation && (
          <p className="mt-2 text-xs text-ink-600 dark:text-ink-400">
            <span className="font-medium">Suggestion:</span> {insight.recommendation}
          </p>
        )}
      </div>
    </div>
  )
}
