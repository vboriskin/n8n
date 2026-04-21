import React from 'react'
import { cn } from '../utils/classNames'

const TONES = {
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/30',
  yellow: 'bg-amber-50   text-amber-800   ring-amber-200   dark:bg-amber-500/10   dark:text-amber-400   dark:ring-amber-500/30',
  red:    'bg-rose-50    text-rose-700    ring-rose-200    dark:bg-rose-500/10    dark:text-rose-400    dark:ring-rose-500/30',
  blue:   'bg-brand-50   text-brand-700   ring-brand-200   dark:bg-brand-500/10   dark:text-brand-400   dark:ring-brand-500/30',
  gray:   'bg-ink-100    text-ink-700     ring-ink-200     dark:bg-ink-800        dark:text-ink-300     dark:ring-ink-700',
}

const PRESETS = {
  YES:     { tone: 'green',  label: 'Active' },
  PARTIAL: { tone: 'yellow', label: 'Partial' },
  NO:      { tone: 'gray',   label: 'Idle' },
  stale:   { tone: 'red',    label: 'Stale' },
  inProgress: { tone: 'blue', label: 'In progress' },
  active:  { tone: 'green',  label: 'Active' },
  done:    { tone: 'green',  label: 'Done' },
}

export default function StatusBadge({
  tone,
  label,
  preset,
  className,
  children,
  pulse = false,
}) {
  const resolved = preset ? PRESETS[preset] : { tone, label }
  const klass = TONES[resolved.tone] || TONES.gray
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset',
        klass,
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-1.5 w-1.5 rounded-full',
          resolved.tone === 'green'  && 'bg-emerald-500',
          resolved.tone === 'yellow' && 'bg-amber-500',
          resolved.tone === 'red'    && 'bg-rose-500',
          resolved.tone === 'blue'   && 'bg-brand-500',
          resolved.tone === 'gray'   && 'bg-ink-400',
          pulse && 'animate-pulse'
        )}
      />
      {children || resolved.label}
    </span>
  )
}
