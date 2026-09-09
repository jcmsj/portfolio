import { useRef, useState } from 'react'
import type { InputHTMLAttributes, ReactNode } from 'react'

/** Compact input styling shared by every editor control. */
export const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white/80 px-2.5 py-1.5 text-sm text-slate-800 outline-none focus:ring-2 focus:ring-amber-400'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </span>
      {children}
    </div>
  )
}

type TextInputProps = {
  value: string
  onChange: (value: string) => void
  className?: string
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'className'>

export function TextInput({ value, onChange, className, ...rest }: TextInputProps) {
  return (
    <input
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className ? `${inputCls} ${className}` : inputCls}
    />
  )
}

export function SelectInput({
  value,
  onChange,
  options,
  className,
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={className ? `${inputCls} ${className}` : inputCls}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

/** Native color picker; normalizes to the lowercase `#rrggbb` the schema wants. */
export function ColorInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <input
      type="color"
      value={value.toLowerCase()}
      onChange={(event) => onChange(event.target.value)}
      className="h-[34px] w-full cursor-pointer rounded-lg border border-slate-200 bg-white/80 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
    />
  )
}

/**
 * Number input that keeps its own text buffer so typing negative/intermediate
 * values works, resyncing when the value is changed from outside (steppers,
 * switching selection) or on blur.
 */
export function NumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  className,
}: {
  value: number
  onCommit: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}) {
  const [text, setText] = useState(String(value))
  const lastCommitted = useRef(value)
  if (lastCommitted.current !== value) {
    // Value changed from outside this input — adopt it.
    lastCommitted.current = value
    setText(String(value))
  }

  const commit = (raw: string) => {
    const parsed = Number.parseFloat(raw)
    if (Number.isNaN(parsed)) return
    let next = parsed
    if (min !== undefined) next = Math.max(min, next)
    if (max !== undefined) next = Math.min(max, next)
    lastCommitted.current = next
    onCommit(next)
  }

  return (
    <input
      type="number"
      value={text}
      min={min}
      max={max}
      step={step}
      onChange={(event) => {
        setText(event.target.value)
        commit(event.target.value)
      }}
      onBlur={() => setText(String(value))}
      className={className ? `${inputCls} ${className}` : inputCls}
    />
  )
}
