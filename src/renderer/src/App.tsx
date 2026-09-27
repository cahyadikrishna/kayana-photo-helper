import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
  Folder,
  FolderPlus,
  FolderSearch,
  Play,
  X,
  ClipboardPaste,
  Trash2,
  Sun,
  Moon,
  AlertCircle,
  Check,
  Loader2,
  RefreshCw,
  Ban
} from 'lucide-react'
import { matchIdentifiers, parseIdentifiers, type FormatPreference } from '../../shared/matching'
import { buildPreview, formatBytes, missingListText } from '../../shared/preview'
import { resultOutcome } from '../../shared/results'
import { MatchList } from './components/MatchList'
import { ConflictDialog } from './components/ConflictDialog'
import { ResultsModal } from './components/ResultsModal'
import type { ConflictPolicy, CopyProgress, CopyResults, SourceFile } from '../../shared/types'

type JobStatus = 'idle' | 'running' | 'done' | 'error'

const FORMAT_OPTIONS: { value: FormatPreference; label: string }[] = [
  { value: 'raw', label: 'RAW only' },
  { value: 'jpg', label: 'JPG only' },
  { value: 'both', label: 'Both' }
]

const loadFormatPreference = (): FormatPreference => {
  try {
    const saved = localStorage.getItem('kh_format')
    if (saved === 'raw' || saved === 'jpg' || saved === 'both') return saved
  } catch {
    // storage unavailable — use default
  }
  return 'raw'
}

