import { useState, useEffect, useCallback, useRef } from 'react'
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
  Loader2
} from 'lucide-react'

interface CopyResults {
  success: { input: string; matched: string }[]
  failed: { input: string; matched: string; error: string }[]
  notFound: string[]
}

type JobStatus = 'idle' | 'running' | 'done' | 'error'

function App(): React.JSX.Element {
  const [fileNames, setFileNames] = useState('')
  const [sourceFolder, setSourceFolder] = useState('')
  const [destFolder, setDestFolder] = useState('')
  const [destMode, setDestMode] = useState<'create' | 'select'>('create')
  const [customFolderName, setCustomFolderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewNumbers, setPreviewNumbers] = useState<string[]>([])
  const [matchedFiles, setMatchedFiles] = useState<string[]>([])
  const [matchResults, setMatchResults] = useState<{ identifier: string; matchedFiles: string[] }[]>([])
  const [results, setResults] = useState<CopyResults | null>(null)
  const [destPathError, setDestPathError] = useState('')
  const [duplicateInputs, setDuplicateInputs] = useState<Map<string, number>>(new Map())
  const [job, setJob] = useState<JobStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [showModal, setShowModal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

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

  // Parser (kept exactly as before)
  const parsePhotoFilesFromInput = useCallback(
    (input: string): { identifiers: string[]; duplicates: Map<string, number> } => {
      const lines = input.split('\n')
      const counts = new Map<string, number>()

      for (const line of lines) {
        let cleanLine = line.trim()
        if (!cleanLine) continue
        cleanLine = cleanLine.replace(/^\d+\.\s*/, '')
        cleanLine = cleanLine.replace(/^[-•*]\s*/, '')
        cleanLine = cleanLine.trim()
        if (!cleanLine) continue

        const matches = cleanLine.match(/[A-Za-z]{2,6}[-_]?\d+|\d+/g)
        if (matches) {
          for (const m of matches) {
            const key = m.toUpperCase().replace(/([A-Z]{2,6})[-_](\d)/g, '$1$2')
            counts.set(key, (counts.get(key) || 0) + 1)
          }
        } else {
          const key = cleanLine.toUpperCase()
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      }

      const identifiers: string[] = []
      const duplicates = new Map<string, number>()
      for (const [key, count] of counts) {
        identifiers.push(key)
        if (count > 1) duplicates.set(key, count)
      }
      return { identifiers, duplicates }
    },
    []
  )

  // Effects
  useEffect(() => {
    const { identifiers, duplicates } = parsePhotoFilesFromInput(fileNames)
    setPreviewNumbers(identifiers)
    setDuplicateInputs(duplicates)
  }, [fileNames, parsePhotoFilesFromInput])

  useEffect(() => {
    const updateMatchedFiles = async (): Promise<void> => {
      if (sourceFolder && previewNumbers.length > 0) {
        try {
          const sourceFiles = await window.api.getSourceFiles(sourceFolder)

          const rawExtensions = [
            '.arw',
            '.cr2',
            '.nef',
            '.dng',
            '.orf',
            '.pef',
            '.rw2',
            '.raw',
            '.raf'
          ]
          const jpegExtensions = ['.jpg', '.jpeg']
          const otherExtensions = ['.png', '.tiff', '.tif']

          const getBaseName = (filename: string): string =>
            filename.substring(0, filename.lastIndexOf('.'))

          const isRawFile = (filename: string): boolean => {
            const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
            return rawExtensions.includes(ext)
          }

          const prioritizeRawFiles = (matchingFiles: string[]): string[] => {
            const grouped = new Map<string, string[]>()
            for (const file of matchingFiles) {
              const baseName = getBaseName(file)
              if (!grouped.has(baseName)) grouped.set(baseName, [])
              grouped.get(baseName)!.push(file)
            }

            const prioritizedFiles: string[] = []
            for (const [, files] of grouped) {
              const rawFiles = files.filter(isRawFile)
              const jpegFiles = files.filter((file) => {
                const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
                return jpegExtensions.includes(ext)
              })
              const otherFiles = files.filter((file) => {
                const ext = file.toLowerCase().substring(file.lastIndexOf('.'))
                return otherExtensions.includes(ext)
              })

              if (rawFiles.length > 0) {
                prioritizedFiles.push(...rawFiles)
              } else if (otherFiles.length > 0) {
                prioritizedFiles.push(...otherFiles)
              } else {
                prioritizedFiles.push(...jpegFiles)
              }
            }
            return prioritizedFiles
          }

          const normalize = (s: string): string => s.toUpperCase().replace(/[-_]/g, '')

          const matched: string[] = []
          const results: { identifier: string; matchedFiles: string[] }[] = []
          for (const identifier of previewNumbers) {
            const isPureNumber = /^\d+$/.test(identifier)

            const matchingFiles = sourceFiles.filter((file) => {
              if (isPureNumber) {
                const inputNum = parseInt(identifier, 10)
                const baseName = file.substring(0, file.lastIndexOf('.'))
                const trailingMatch = baseName.match(/(\d+)$/)
                return trailingMatch ? parseInt(trailingMatch[1], 10) === inputNum : false
              } else {
                const normIdent = normalize(identifier)
                const fileBase = normalize(file.substring(0, file.lastIndexOf('.')))
                return fileBase === normIdent
              }
            })

            const prioritized = prioritizeRawFiles(matchingFiles)
            const rawOnly = prioritized.filter(isRawFile)
            const finalFiles = rawOnly.length > 0 ? rawOnly : prioritized
            matched.push(...finalFiles)
            results.push({ identifier, matchedFiles: finalFiles })
          }

          setMatchedFiles([...new Set(matched)])
          setMatchResults(results)
        } catch (error) {
          console.error('Error getting source files:', error)
        }
      } else {
        setMatchedFiles([])
        setMatchResults([])
      }
    }

    updateMatchedFiles()
  }, [sourceFolder, previewNumbers])

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

  const handleCopyFiles = async (): Promise<void> => {
    if (!sourceFolder || !fileNames.trim()) return

    let finalDestFolder = ''
    if (destMode === 'create') {
      if (!customFolderName.trim()) return
      try {
        finalDestFolder = await window.api.createDestFolder(customFolderName.trim())
      } catch {
        return
      }
    } else {
      if (!destFolder) return
      finalDestFolder = destFolder
    }

    setIsProcessing(true)
    setResults(null)
    setJob('running')
    setProgress(0)
    const startedAt = Date.now()

    const { identifiers } = parsePhotoFilesFromInput(fileNames)

    // Simulate progress while actual copy happens
    copyTimerRef.current = setInterval(() => {
      setProgress((p) => Math.min(95, p + Math.random() * 7 + 3))
    }, 180)

    try {
      const copyResults = await window.api.copyFiles(sourceFolder, finalDestFolder, identifiers)
      if (copyTimerRef.current) clearInterval(copyTimerRef.current)
      setProgress(100)
      setResults(copyResults)
      setJob('done')
      setElapsed((Date.now() - startedAt) / 1000)
      setShowModal(true)
    } catch (error) {
      if (copyTimerRef.current) clearInterval(copyTimerRef.current)
      console.error('Error copying files:', error)
      setJob('error')
    } finally {
      setIsProcessing(false)
      setProgress(0)
    }
  }

  const resetAppState = (): void => {
    setFileNames('')
    setSourceFolder('')
    setDestFolder('')
    setDestMode('create')
    setCustomFolderName('')
    setPreviewNumbers([])
    setMatchedFiles([])
    setMatchResults([])
    setResults(null)
    setDestPathError('')
    setDuplicateInputs(new Map())
    setJob('idle')
    setProgress(0)
    setElapsed(0)
    setShowModal(false)
  }

  const restartJob = (): void => {
    setJob('idle')
    setProgress(0)
    setElapsed(0)
    setShowModal(false)
  }

  // Derived state
  const sourceDone = !!sourceFolder
  const destDone = destMode === 'create' ? !!customFolderName.trim() : !!destFolder
  const framesDone = previewNumbers.length > 0 && matchedFiles.length > 0
  const isReady = sourceDone && destDone && framesDone && !isProcessing && job !== 'running'

  const unmatchedIds = matchResults.filter((r) => r.matchedFiles.length === 0).map((r) => r.identifier)
  const overMatchedResults = matchResults.filter((r) => r.matchedFiles.length > 1)

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
      if (e.key === 'Escape' && showModal) {
        setShowModal(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isReady, showModal])

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
            gridTemplateColumns: '180px 1fr',
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
                  onClick={() => setSourceFolder('')}
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
            gridTemplateColumns: '180px 1fr',
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
                  onChange={(e) => setCustomFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full rounded-lg px-3 py-2 text-[12.5px] outline-none"
                  style={{
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    color: 'var(--color-text)',
                    fontFamily: 'inherit'
                  }}
                />
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
            gridTemplateColumns: '180px 1fr',
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
                    title="Clear"
                  >
                    <Trash2 size={11} />
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      const text = await navigator.clipboard.readText()
                      setFileNames((prev) => (prev + (prev ? '\n' : '') + text).trim())
                    } catch {
                      setFileNames('KYN3185, 3190, 3555, 5504')
                    }
                  }}
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

            {/* Duplicate warning */}
            {duplicateInputs.size > 0 && (
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                style={{
                  background: 'color-mix(in oklab, var(--color-warning) 10%, var(--color-surface))',
                  border:
                    '1px solid color-mix(in oklab, var(--color-warning) 30%, var(--color-border))',
                  color: 'var(--color-warning)'
                }}
              >
                <AlertCircle size={12} />
                <span>
                  Duplicates:{' '}
                  <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                    {Array.from(duplicateInputs.entries())
                      .map(([k, v]) => `${k} (${v}×)`)
                      .join(', ')}
                  </span>
                </span>
              </div>
            )}

            {/* Unmatched identifiers */}
            {unmatchedIds.length > 0 && (
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                style={{
                  background: 'color-mix(in oklab, var(--color-danger) 10%, var(--color-surface))',
                  border: '1px solid color-mix(in oklab, var(--color-danger) 30%, var(--color-border))',
                  color: 'var(--color-danger)'
                }}
              >
                <AlertCircle size={12} />
                <span>
                  Not found:{' '}
                  <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                    {unmatchedIds.join(', ')}
                  </span>
                </span>
              </div>
            )}

            {/* Over-matched identifiers */}
            {overMatchedResults.length > 0 && (
              <div
                className="flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[11px]"
                style={{
                  background: 'color-mix(in oklab, var(--color-warning) 10%, var(--color-surface))',
                  border: '1px solid color-mix(in oklab, var(--color-warning) 30%, var(--color-border))',
                  color: 'var(--color-warning)'
                }}
              >
                <AlertCircle size={12} style={{ marginTop: '1px', flexShrink: 0 }} />
                <span>
                  Multiple matches:{' '}
                  {overMatchedResults.map((r, i) => (
                    <span key={r.identifier}>
                      {i > 0 && ', '}
                      <span className="font-mono" style={{ color: 'var(--color-text)' }}>
                        {r.identifier}
                      </span>
                      {' '}
                      <span style={{ color: 'var(--color-warning)' }}>({r.matchedFiles.length} files)</span>
                    </span>
                  ))}
                </span>
              </div>
            )}

            {/* Hint line */}
            <div
              className="flex justify-between gap-2.5 font-mono text-[10.5px]"
              style={{ color: 'var(--color-text-soft)' }}
            >
              <span>
                {previewNumbers.length
                  ? `${previewNumbers.length} identifier${previewNumbers.length > 1 ? 's' : ''} · ${matchedFiles.length} file${matchedFiles.length !== 1 ? 's' : ''} matched`
                  : 'Awaiting input'}
              </span>
              <span>
                {matchedFiles.length > 0 ? `≈ ${(matchedFiles.length * 8.2).toFixed(0)} MB` : ''}
              </span>
            </div>

            {/* Chips with per-identifier match preview */}
            {previewNumbers.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap gap-1.5 items-center" style={{ minHeight: '22px' }}>
                  {matchResults.length > 0
                    ? matchResults.map((r) => {
                        const isUnmatched = r.matchedFiles.length === 0
                        const isOverMatched = r.matchedFiles.length > 1
                        return (
                          <span
                            key={r.identifier}
                            className="inline-flex items-center gap-1 rounded-full font-mono text-[10.5px]"
                            title={r.matchedFiles.length > 0 ? r.matchedFiles.join(', ') : 'No files matched'}
                            style={{
                              padding: '2.5px 8px',
                              background: isUnmatched
                                ? 'color-mix(in oklab, var(--color-danger) 12%, var(--color-surface))'
                                : isOverMatched
                                  ? 'color-mix(in oklab, var(--color-warning) 12%, var(--color-surface))'
                                  : 'var(--color-surface)',
                              border: `1px solid ${
                                isUnmatched
                                  ? 'color-mix(in oklab, var(--color-danger) 35%, var(--color-border))'
                                  : isOverMatched
                                    ? 'color-mix(in oklab, var(--color-warning) 35%, var(--color-border))'
                                    : 'var(--color-border)'
                              }`,
                              color: isUnmatched
                                ? 'var(--color-danger)'
                                : isOverMatched
                                  ? 'var(--color-warning)'
                                  : 'var(--color-text)'
                            }}
                          >
                            {r.identifier}
                            <span
                              style={{
                                fontSize: '9px',
                                opacity: 0.7,
                                marginLeft: '2px'
                              }}
                            >
                              {r.matchedFiles.length === 0
                                ? '×'
                                : r.matchedFiles.length === 1
                                  ? r.matchedFiles[0]
                                  : `${r.matchedFiles.length}×`}
                            </span>
                          </span>
                        )
                      })
                    : previewNumbers.map((num) => (
                        <span
                          key={num}
                          className="inline-flex items-center gap-1.5 rounded-full font-mono text-[10.5px]"
                          style={{
                            padding: '2.5px 8px',
                            background: 'var(--color-surface)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text)'
                          }}
                        >
                          {num}
                        </span>
                      ))}
                </div>
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
              {matchedFiles.length || 0}
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
            v2.5.0
          </span>
        </div>

        <button
          onClick={handleCopyFiles}
          disabled={!isReady}
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
            opacity: isReady ? 1 : 0.45
          }}
        >
          {job === 'running' && (
            <span
              className="absolute inset-0 pointer-events-none"
              style={{
                background: 'var(--color-accent-soft)',
                borderRadius: 'var(--radius-md)',
                width: `${progress}%`,
                transition: 'width 200ms linear'
              }}
            />
          )}
          <span className="relative z-[2] inline-flex items-center gap-2">
            {job === 'running' ? (
              <>
                <Loader2 size={12} className="animate-spin-slow" />
                Copying <span className="font-mono opacity-70">{Math.round(progress)}%</span>
              </>
            ) : (
              <>
                <Play size={12} fill="currentColor" />
                Start copy
              </>
            )}
          </span>
        </button>
      </div>

      {/* Success Modal */}
      {showModal && results && (
        <div
          className="absolute inset-0 grid place-items-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          onClick={() => setShowModal(false)}
        >
          <div
            className="flex flex-col gap-3"
            style={{
              width: '380px',
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
                background: 'color-mix(in oklab, var(--color-success) 16%, var(--color-surface))',
                color: 'var(--color-success)'
              }}
            >
              <Check size={16} strokeWidth={2.5} />
            </div>
            <div>
              <h3
                className="text-[15px] font-semibold tracking-[-0.01em] m-0"
                style={{ color: 'var(--color-text)' }}
              >
                Copy complete
              </h3>
              <p
                className="text-[11.5px] leading-[1.5] m-0"
                style={{ color: 'var(--color-text-muted)' }}
              >
                {results.success.length} files copied, {results.notFound.length} not found,{' '}
                {results.failed.length} failed.
              </p>
            </div>
            <div
              className="grid grid-cols-3 gap-2"
              style={{
                padding: '10px 12px',
                background: 'var(--color-surface-inset)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)'
              }}
            >
              <div>
                <dt
                  className="text-[10px] font-mono tracking-[0.06em] m-0"
                  style={{ color: 'var(--color-text-soft)' }}
                >
                  COPIED
                </dt>
                <dd
                  className="font-mono text-[12.5px] font-semibold mt-0.5"
                  style={{ color: 'var(--color-text)' }}
                >
                  {results.success.length}
                </dd>
              </div>
              <div>
                <dt
                  className="text-[10px] font-mono tracking-[0.06em] m-0"
                  style={{ color: 'var(--color-text-soft)' }}
                >
                  NOT FOUND
                </dt>
                <dd
                  className="font-mono text-[12.5px] font-semibold mt-0.5"
                  style={{ color: 'var(--color-text)' }}
                >
                  {results.notFound.length}
                </dd>
              </div>
              <div>
                <dt
                  className="text-[10px] font-mono tracking-[0.06em] m-0"
                  style={{ color: 'var(--color-text-soft)' }}
                >
                  ELAPSED
                </dt>
                <dd
                  className="font-mono text-[12.5px] font-semibold mt-0.5"
                  style={{ color: 'var(--color-text)' }}
                >
                  {elapsed.toFixed(1)}s
                </dd>
              </div>
            </div>
            <div className="flex gap-2 justify-end mt-0.5">
              <button
                onClick={restartJob}
                className="inline-flex items-center gap-1.5 px-3.5 h-[30px] rounded-md text-[11.5px] font-medium transition-all duration-[120ms]"
                style={{
                  background: 'var(--color-surface-2)',
                  color: 'var(--color-text)',
                  border: '1px solid var(--color-border-strong)'
                }}
              >
                Restart
              </button>
              <button
                onClick={resetAppState}
                className="inline-flex items-center gap-1.5 px-3.5 h-[30px] rounded-md text-[11.5px] font-semibold transition-all duration-[120ms]"
                style={{
                  background: 'var(--color-accent)',
                  color: 'var(--color-accent-ink)',
                  border: '0'
                }}
              >
                Finish
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
