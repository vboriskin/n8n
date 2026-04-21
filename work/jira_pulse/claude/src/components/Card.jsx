import React from 'react'
import { cn } from '../utils/classNames'

export default function Card({ as: Tag = 'div', className, children, hoverable = false, ...rest }) {
  return (
    <Tag
      className={cn(
        'rounded-2xl border border-ink-200 bg-white shadow-card transition',
        'dark:border-ink-800 dark:bg-ink-900',
        hoverable && 'hover:-translate-y-0.5 hover:shadow-soft hover:border-ink-300 dark:hover:border-ink-700',
        className
      )}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export function CardHeader({ title, subtitle, right, className }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div>
        {title && <h3 className="text-sm font-semibold text-ink-900 dark:text-ink-100">{title}</h3>}
        {subtitle && <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

export function CardBody({ className, children }) {
  return <div className={cn('px-5 pb-5 pt-4', className)}>{children}</div>
}
