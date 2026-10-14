import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import type { WorkoutColor } from '../types'
import { COLOR_STYLES, workoutBadge } from '../utils'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-lime text-ink-950 hover:brightness-110 font-bold',
  secondary: 'bg-ink-800 text-ink-100 hover:bg-ink-700 font-semibold',
  ghost: 'text-ink-300 hover:bg-ink-800 hover:text-ink-100 font-semibold',
  danger: 'bg-red-500/15 text-red-400 hover:bg-red-500/25 font-semibold',
  destructive: 'bg-red-500 text-white hover:bg-red-600 font-bold',
}

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-[15px] transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
      {...props}
    />
  )
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline justify-between text-[13px] font-semibold text-ink-300">
        {label}
        {hint && <span className="font-normal text-ink-400">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

const inputClass =
  'w-full rounded-xl border border-ink-700 bg-ink-850 px-4 text-base text-ink-100 placeholder:text-ink-400 outline-none transition focus:border-lime/70 focus:ring-2 focus:ring-lime/20'

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} h-12 ${props.className ?? ''}`} />
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={`${inputClass} resize-none py-3 ${props.className ?? ''}`} />
}

export function WorkoutBadge({ name, color, size = 'md' }: { name: string; color: WorkoutColor; size?: 'sm' | 'md' | 'lg' }) {
  const sizes = { sm: 'size-8 text-sm rounded-lg', md: 'size-11 text-lg rounded-xl', lg: 'size-14 text-2xl rounded-2xl' }
  return (
    <span className={`grid shrink-0 place-items-center font-black ${sizes[size]} ${COLOR_STYLES[color].solid}`}>
      {workoutBadge(name)}
    </span>
  )
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-3xl border border-dashed border-ink-700 px-6 py-10 text-center">
      <div className="mb-3 grid size-14 place-items-center rounded-2xl bg-ink-800 text-ink-300">{icon}</div>
      <h3 className="font-bold">{title}</h3>
      <p className="mt-1 max-w-xs text-sm text-ink-400">{text}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
