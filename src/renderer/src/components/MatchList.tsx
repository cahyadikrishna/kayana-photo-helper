import { Check, CircleCheck, CircleX, Copy, TriangleAlert } from 'lucide-react'
import { formatBytes, type PreviewRow, type PreviewStatus } from '../../../shared/preview'

interface MatchListProps {
  rows: PreviewRow[]
  summary: string
  missingIds: string[]
  missingCopied: boolean
  onCopyMissing: () => void
}

const STATUS_STYLE: Record<PreviewStatus, { color: string; label: string }> = {
  missing: { color: 'var(--color-danger)', label: 'Not found' },
  multiple: { color: 'var(--color-warning)', label: 'Multiple matches' },
  found: { color: 'var(--color-success)', label: 'Found' }
}

function StatusIcon({ status }: { status: PreviewStatus }): React.JSX.Element {
  const { color, label } = STATUS_STYLE[status]
  const props = { size: 12, style: { color, flexShrink: 0 }, 'aria-label': label }
  if (status === 'missing') return <CircleX {...props} />
  if (status === 'multiple') return <TriangleAlert {...props} />
  return <CircleCheck {...props} />
}

function MatchRow({ row }: { row: PreviewRow }): React.JSX.Element {
  const isMissing = row.status === 'missing'
  return (
    <li
      className="grid items-center gap-2.5 px-2.5 font-mono text-[11px]"
      style={{
        gridTemplateColumns: '12px minmax(64px, auto) 1fr auto auto',
        minHeight: '26px',
        borderBottom: '1px solid var(--color-border)',
        background:
          row.status === 'found'
            ? 'transparent'
            : `color-mix(in oklab, ${STATUS_STYLE[row.status].color} 6%, transparent)`
      }}
    >
      <StatusIcon status={row.status} />
      <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{row.identifier}</span>
      <span
        className="truncate"
        title={isMissing ? undefined : row.files.join(', ')}
        style={{
          color: isMissing ? 'var(--color-danger)' : 'var(--color-text-muted)',
          fontStyle: isMissing ? 'italic' : 'normal'
        }}
      >
        {isMissing ? 'not found' : row.files.join(', ')}
      </span>
      <span className="flex items-center gap-1.5">
        {row.status === 'multiple' && (
          <span style={{ color: 'var(--color-warning)' }}>{row.shots} shots</span>
        )}
        {row.duplicateCount > 1 && (
          <span
            className="rounded-full px-1.5 text-[9.5px]"
            title="This number appears more than once in the list — it will be copied once"
            style={{
              color: 'var(--color-warning)',
              border: '1px solid color-mix(in oklab, var(--color-warning) 35%, var(--color-border))'
            }}
          >
            ×{row.duplicateCount} in list
          </span>
        )}
      </span>
      <span
        className="text-right tabular-nums"
        style={{ color: 'var(--color-text-soft)', minWidth: '48px' }}
      >
        {isMissing ? '' : formatBytes(row.bytes)}
      </span>
    </li>
  )
}

export function MatchList({
  rows,
  summary,
  missingIds,
  missingCopied,
  onCopyMissing
}: MatchListProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2.5 min-h-[24px]">
        <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-soft)' }}>
          {summary}
        </span>
        {missingIds.length > 0 && (
          <button
            onClick={onCopyMissing}
            title="Copy the not-found numbers to send to the client"
            className="inline-flex items-center gap-1.5 px-2 h-[24px] rounded-md text-[11px] font-medium transition-all duration-[120ms]"
            style={{
              background: 'var(--color-surface)',
              color: missingCopied ? 'var(--color-success)' : 'var(--color-text)',
              border: '1px solid var(--color-border-strong)'
            }}
          >
            {missingCopied ? <Check size={11} /> : <Copy size={11} />}
            {missingCopied ? 'Copied' : 'Copy missing list'}
          </button>
        )}
      </div>
      <ul
        aria-label="Matched files"
        className="m-0 p-0 list-none overflow-y-auto rounded-lg"
        style={{
          maxHeight: '220px',
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)'
        }}
      >
        {rows.map((row) => (
          <MatchRow key={row.identifier} row={row} />
        ))}
      </ul>
    </div>
  )
}
