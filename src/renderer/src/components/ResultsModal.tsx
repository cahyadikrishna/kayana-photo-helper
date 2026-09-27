import { useEffect, useRef } from 'react'
import { AlertCircle, Ban, Check, Copy, FolderOpen, X } from 'lucide-react'
import { resultHeadline, resultOutcome, type ResultOutcome } from '../../../shared/results'
import type { CopyResults } from '../../../shared/types'

interface ResultsModalProps {
  results: CopyResults
  elapsed: number
  destFolder: string
  showLogs: boolean
  missingCopied: boolean
  onToggleLogs: () => void
  onCopyMissing: () => void
  onClose: () => void
  onRestart: () => void
  onDone: () => void
}

const TONE: Record<ResultOutcome, string> = {
  ok: 'var(--color-success)',
  issues: 'var(--color-warning)',
  cancelled: 'var(--color-warning)',
  none: 'var(--color-danger)',
  failed: 'var(--color-danger)'
}

const platform = window.electron?.process?.platform
const REVEAL_LABEL =
  platform === 'darwin'
    ? 'Show in Finder'
    : platform === 'win32'
      ? 'Show in Explorer'
      : 'Open folder'

function OutcomeIcon({ outcome }: { outcome: ResultOutcome }): React.JSX.Element {
  if (outcome === 'ok') return <Check size={16} strokeWidth={2.5} />
  if (outcome === 'cancelled') return <Ban size={16} strokeWidth={2.5} />
  if (outcome === 'none' || outcome === 'failed') return <X size={16} strokeWidth={2.5} />
  return <AlertCircle size={16} strokeWidth={2.5} />
}

function LogGroup({
  title,
  color,
  lines
}: {
  title: string
  color: string
  lines: string[]
}): React.JSX.Element | null {
  if (lines.length === 0) return null
  return (
    <div className="flex flex-col">
      <span className="text-[10px] tracking-[0.06em] uppercase" style={{ color }}>
        {title} ({lines.length})
      </span>
      {lines.map((line, i) => (
        <span key={i} style={{ color: 'var(--color-text-muted)' }}>
          {line}
        </span>
      ))}
    </div>
  )
}