function App(): React.JSX.Element {
  const [fileNames, setFileNames] = useState('')
  const [sourceFolder, setSourceFolder] = useState('')
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [destFolder, setDestFolder] = useState('')
  const [destMode, setDestMode] = useState<'create' | 'select'>('create')
  const [customFolderName, setCustomFolderName] = useState('')
  const [destCreateError, setDestCreateError] = useState('')
  const [formatPreference, setFormatPreference] = useState<FormatPreference>(loadFormatPreference)
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewNumbers, setPreviewNumbers] = useState<string[]>([])
  const [results, setResults] = useState<CopyResults | null>(null)
  const [destPathError, setDestPathError] = useState('')
  const [clipboardError, setClipboardError] = useState('')
  const [missingCopied, setMissingCopied] = useState(false)
  const [freeSpace, setFreeSpace] = useState<number | null>(null)
  const [duplicateInputs, setDuplicateInputs] = useState<Map<string, number>>(new Map())
  const [job, setJob] = useState<JobStatus>('idle')
  const [progress, setProgress] = useState<CopyProgress | null>(null)
  const [cancelling, setCancelling] = useState(false)
  // Destination of the last job, for "Show in Finder"
  const [lastDest, setLastDest] = useState('')
  // Files already in the destination; set while the Skip / Replace dialog is open
  const [conflict, setConflict] = useState<{ dest: string; existing: string[] } | null>(null)
  // Create-new mode: info about an existing Downloads folder with the same name
  const [existingFolder, setExistingFolder] = useState<{ fileCount: number } | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [showLogs, setShowLogs] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const clipboardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const missingCopiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Incremented on every scan request; responses from older scans are ignored.
  const scanIdRef = useRef(0)

  // Theme
  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const saved = localStorage.getItem('kh_theme') as 'dark' | 'light' | null
    const initial = saved || (mql.matches ? 'dark' : 'light')
    setTheme(initial)
    document.documentElement.dataset.theme = initial
  }, [])

  const toggleTheme = (): void => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('kh_theme', next)
    document.documentElement.dataset.theme = next
  }

  const scale = 1.35

  // Effects
  useEffect(() => {
    const { identifiers, duplicates } = parseIdentifiers(fileNames)
    setPreviewNumbers(identifiers)
    setDuplicateInputs(duplicates)
  }, [fileNames])

  // Scan the source folder once per selection (or on Rescan), not per keystroke.
  const scanSource = useCallback(async (folder: string): Promise<void> => {
    const scanId = ++scanIdRef.current
    if (!folder) {
      setSourceFiles([])
      setIsScanning(false)
      return
    }
    setIsScanning(true)
    try {
      const files = await window.api.getSourceFiles(folder)
      if (scanId === scanIdRef.current) setSourceFiles(files)
    } catch (error) {
      console.error('Error getting source files:', error)
      if (scanId === scanIdRef.current) setSourceFiles([])
    } finally {
      if (scanId === scanIdRef.current) setIsScanning(false)
    }
  }, [])

  useEffect(() => {
    scanSource(sourceFolder)
  }, [sourceFolder, scanSource])

  // What will be copied, per identifier, with real sizes. Null until a source is chosen.
  const preview = useMemo(() => {
    if (!sourceFolder || previewNumbers.length === 0) return null
    const names = sourceFiles.map((f) => f.name)
    const sizes = new Map(sourceFiles.map((f) => [f.name, f.size]))
    return buildPreview(
      matchIdentifiers(names, previewNumbers, formatPreference),
      sizes,
      duplicateInputs
    )
  }, [sourceFolder, sourceFiles, previewNumbers, formatPreference, duplicateInputs])
  const fileCount = preview?.fileCount ?? 0

  // Free space on the destination volume (Downloads in Create-new mode).
  // Re-checked after each job, since a copy uses up space.
  useEffect(() => {
    if (destMode === 'select' && !destFolder) {
      setFreeSpace(null)
      return
    }
    let cancelled = false
    window.api
      .getFreeSpace(destMode === 'create' ? null : destFolder)
      .then((bytes) => !cancelled && setFreeSpace(bytes))
      .catch(() => !cancelled && setFreeSpace(null))
    return () => {
      cancelled = true
    }
  }, [destMode, destFolder, job])

  const notEnoughSpace = !!preview && freeSpace !== null && preview.totalBytes > freeSpace

  const changeFormatPreference = (next: FormatPreference): void => {
    setFormatPreference(next)
    try {
      localStorage.setItem('kh_format', next)
    } catch {
      // storage unavailable — preference just won't persist
    }
  }

  const showClipboardError = (): void => {
    setClipboardError("Couldn't read clipboard — paste with ⌘V / Ctrl+V")
    if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
    clipboardTimerRef.current = setTimeout(() => setClipboardError(''), 4000)
  }

  const copyMissingList = async (missingIds: string[]): Promise<void> => {
    try {
      await window.api.writeClipboard(missingListText(missingIds))
      setMissingCopied(true)
      if (missingCopiedTimerRef.current) clearTimeout(missingCopiedTimerRef.current)
      missingCopiedTimerRef.current = setTimeout(() => setMissingCopied(false), 2000)
    } catch {
      setClipboardError("Couldn't copy to clipboard — try again")
    }
  }

  useEffect(
    () => () => {
      if (clipboardTimerRef.current) clearTimeout(clipboardTimerRef.current)
      if (missingCopiedTimerRef.current) clearTimeout(missingCopiedTimerRef.current)
    },
    []
  )

  const handleSelectFolder = async (type: 'source' | 'destination'): Promise<void> => {
    const folderPath = await window.api.selectFolder(type)
    if (folderPath) {
      if (type === 'source') {
        setSourceFolder(folderPath)
        if (destFolder === folderPath) {
          setDestFolder('')
          setDestPathError('Destination was cleared — it cannot match the source folder.')
        }
      } else {
        if (folderPath === sourceFolder) {
          setDestPathError('Destination cannot be the same as the source folder.')
          return
        }
        setDestPathError('')
        setDestFolder(folderPath)
      }
    }
  }

  const filesToCopy = useMemo(
    () => [...new Set(preview?.rows.flatMap((r) => r.files) ?? [])],
    [preview]
  )

  const runCopy = useCallback(
    async (dest: string, policy: ConflictPolicy): Promise<void> => {
      setConflict(null)
      setIsProcessing(true)
      setResults(null)
      setJob('running')
      setProgress(null)
      setCancelling(false)
      setLastDest(dest)
      const startedAt = Date.now()
      const unsubscribe = window.api.onCopyProgress(setProgress)

      let copyResults: CopyResults
      try {
        copyResults = await window.api.copyFiles(
          sourceFolder,
          dest,
          parseIdentifiers(fileNames).identifiers,
          formatPreference,
          policy
        )
      } catch (error) {
        console.error('Error copying files:', error)
        copyResults = {
          success: [],
          failed: [],
          skipped: [],
          notFound: [],
          error: 'Something went wrong while copying — please try again'
        }
      } finally {
        unsubscribe()
        setIsProcessing(false)
        setProgress(null)
        setCancelling(false)
      }

      setResults(copyResults)
      setJob(copyResults.error ? 'error' : 'done')
      setElapsed((Date.now() - startedAt) / 1000)
      // Open the details straight away when something needs attention
      setShowLogs(!['ok', 'failed'].includes(resultOutcome(copyResults)))
      setShowModal(true)
    },
    [sourceFolder, fileNames, formatPreference]
  )

  // useCallback with full deps so Cmd/Ctrl+Enter always runs with the current form state.
  const handleCopyFiles = useCallback(async (): Promise<void> => {
    if (!sourceFolder || !fileNames.trim()) return

    let dest = ''
    if (destMode === 'create') {
      if (!customFolderName.trim()) return
      const created = await window.api.createDestFolder(customFolderName.trim())
      if (!created.ok) {
        setDestCreateError(created.error)
        return
      }
      setDestCreateError('')
      dest = created.path
    } else {
      if (!destFolder) return
      dest = destFolder
    }

    // Ask once, up front, instead of silently skipping or overwriting
    const existing = await window.api.findExistingFiles(dest, filesToCopy)
    if (existing.length > 0) {
      setConflict({ dest, existing })
      return
    }
    await runCopy(dest, 'skip')
  }, [sourceFolder, fileNames, destMode, customFolderName, destFolder, filesToCopy, runCopy])

  const cancelCopy = (): void => {
    setCancelling(true)
    window.api.cancelCopy()
  }

  // Create-new mode: tell the editor when the folder already exists in Downloads
  useEffect(() => {
    const name = customFolderName.trim()
    if (destMode !== 'create' || !name) {
      setExistingFolder(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      window.api
        .describeDownloadsFolder(name)
        .then((info) => !cancelled && setExistingFolder(info))
        .catch(() => !cancelled && setExistingFolder(null))
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [destMode, customFolderName, job])

  const resetAppState = (): void => {
    setFileNames('')
    setSourceFolder('')
    setDestFolder('')
    setDestMode('create')
    setCustomFolderName('')
    setDestCreateError('')
    setPreviewNumbers([])
    setResults(null)
    setDestPathError('')
    setClipboardError('')
    setDuplicateInputs(new Map())
    setJob('idle')
    setProgress(null)
    setElapsed(0)
    setShowModal(false)
    setShowLogs(false)
    setLastDest('')
  }

  const restartJob = (): void => {
    setJob('idle')
    setResults(null)
    setProgress(null)
    setElapsed(0)
    setShowModal(false)
    setShowLogs(false)
  }

  // Derived state
  const sourceDone = !!sourceFolder
  const destDone = destMode === 'create' ? !!customFolderName.trim() : !!destFolder
  const framesDone = previewNumbers.length > 0 && fileCount > 0
  const isReady =
    sourceDone &&
    destDone &&
    framesDone &&
    !notEnoughSpace &&
    !isScanning &&
    !isProcessing &&
    !conflict &&
    job !== 'running'

  const progressPercent = !progress
    ? 0
    : progress.bytesTotal > 0
      ? (progress.bytesDone / progress.bytesTotal) * 100
      : (progress.done / Math.max(progress.total, 1)) * 100

  const stateLabel =
    job === 'running'
      ? 'Copying'
      : job === 'done'
        ? 'Complete'
        : job === 'error'
          ? 'Error'
          : 'Standby'
  const stateClass =
    job === 'running' ? 'running' : job === 'done' ? 'done' : job === 'error' ? 'error' : 'standby'

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault()
        if (isReady) handleCopyFiles()
      }
      if (e.key === 'Escape') {
        // Closing keeps the results; they can be reopened from the footer
        if (showModal) setShowModal(false)
        else if (conflict) setConflict(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isReady, showModal, conflict, handleCopyFiles])

  // ─── Render helpers ───

  const paddingY = `${Math.round(14 * scale)}px`
  const paddingX = `${Math.round(22 * scale)}px`
  const gap = `${Math.round(8 * scale)}px`

  return (
    <div
      className="w-full h-full overflow-hidden flex flex-col relative"
      style={{
        background: 'var(--color-bg)',
        color: 'var(--color-text)'
      }}
    >
      {/* Titlebar — draggable, leaves space for native traffic lights on macOS */}
      <div
        ref={(el) => {
          if (el) el.style.setProperty('-webkit-app-region', 'drag')
        }}
        className="h-8 flex items-center justify-center select-none shrink-0 relative"
        style={{
          background: 'var(--color-surface-2)',
          borderBottom: '1px solid var(--color-border)'
        }}
      >
        <div
          className="flex items-center justify-center gap-1.5 text-[11px]"
          style={{ color: 'var(--color-text-muted)', fontWeight: 500 }}
        >
          <span className="w-1 h-1 rounded-full" style={{ background: 'var(--color-accent)' }} />
          Kayana Photo Helper
        </div>
      </div>

      {/* Form Body */}
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: `${Math.round(16 * scale)}px ${paddingX} ${Math.round(18 * scale)}px` }}
      >
        {/* Section 1: Source */}
        <div
          className="grid animate-fadeUp"
          style={{
            gridTemplateColumns: '180px minmax(0, 1fr)',
            gap: `${Math.round(18 * scale)}px`,
            padding: `${paddingY} 0`,
            borderBottom: '1px solid var(--color-border)',
            animationDelay: '20ms'
          }}
        >
          <div className="flex flex-col gap-1 pt-0.5">
            <span
              className="font-mono text-[10px] tracking-[0.08em]"
              style={{ color: 'var(--color-text-soft)' }}
            >
              01
            </span>
            <div
              className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.005em]"
              style={{ color: 'var(--color-text)' }}
            >
              Source
              <span
                className="w-3.5 h-3.5 rounded-full inline-grid place-items-center transition-opacity duration-[160ms]"
                style={{
                  background: 'var(--color-success)',
                  color: '#04180f',
                  opacity: sourceDone ? 1 : 0
                }}
              >
                <Check size={8} strokeWidth={3} />
              </span>
            </div>
            <span
              className="text-[11.5px] leading-[1.45]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Root directory for photo extraction.
              <span
                className="font-mono text-[10px] tracking-[0.06em] ml-1.5"
                style={{ color: 'var(--color-accent)' }}
              >
                REQUIRED
              </span>
            </span>
          </div>
          <div className="flex flex-col" style={{ gap }}>
            <div
              className="flex items-center rounded-lg min-h-[36px]"
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${sourceDone ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                padding: '6px 8px 6px 6px',
                gap: '8px'
              }}
            >
              <button
                onClick={() => handleSelectFolder('source')}
                className="inline-flex items-center gap-1.5 px-2.5 h-[26px] rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all duration-[120ms]"
                style={{
                  background: sourceDone ? 'var(--color-surface-2)' : 'var(--color-accent)',
                  color: sourceDone ? 'var(--color-text)' : 'var(--color-accent-ink)',
                  border: '1px solid var(--color-border-strong)',
                  fontWeight: sourceDone ? 500 : 600
                }}
              >
                <FolderSearch size={12} />
                {sourceDone ? 'Change' : 'Choose folder'}
              </button>
              <div
                className="flex-1 font-mono text-[11.5px] truncate px-0.5"
                style={{
                  color: sourceFolder ? 'var(--color-text-muted)' : 'var(--color-text-soft)',
                  fontStyle: sourceFolder ? 'normal' : 'italic',
                  direction: sourceFolder ? 'rtl' : 'ltr',
                  textAlign: 'left'
                }}
              >
                {sourceFolder || 'No folder selected'}
              </div>
              {sourceFolder && (
                <button
                  onClick={() => scanSource(sourceFolder)}
                  disabled={isScanning}
                  aria-label="Rescan source folder"
                  title="Rescan source folder"
                  className="inline-flex items-center justify-center h-[26px] px-2 rounded-md text-[11.5px] transition-all duration-[120ms]"
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: 'var(--color-text-muted)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text)'
                    e.currentTarget.style.background = 'var(--color-surface-2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <RefreshCw size={12} className={isScanning ? 'animate-spin' : undefined} />
                </button>
              )}
              {sourceFolder && (
                <button
                  onClick={() => setSourceFolder('')}
                  aria-label="Clear source folder"
                  title="Clear source folder"
                  className="inline-flex items-center justify-center h-[26px] px-2 rounded-md text-[11.5px] transition-all duration-[120ms]"
                  style={{
                    background: 'transparent',
                    border: '1px solid transparent',
                    color: 'var(--color-text-muted)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.color = 'var(--color-text)'
                    e.currentTarget.style.background = 'var(--color-surface-2)'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.color = 'var(--color-text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section 2: Destination */}
        <div
          className="grid animate-fadeUp"
          style={{
            gridTemplateColumns: '180px minmax(0, 1fr)',
            gap: `${Math.round(18 * scale)}px`,
            padding: `${paddingY} 0`,
            borderBottom: '1px solid var(--color-border)',
            animationDelay: '60ms'
          }}
        >
          <div className="flex flex-col gap-1 pt-0.5">
            <span
              className="font-mono text-[10px] tracking-[0.08em]"
              style={{ color: 'var(--color-text-soft)' }}
            >
              02
            </span>
            <div
              className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.005em]"
              style={{ color: 'var(--color-text)' }}
            >
              Destination
              <span
                className="w-3.5 h-3.5 rounded-full inline-grid place-items-center transition-opacity duration-[160ms]"
                style={{
                  background: 'var(--color-success)',
                  color: '#04180f',
                  opacity: destDone ? 1 : 0
                }}
              >
                <Check size={8} strokeWidth={3} />
              </span>
            </div>
            <span
              className="text-[11.5px] leading-[1.45]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Where the curated photos reside.
              <span
                className="font-mono text-[10px] tracking-[0.06em] ml-1.5"
                style={{ color: 'var(--color-accent)' }}
              >
                REQUIRED
              </span>
            </span>
          </div>
          <div className="flex flex-col" style={{ gap }}>
            {/* Segmented toggle */}
            <div
              className="grid grid-cols-2 rounded-lg p-[3px]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)'
              }}
            >
              <button
                onClick={() => setDestMode('create')}
                className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[11.5px] font-medium transition-all duration-[120ms]"
                style={{
                  background: destMode === 'create' ? 'var(--color-surface-inset)' : 'transparent',
                  color: destMode === 'create' ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow:
                    destMode === 'create' ? '0 0 0 1px var(--color-border-strong)' : 'none',
                  border: 0,
                  fontFamily: 'inherit'
                }}
              >
                <FolderPlus
                  size={13}
                  style={{ color: destMode === 'create' ? 'var(--color-accent)' : 'inherit' }}
                />
                Create new
              </button>
              <button
                onClick={() => setDestMode('select')}
                className="flex items-center gap-2 rounded-md px-2.5 py-[7px] text-[11.5px] font-medium transition-all duration-[120ms]"
                style={{
                  background: destMode === 'select' ? 'var(--color-surface-inset)' : 'transparent',
                  color: destMode === 'select' ? 'var(--color-text)' : 'var(--color-text-muted)',
                  boxShadow:
                    destMode === 'select' ? '0 0 0 1px var(--color-border-strong)' : 'none',
                  border: 0,
                  fontFamily: 'inherit'
                }}
              >
                <Folder
                  size={13}
                  style={{ color: destMode === 'select' ? 'var(--color-accent)' : 'inherit' }}
                />
                Existing path
              </button>
            </div>

            {destMode === 'create' ? (
              <div className="flex flex-col gap-1.5">
                <div
                  className="flex items-center rounded-lg min-h-[36px]"
                  style={{
                    background: 'var(--color-surface)',
                    border: `1px solid ${customFolderName.trim() ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                    padding: '6px 8px 6px 6px',
                    gap: '8px'
                  }}
                >
                  <div
                    className="flex-1 font-mono text-[11.5px] truncate px-0.5"
                    style={{ color: 'var(--color-text-soft)', direction: 'rtl', textAlign: 'left' }}
                  >
                    ~/Downloads/{customFolderName || 'folder-name'}
                  </div>
                </div>
                <input
                  type="text"
                  value={customFolderName}
                  onChange={(e) => {
                    setCustomFolderName(e.target.value)
                    setDestCreateError('')
                  }}
                  placeholder="Enter folder name..."
                  className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontFamily: 'inherit'
                  }}
                />
                {existingFolder && !destCreateError && (
                  <div
                    className="flex items-center gap-2 px-0.5 text-[11px]"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <Folder size={12} />
                    <span>
                      Folder already exists in Downloads
                      {existingFolder.fileCount > 0 &&
                        ` (${existingFolder.fileCount} file${existingFolder.fileCount !== 1 ? 's' : ''})`}{' '}
                      — photos will be added to it.
                    </span>
                  </div>
                )}
                {destCreateError && (
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                    style={{
                      background:
                        'color-mix(in oklab, var(--color-danger) 10%, var(--color-surface))',
                      border:
                        '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--color-border))',
                      color: 'var(--color-danger)'
                    }}
                  >
                    <AlertCircle size={12} />
                    <span>{destCreateError}</span>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div
                  className="flex items-center rounded-lg min-h-[36px]"
                  style={{
                    background: 'var(--color-surface)',
                    border: `1px solid ${destFolder ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                    padding: '6px 8px 6px 6px',
                    gap: '8px'
                  }}
                >
                  <button
                    onClick={() => handleSelectFolder('destination')}
                    className="inline-flex items-center gap-1.5 px-2.5 h-[26px] rounded-md text-[11.5px] font-medium whitespace-nowrap transition-all duration-[120ms]"
                    style={{
                      background: destFolder ? 'var(--color-surface-2)' : 'var(--color-accent)',
                      color: destFolder ? 'var(--color-text)' : 'var(--color-accent-ink)',
                      border: '1px solid var(--color-border-strong)',
                      fontWeight: destFolder ? 500 : 600
                    }}
                  >
                    <FolderSearch size={12} />
                    {destFolder ? 'Change' : 'Choose folder'}
                  </button>
                  <div
                    className="flex-1 font-mono text-[11.5px] truncate px-0.5"
                    style={{
                      color: destFolder ? 'var(--color-text-muted)' : 'var(--color-text-soft)',
                      fontStyle: destFolder ? 'normal' : 'italic',
                      direction: destFolder ? 'rtl' : 'ltr',
                      textAlign: 'left'
                    }}
                  >
                    {destFolder || 'No folder selected'}
                  </div>
                  {destFolder && (
                    <button
                      onClick={() => setDestFolder('')}
                      aria-label="Clear destination folder"
                      title="Clear destination folder"
                      className="inline-flex items-center justify-center h-[26px] px-2 rounded-md text-[11.5px] transition-all duration-[120ms]"
                      style={{
                        background: 'transparent',
                        border: '1px solid transparent',
                        color: 'var(--color-text-muted)'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = 'var(--color-text)'
                        e.currentTarget.style.background = 'var(--color-surface-2)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = 'var(--color-text-muted)'
                        e.currentTarget.style.background = 'transparent'
                      }}
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                {destPathError && (
                  <div
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                    style={{
                      background:
                        'color-mix(in oklab, var(--color-danger) 10%, var(--color-surface))',
                      border:
                        '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--color-border))',
                      color: 'var(--color-danger)'
                    }}
                  >
                    <AlertCircle size={12} />
                    <span>{destPathError}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Section 3: Photo Numbers */}
        <div
          className="grid animate-fadeUp"
          style={{
            gridTemplateColumns: '180px minmax(0, 1fr)',
            gap: `${Math.round(18 * scale)}px`,
            padding: `${paddingY} 0`,
            borderBottom: '1px solid var(--color-border)',
            animationDelay: '100ms'
          }}
        >
          <div className="flex flex-col gap-1 pt-0.5">
            <span
              className="font-mono text-[10px] tracking-[0.08em]"
              style={{ color: 'var(--color-text-soft)' }}
            >
              03
            </span>
            <div
              className="flex items-center gap-2 text-[13.5px] font-semibold tracking-[-0.005em]"
              style={{ color: 'var(--color-text)' }}
            >
              Photo Numbers
              <span
                className="w-3.5 h-3.5 rounded-full inline-grid place-items-center transition-opacity duration-[160ms]"
                style={{
                  background: 'var(--color-success)',
                  color: '#04180f',
                  opacity: framesDone ? 1 : 0
                }}
              >
                <Check size={8} strokeWidth={3} />
              </span>
            </div>
            <span
              className="text-[11.5px] leading-[1.45]"
              style={{ color: 'var(--color-text-muted)' }}
            >
              Identifiers like{' '}
              <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>
                KYN3185, DSC_0012, 3185
              </span>
              .
              <span
                className="font-mono text-[10px] tracking-[0.06em] ml-1.5"
                style={{ color: 'var(--color-accent)' }}
              >
                REQUIRED
              </span>
            </span>
          </div>
          <div className="flex flex-col" style={{ gap }}>
            {/* Format preference: which file(s) to copy when a shot has RAW + JPG */}
            <div
              role="radiogroup"
              aria-label="Formats to copy"
              className="grid grid-cols-3 rounded-lg p-[3px]"
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)'
              }}
            >
              {FORMAT_OPTIONS.map((option) => {
                const active = formatPreference === option.value
                return (
                  <button
                    key={option.value}
                    role="radio"
                    aria-checked={active}
                    onClick={() => changeFormatPreference(option.value)}
                    className="flex items-center justify-center rounded-md px-2.5 py-[7px] text-[11.5px] font-medium transition-all duration-[120ms]"
                    style={{
                      background: active ? 'var(--color-surface-inset)' : 'transparent',
                      color: active ? 'var(--color-text)' : 'var(--color-text-muted)',
                      boxShadow: active ? '0 0 0 1px var(--color-border-strong)' : 'none',
                      border: 0,
                      fontFamily: 'inherit'
                    }}
                  >
                    {option.label}
                  </button>
                )
              })}
            </div>

            <div
              className="relative flex rounded-lg"
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${fileNames.trim() ? 'var(--color-border-strong)' : 'var(--color-border)'}`,
                padding: '8px 10px',
                minHeight: `${Math.round(74 * scale)}px`
              }}
            >
              <textarea
                ref={textareaRef}
                value={fileNames}
                onChange={(e) => setFileNames(e.target.value)}
                placeholder="Paste numbers — commas, spaces or newlines all work."
                className="flex-1 bg-transparent border-0 outline-none resize-none font-mono text-[11.5px] leading-[1.55]"
                style={{
                  color: 'var(--color-text)',
                  paddingRight: '34px'
                }}
              />
              <div className="absolute right-1.5 bottom-1.5 flex gap-1">
                {fileNames && (
                  <button
                    onClick={() => setFileNames('')}
                    className="w-[22px] h-[22px] rounded-md grid place-items-center cursor-pointer"
                    style={{
                      background: 'var(--color-surface-inset)',
                      border: '1px solid var(--color-border)',
                      color: 'var(--color-text-muted)'
                    }}
                    title="Clear list"
                    aria-label="Clear photo numbers"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      const text = await window.api.readClipboard()
                      setClipboardError('')
                      setFileNames((prev) => (prev + (prev ? '\n' : '') + text).trim())
                    } catch {
                      // Never touch the input on failure — just tell the editor.
                      showClipboardError()
                    }
                  }}
                  aria-label="Paste from clipboard"
                  className="w-[22px] h-[22px] rounded-md grid place-items-center cursor-pointer"
                  style={{
                    background: 'var(--color-surface-inset)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text-muted)'
                  }}
                  title="Paste"
                >
                  <ClipboardPaste size={11} />
                </button>
              </div>
            </div>

            {clipboardError && (
              <div
                role="alert"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                style={{
                  background: 'color-mix(in oklab, var(--color-danger) 10%, var(--color-surface))',
                  border:
                    '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--color-border))',
                  color: 'var(--color-danger)'
                }}
              >
                <AlertCircle size={12} />
                <span>{clipboardError}</span>
              </div>
            )}

            {notEnoughSpace && preview && freeSpace !== null && (
              <div
                role="alert"
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                style={{
                  background: 'color-mix(in oklab, var(--color-danger) 10%, var(--color-surface))',
                  border:
                    '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--color-border))',
                  color: 'var(--color-danger)'
                }}
              >
                <AlertCircle size={12} />
                <span>
                  Not enough space on destination: needs {formatBytes(preview.totalBytes)},{' '}
                  {formatBytes(freeSpace)} free
                </span>
              </div>
            )}

            {/* Match list: one row per identifier, problems first */}
            {preview ? (
              <MatchList
                rows={preview.rows}
                summary={[
                  `${preview.total} number${preview.total !== 1 ? 's' : ''}`,
                  `${preview.found} found`,
                  preview.missing > 0 ? `${preview.missing} not found` : '',
                  preview.multiple > 0 ? `${preview.multiple} multiple` : ''
                ]
                  .filter(Boolean)
                  .join(' · ')}
                missingIds={preview.missingIds}
                missingCopied={missingCopied}
                onCopyMissing={() => copyMissingList(preview.missingIds)}
              />
            ) : (
              <div className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-soft)' }}>
                {previewNumbers.length === 0
                  ? 'Awaiting input'
                  : `${previewNumbers.length} number${previewNumbers.length !== 1 ? 's' : ''} · choose a source folder to see matches`}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        className="shrink-0 grid items-center"
        style={{
          gridTemplateColumns: 'auto 1fr auto auto',
          gap: '14px',
          padding: '0 14px',
          height: '44px',
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface-2)',
          fontSize: '11.5px'
        }}
      >
        <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)' }}>
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              background:
                stateClass === 'standby'
                  ? 'var(--color-success)'
                  : stateClass === 'running'
                    ? 'var(--color-warning)'
                    : stateClass === 'done'
                      ? 'var(--color-accent)'
                      : 'var(--color-danger)',
              animation: stateClass === 'running' ? 'pulse-dot 1.1s infinite' : 'none'
            }}
          />
          <b
            style={{
              color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '12.5px'
            }}
          >
            {stateLabel}
          </b>
          {results && !showModal && job !== 'running' && (
            <button
              onClick={() => setShowModal(true)}
              className="ml-1 px-2 h-[22px] rounded-md text-[11px] font-medium"
              style={{
                background: 'var(--color-surface)',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border-strong)'
              }}
            >
              View results
            </button>
          )}
        </div>

        <div className="flex gap-4 overflow-hidden" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            Identifiers{' '}
            <b
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px'
              }}
            >
              {previewNumbers.length || 0}
            </b>
          </span>
          <span className="flex items-center gap-1.5">
            Matched{' '}
            <b
              style={{
                color: 'var(--color-text)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12.5px'
              }}
            >
              {fileCount}
            </b>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={toggleTheme}
            className="w-[26px] h-[26px] grid place-items-center rounded-md cursor-pointer transition-all duration-[120ms]"
            style={{
              background: 'transparent',
              border: '1px solid transparent',
              color: 'var(--color-text-muted)'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--color-text)'
              e.currentTarget.style.background = 'var(--color-surface)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--color-text-muted)'
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
            }}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
          </button>
          <span className="font-mono text-[10.5px]" style={{ color: 'var(--color-text-soft)' }}>
            v{__APP_VERSION__}
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {job === 'running' && (
            <button
              onClick={cancelCopy}
              disabled={cancelling}
              className="inline-flex items-center gap-1.5 px-3 h-[30px] rounded-md text-[11.5px] font-medium"
              style={{
                background: 'transparent',
                color: 'var(--color-text)',
                border: '1px solid var(--color-border-strong)',
                opacity: cancelling ? 0.6 : 1
              }}
            >
              <Ban size={12} />
              {cancelling ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          <button
            onClick={handleCopyFiles}
            disabled={!isReady}
            title={notEnoughSpace ? 'Not enough space on the destination' : undefined}
            className="relative inline-flex items-center gap-2 overflow-hidden transition-all duration-[120ms]"
            style={{
              height: '30px',
              padding: '0 16px',
              borderRadius: 'var(--radius-md)',
              background: job === 'running' ? 'var(--color-surface-inset)' : 'var(--color-accent)',
              color: job === 'running' ? 'var(--color-text)' : 'var(--color-accent-ink)',
              border: job === 'running' ? '1px solid var(--color-border-strong)' : '0',
              fontWeight: 600,
              fontSize: '12.5px',
              fontFamily: 'inherit',
              cursor: isReady ? 'pointer' : 'not-allowed',
              opacity: isReady || job === 'running' ? 1 : 0.45
            }}
          >
            {job === 'running' && (
              <span
                className="absolute inset-y-0 left-0 pointer-events-none"
                style={{
                  background: 'var(--color-accent-soft)',
                  borderRadius: 'var(--radius-md)',
                  width: `${progressPercent}%`,
                  transition: 'width 200ms linear'
                }}
              />
            )}
            <span className="relative z-[2] inline-flex items-center gap-2">
              {job === 'running' ? (
                <>
                  <Loader2 size={12} className="animate-spin-slow" />
                  {progress ? (
                    <span className="font-mono">
                      {progress.done} / {progress.total} · {formatBytes(progress.bytesDone)} of{' '}
                      {formatBytes(progress.bytesTotal)}
                    </span>
                  ) : (
                    'Starting…'
                  )}
                </>
              ) : (
                <>
                  <Play size={12} fill="currentColor" />
                  {preview && fileCount > 0
                    ? `Copy ${fileCount} file${fileCount !== 1 ? 's' : ''} · ${formatBytes(preview.totalBytes)}`
                    : 'Start copy'}
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {conflict && (
        <ConflictDialog
          existing={conflict.existing}
          total={filesToCopy.length}
          folderName={conflict.dest.split(/[\\/]/).pop() || conflict.dest}
          onSkip={() => runCopy(conflict.dest, 'skip')}
          onReplace={() => runCopy(conflict.dest, 'replace')}
          onCancel={() => setConflict(null)}
        />
      )}

      {showModal && results && (
        <ResultsModal
          results={results}
          elapsed={elapsed}
          destFolder={lastDest}
          showLogs={showLogs}
          missingCopied={missingCopied}
          onToggleLogs={() => setShowLogs((v) => !v)}
          onCopyMissing={() => copyMissingList(results.notFound)}
          onClose={() => setShowModal(false)}
          onRestart={restartJob}
          onDone={resetAppState}
        />
      )}
    </div>
  )
}

export default App
