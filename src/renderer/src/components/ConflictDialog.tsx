import { useEffect, useRef } from 'react'
import { AlertCircle } from 'lucide-react'

interface ConflictDialogProps {
  existing: string[]
  total: number
  folderName: string
  onSkip: () => void
  onReplace: () => void
  onCancel: () => void
}

const PREVIEW_COUNT = 4

// Asked once before copying when some files are already in the destination.
export function ConflictDialog({
  existing,
  total,
  folderName,
  onSkip,
  onReplace,
  onCancel
}: ConflictDialogProps): React.JSX.Element {
  const skipRef = useRef<HTMLButtonElement>(null)
  useEffect(() => skipRef.current?.focus(), [])

  const shown = existing.slice(0, PREVIEW_COUNT).join(', ')
  const more = existing.length - PREVIEW_COUNT

  return (
    <div
      className="absolute inset-0 grid place-items-center z-50"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="flex flex-col gap-3"
        style={{
          width: '420px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border-strong)',
          borderRadius: '12px',
          boxShadow:
            'var(--shadow-lg, 0 20px 40px -20px rgba(0,0,0,0.7), 0 2px 4px rgba(0,0,0,0.3))',
          padding: '20px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="w-[34px] h-[34px] rounded-full grid place-items-center"
          style={{
            background: 'color-mix(in oklab, var(--color-warning) 16%, var(--color-surface))',
            color: 'var(--color-warning)'
          }}
        >
          <AlertCircle size={16} strokeWidth={2.5} />
        </div>
        <div>
          <h3
            id="conflict-title"
            className="text-[15px] font-semibold tracking-[-0.01em] m-0"
            style={{ color: 'var(--color-text)' }}
          >
            {existing.length} of {total} files already exist in “{folderName}”
          </h3>
          <p
            className="font-mono text-[11px] leading-[1.5] mt-1 m-0 break-all"
            style={{ color: 'var(--color-text-muted)' }}
          >
            {shown}
            {more > 0 && ` … (+${more} more)`}
          </p>
        </div>
        <p className="text-[11.5px] m-0" style={{ color: 'var(--color-text-muted)' }}>
          Skip keeps the files already there. Replace overwrites them with the ones from the source.
        </p>
        <div className="flex gap-2 justify-end mt-0.5">
          <button
            onClick={onCancel}
            className="inline-flex items-center px-3.5 h-[30px] rounded-md text-[11.5px] font-medium mr-auto"
            style={{
              background: 'transparent',
              color: 'var(--color-text-muted)',
              border: '1px solid var(--color-border)'
            }}
          >
            Cancel
          </button>
          <button
            onClick={onReplace}
            className="inline-flex items-center px-3.5 h-[30px] rounded-md text-[11.5px] font-medium"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-strong)'
            }}
          >
            Replace them
          </button>
          <button
            ref={skipRef}
            onClick={onSkip}
            className="inline-flex items-center px-3.5 h-[30px] rounded-md text-[11.5px] font-semibold"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              border: 0
            }}
          >
            Skip existing
          </button>
        </div>
      </div>
    </div>
  )
}
