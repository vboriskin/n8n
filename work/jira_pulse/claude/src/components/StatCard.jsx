import React from 'react'
import Card from './Card'
import { cn } from '../utils/classNames'

export default function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  className,
}) {
  const toneIconBg = {
    neutral: 'bg-ink-100 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
    green:   'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
    yellow:  'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400',
    red:     'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400',
    blue:    'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400',
  }[tone]

  return (
    <Card className={cn('p-5 animate-fade-in', className)} hoverable>
      <div className="flex items-center gap-4">
        {Icon && (
          <div className={cn('flex h-11 w-11 items-center justify-center rounded-xl', toneIconBg)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-ink-500 dark:text-ink-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink-900 dark:text-ink-50">
            {value ?? '—'}
          </p>
          {hint && <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
        </div>
      </div>
    </Card>
  )
}