export function ResultsModal({
  results,
  elapsed,
  destFolder,
  showLogs,
  missingCopied,
  onToggleLogs,
  onCopyMissing,
  onClose,
  onRestart,
  onDone
}: ResultsModalProps): React.JSX.Element {
  const outcome = resultOutcome(results)
  const tone = TONE[outcome]
  const doneRef = useRef<HTMLButtonElement>(null)
  useEffect(() => doneRef.current?.focus(), [])

  const summary = results.error
    ? results.error
    : `${results.success.length} copied, ${results.skipped.length} skipped, ` +
      `${results.notFound.length} not found, ${results.failed.length} failed · ${elapsed.toFixed(1)}s`

  const stats = [
    ['COPIED', results.success.length],
    ['SKIPPED', results.skipped.length],
    ['NOT FOUND', results.notFound.length],
    ['FAILED', results.failed.length]
  ] as const

  const hasLogs =
    results.success.length +
      results.skipped.length +
      results.notFound.length +
      results.failed.length >
    0
  const canReveal = !results.error && results.success.length + results.skipped.length > 0

  return (
    <div
      className="absolute inset-0 grid place-items-center z-50"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="results-title"
        className="flex flex-col gap-3"
        style={{
          width: '500px',
          maxHeight: 'calc(100% - 40px)',
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
          className="w-[34px] h-[34px] rounded-full grid place-items-center shrink-0"
          style={{
            background: `color-mix(in oklab, ${tone} 16%, var(--color-surface))`,
            color: tone
          }}
        >
          <OutcomeIcon outcome={outcome} />
        </div>
        <div>
          <h3
            id="results-title"
            className="text-[15px] font-semibold tracking-[-0.01em] m-0"
            style={{ color: 'var(--color-text)' }}
          >
            {resultHeadline(results)}
          </h3>
          <p
            className="text-[11.5px] leading-[1.5] m-0"
            style={{ color: results.error ? 'var(--color-danger)' : 'var(--color-text-muted)' }}
          >
            {summary}
          </p>
        </div>

        {!results.error && (
          <dl
            className="grid grid-cols-4 gap-2 m-0 shrink-0"
            style={{
              padding: '10px 12px',
              background: 'var(--color-surface-inset)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--color-border)'
            }}
          >
            {stats.map(([label, value]) => (
              <div key={label}>
                <dt
                  className="text-[10px] font-mono tracking-[0.06em] m-0"
                  style={{ color: 'var(--color-text-soft)' }}
                >
                  {label}
                </dt>
                <dd
                  className="font-mono text-[12.5px] font-semibold mt-0.5 m-0"
                  style={{ color: 'var(--color-text)' }}
                >
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {hasLogs && (
          <div className="flex flex-col min-h-0">
            <button
              onClick={onToggleLogs}
              aria-expanded={showLogs}
              className="flex items-center gap-1.5 text-[11px] w-fit"
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
                color: 'var(--color-text-soft)',
                fontFamily: 'var(--font-mono)'
              }}
            >
              <span style={{ fontSize: '8px' }}>{showLogs ? '▼' : '▶'}</span>
              {showLogs ? 'Hide details' : 'Show details'}
            </button>
            {showLogs && (
              <div
                className="flex flex-col gap-2 overflow-y-auto font-mono text-[10.5px] leading-[1.6]"
                style={{
                  marginTop: '6px',
                  maxHeight: '200px',
                  background: 'var(--color-surface-inset)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '8px 10px'
                }}
              >
                <LogGroup
                  title="Failed"
                  color="var(--color-danger)"
                  lines={results.failed.map((f) => `${f.input} → ${f.matched} — ${f.error}`)}
                />
                <LogGroup title="Not found" color="var(--color-danger)" lines={results.notFound} />
                <LogGroup
                  title="Skipped"
                  color="var(--color-warning)"
                  lines={results.skipped.map((s) => `${s.input} → ${s.matched} — ${s.reason}`)}
                />
                <LogGroup
                  title="Copied"
                  color="var(--color-success)"
                  lines={results.success.map((s) => `${s.input} → ${s.matched}`)}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 items-center mt-0.5 shrink-0">
          {canReveal && (
            <button
              onClick={() => window.api.openFolder(destFolder)}
              className="inline-flex items-center whitespace-nowrap gap-1.5 px-3 h-[30px] rounded-md text-[11.5px] font-medium"
              style={{
                background: 'transparent',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border)'
              }}
            >
              <FolderOpen size={12} />
              {REVEAL_LABEL}
            </button>
          )}
          {results.notFound.length > 0 && (
            <button
              onClick={onCopyMissing}
              className="inline-flex items-center whitespace-nowrap gap-1.5 px-3 h-[30px] rounded-md text-[11.5px] font-medium"
              style={{
                background: 'transparent',
                color: missingCopied ? 'var(--color-success)' : 'var(--color-text)',
                border: '1px solid var(--color-border)'
              }}
            >
              {missingCopied ? <Check size={12} /> : <Copy size={12} />}
              {missingCopied ? 'Copied' : 'Copy missing list'}
            </button>
          )}
          <span className="flex-1" />
          <button
            onClick={onRestart}
            className="inline-flex items-center whitespace-nowrap px-3.5 h-[30px] rounded-md text-[11.5px] font-medium"
            style={{
              background: 'var(--color-surface-2)',
              color: 'var(--color-text)',
              border: '1px solid var(--color-border-strong)'
            }}
          >
            Restart
          </button>
          <button
            ref={doneRef}
            onClick={onDone}
            className="inline-flex items-center whitespace-nowrap px-3.5 h-[30px] rounded-md text-[11.5px] font-semibold"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-accent-ink)',
              border: 0
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
