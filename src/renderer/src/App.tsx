import { useState, useEffect } from 'react'

type Step = 'source' | 'destination' | 'metadata' | 'review'

interface CopyResults {
  success: { input: string; matched: string }[]
  failed: { input: string; matched: string; error: string }[]
  notFound: string[]
}

const STEPS: { key: Step; label: string; icon: string }[] = [
  { key: 'source', label: 'Source', icon: 'folder_open' },
  { key: 'destination', label: 'Destination', icon: 'folder_copy' },
  { key: 'metadata', label: 'Metadata', icon: 'edit_note' },
  { key: 'review', label: 'Review', icon: 'verified' }
]

function App(): React.JSX.Element {
  const [currentStep, setCurrentStep] = useState<Step>('source')
  const [fileNames, setFileNames] = useState('')
  const [sourceFolder, setSourceFolder] = useState('')
  const [destFolder, setDestFolder] = useState('')
  const [destMode, setDestMode] = useState<'select' | 'create'>('create')
  const [customFolderName, setCustomFolderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewNumbers, setPreviewNumbers] = useState<string[]>([])
  const [matchedFiles, setMatchedFiles] = useState<string[]>([])
  const [results, setResults] = useState<CopyResults | null>(null)
  const [destPathError, setDestPathError] = useState('')
  const [duplicateInputs, setDuplicateInputs] = useState<Map<string, number>>(new Map())
  const [showReviewDuplicateModal, setShowReviewDuplicateModal] = useState(false)

  // Parse photo file identifiers from input text.
  // Returns deduplicated identifiers and a map of duplicates (identifier → count).
  // Handles: KYN3185, KYN-3185, KYN_3185, DSC_0012, plain numbers like 3185, etc.
  const parsePhotoFilesFromInput = (input: string): { identifiers: string[]; duplicates: Map<string, number> } => {
    const lines = input.split('\n')
    const counts = new Map<string, number>()

    for (const line of lines) {
      let cleanLine = line.trim()
      if (!cleanLine) continue
      // Remove numbered list prefixes (1. 2. etc.)
      cleanLine = cleanLine.replace(/^\d+\.\s*/, '')
      // Remove bullet point prefixes (•, -, *)
      cleanLine = cleanLine.replace(/^[•\-*]\s*/, '')
      cleanLine = cleanLine.trim()
      if (!cleanLine) continue

      // Match: optional letter prefix (2-6 chars) + optional separator + digits (3+)
      // or just digits (3+) alone
      const matches = cleanLine.match(/[A-Za-z]{2,6}[\-_]?\d{3,}|\d{3,}/g)
      if (matches) {
        for (const m of matches) {
          // Normalize: uppercase, strip separator between letter prefix and digits
          const key = m.toUpperCase().replace(/([A-Z]{2,6})[\-_](\d)/g, '$1$2')
          counts.set(key, (counts.get(key) || 0) + 1)
        }
      } else {
        // Fallback: whole line as identifier
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
  }

  // Update preview and duplicate tracking when input changes
  useEffect(() => {
    const { identifiers, duplicates } = parsePhotoFilesFromInput(fileNames)
    setPreviewNumbers(identifiers)
    setDuplicateInputs(duplicates)
  }, [fileNames])

  // Update matched files when source folder or preview numbers change
  useEffect(() => {
    const updateMatchedFiles = async (): Promise<void> => {
      if (sourceFolder && previewNumbers.length > 0) {
        try {
          const sourceFiles = await window.api.getSourceFiles(sourceFolder)

          const rawExtensions = ['.arw', '.cr2', '.nef', '.dng', '.orf', '.pef', '.rw2', '.raw', '.raf']
          const jpegExtensions = ['.jpg', '.jpeg']
          const otherExtensions = ['.png', '.tiff', '.tif']

          const getBaseName = (filename: string): string => {
            return filename.substring(0, filename.lastIndexOf('.'))
          }

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

          const normalize = (s: string): string => s.toUpperCase().replace(/[\-_]/g, '')

          const matched: string[] = []
          for (const identifier of previewNumbers) {
            const isPureNumber = /^\d+$/.test(identifier)

            const matchingFiles = sourceFiles.filter((file) => {
              if (isPureNumber) {
                const inputNum = parseInt(identifier, 10)
                const fileNums = file.match(/\d+/g) || []
                return fileNums.some((fn) => parseInt(fn, 10) === inputNum)
              } else {
                const normIdent = normalize(identifier)
                const fileBase = normalize(file.substring(0, file.lastIndexOf('.')))
                return fileBase.includes(normIdent)
              }
            })

            const prioritized = prioritizeRawFiles(matchingFiles)
            // Preview shows RAW files only per identifier; fall back to non-RAW if no RAW found
            const rawOnly = prioritized.filter(isRawFile)
            matched.push(...(rawOnly.length > 0 ? rawOnly : prioritized))
          }

          setMatchedFiles([...new Set(matched)])
        } catch (error) {
          console.error('Error getting source files:', error)
        }
      } else {
        setMatchedFiles([])
      }
    }

    updateMatchedFiles()
  }, [sourceFolder, previewNumbers])

  const handleSelectFolder = async (type: 'source' | 'destination'): Promise<void> => {
    const folderPath = await window.api.selectFolder(type)
    if (folderPath) {
      if (type === 'source') {
        setSourceFolder(folderPath)
        // If dest was already set to the same path, clear it
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

    const { identifiers } = parsePhotoFilesFromInput(fileNames)

    try {
      const copyResults = await window.api.copyFiles(sourceFolder, finalDestFolder, identifiers)
      setResults(copyResults)
      if (duplicateInputs.size > 0) setShowReviewDuplicateModal(true)
      setCurrentStep('review')
    } catch (error) {
      console.error('Error copying files:', error)
    } finally {
      setIsProcessing(false)
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
    setResults(null)
    setDestPathError('')
    setDuplicateInputs(new Map())
    setShowReviewDuplicateModal(false)
    setCurrentStep('source')
  }

  const getStepIndex = (step: Step): number => STEPS.findIndex((s) => s.key === step)

  const isStepCompleted = (step: Step): boolean => {
    switch (step) {
      case 'source':
        return !!sourceFolder
      case 'destination':
        return destMode === 'create' ? !!customFolderName.trim() : !!destFolder
      case 'metadata':
        return previewNumbers.length > 0 && matchedFiles.length > 0
      case 'review':
        return !!results
    }
  }

  const canNavigateToStep = (step: Step): boolean => {
    const targetIndex = getStepIndex(step)
    if (targetIndex === 0) return true
    // Can navigate to any previous step or the next step if current is completed
    const currentIndex = getStepIndex(currentStep)
    if (targetIndex <= currentIndex) return true
    // Can go forward if all prior steps are completed
    for (let i = 0; i < targetIndex; i++) {
      if (!isStepCompleted(STEPS[i].key)) return false
    }
    return true
  }

  const goToNextStep = (): void => {
    const currentIndex = getStepIndex(currentStep)
    if (currentIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentIndex + 1].key)
    }
  }

  // ─── Sidebar Cards ───

  const renderSidebarCard = (): React.JSX.Element => {
    switch (currentStep) {
      case 'source':
        return (
          <div className="bg-[#18181B] rounded-[20px] p-5 border border-[#27272A] flex flex-col gap-4 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="bg-[#27272A] p-2 rounded-xl">
                <span className="material-symbols-outlined text-[#c3c0ff]">upload_file</span>
              </div>
              <span className="text-[10px] font-headline font-bold tracking-[0.2em] text-[#A1A1AA] uppercase">
                Step 01
              </span>
            </div>
            <div>
              <h3 className="font-headline text-base font-bold text-[#FAFAFA]">
                Select Source Folder
              </h3>
              <p className="text-[#71717A] text-xs mt-1 leading-relaxed">
                Choose the folder containing your original photos to begin the selection process.
              </p>
            </div>
            {sourceFolder ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3 bg-[#09090B] p-3 rounded-xl">
                  <span className="material-symbols-outlined text-[#c3c0ff] text-sm">
                    hard_drive
                  </span>
                  <p className="text-sm text-[#FAFAFA] truncate flex-1">{sourceFolder}</p>
                  <span
                    className="material-symbols-outlined text-[#10B981] text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSelectFolder('source')}
                    className="flex-1 py-2 border border-[#27272A] text-[#A1A1AA] font-headline font-bold rounded-xl text-sm hover:bg-[#27272A] transition-colors"
                  >
                    Change
                  </button>
                  <button
                    onClick={goToNextStep}
                    className="flex-1 engine-room-gradient text-white font-headline font-bold py-2 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform"
                  >
                    Continue
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => handleSelectFolder('source')}
                className="engine-room-gradient text-white font-headline font-bold py-2.5 rounded-xl flex items-center justify-center gap-2 active:scale-95 transition-transform group"
              >
                Select Source
                <span className="material-symbols-outlined text-sm group-hover:translate-x-1 transition-transform">
                  arrow_forward
                </span>
              </button>
            )}
          </div>
        )

      case 'destination':
        return (
          <div className="bg-[#18181B] rounded-[20px] p-4 border border-[#27272A] flex flex-col gap-3">
            {sourceFolder && (
              <div className="mb-2">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#4338CA] font-headline">
                    Active Source
                  </span>
                  <span
                    className="material-symbols-outlined text-[#10B981] text-sm"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    check_circle
                  </span>
                </div>
                <p className="text-sm text-[#FAFAFA] truncate">{sourceFolder}</p>
              </div>
            )}

            <h3 className="font-headline font-bold text-[#FAFAFA] text-sm">Target Location</h3>

            <div className="grid grid-cols-2 gap-3">
              <div
                onClick={() => setDestMode('create')}
                className={`h-[68px] p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                  destMode === 'create'
                    ? 'border-2 border-[#4338CA] bg-[#4338CA]/10'
                    : 'border-[#27272A] hover:bg-[#27272A]'
                }`}
              >
                <div className="flex justify-between">
                  <span
                    className={`material-symbols-outlined ${destMode === 'create' ? 'text-white' : 'text-[#A1A1AA] group-hover:text-white'}`}
                  >
                    create_new_folder
                  </span>
                  {destMode === 'create' && (
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
                  )}
                </div>
                <span
                  className={`text-xs font-bold ${destMode === 'create' ? 'text-white' : 'text-[#A1A1AA] group-hover:text-white'}`}
                >
                  Create New
                </span>
              </div>

              <div
                onClick={() => setDestMode('select')}
                className={`h-[68px] p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between group ${
                  destMode === 'select'
                    ? 'border-2 border-[#4338CA] bg-[#4338CA]/10'
                    : 'border-[#27272A] hover:bg-[#27272A]'
                }`}
              >
                <div className="flex justify-between">
                  <span
                    className={`material-symbols-outlined ${destMode === 'select' ? 'text-white' : 'text-[#A1A1AA] group-hover:text-white'}`}
                    style={
                      destMode === 'select'
                        ? { fontVariationSettings: "'FILL' 1" }
                        : undefined
                    }
                  >
                    folder_managed
                  </span>
                  {destMode === 'select' && (
                    <div className="w-2 h-2 rounded-full bg-white shadow-[0_0_8px_white]" />
                  )}
                </div>
                <span
                  className={`text-xs font-bold ${destMode === 'select' ? 'text-white' : 'text-[#A1A1AA] group-hover:text-white'}`}
                >
                  Select Existing
                </span>
              </div>
            </div>

            {destMode === 'create' ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={customFolderName}
                  onChange={(e) => setCustomFolderName(e.target.value)}
                  placeholder="Enter folder name..."
                  className="w-full bg-[#09090B] border border-[#27272A] rounded-xl px-4 py-3 text-sm text-[#FAFAFA] placeholder:text-[#27272A] focus:outline-none focus:ring-2 focus:ring-[#4338CA] font-headline"
                />
                <span className="text-[11px] text-[#71717A]">
                  ~/Downloads/{customFolderName || 'folder-name'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {destFolder ? (
                  <div className="flex items-center gap-3 bg-[#09090B] p-3 rounded-xl">
                    <span className="material-symbols-outlined text-[#c3c0ff] text-sm">folder</span>
                    <p className="text-sm text-[#FAFAFA] truncate flex-1">{destFolder}</p>
                  </div>
                ) : null}
                <button
                  onClick={() => handleSelectFolder('destination')}
                  className="w-full py-2 border border-[#27272A] text-[#A1A1AA] font-headline font-bold rounded-xl text-sm hover:bg-[#27272A] transition-colors"
                >
                  {destFolder ? 'Change Folder' : 'Browse Folder'}
                </button>
                {destPathError && (
                  <p className="text-[11px] text-[#EF4444] flex items-center gap-1">
                    <span className="material-symbols-outlined text-sm">error</span>
                    {destPathError}
                  </p>
                )}
              </div>
            )}

            <button
              onClick={goToNextStep}
              disabled={destMode === 'create' ? !customFolderName.trim() : !destFolder}
              className="w-full mt-1 py-2.5 engine-room-gradient rounded-xl font-headline font-bold text-sm tracking-tight text-white hover:opacity-90 transition-opacity active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Continue to Metadata
            </button>
          </div>
        )

      case 'metadata':
        return (
          <div className="flex flex-col gap-3 overflow-y-auto custom-scrollbar pr-1 pb-24 relative">
            {sourceFolder && (
              <div className="bg-[#18181B] rounded-[16px] p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-[#4338CA] font-headline">
                    Current Source
                  </span>
                  <span className="material-symbols-outlined text-xs text-[#10B981]">
                    check_circle
                  </span>
                </div>
                <p className="text-[#FAFAFA] font-medium text-xs truncate">{sourceFolder}</p>
              </div>
            )}

            <div className="bg-[#18181B] rounded-[16px] p-3 border border-white/5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#4338CA] font-headline">
                  Output Path
                </span>
                <span className="material-symbols-outlined text-xs text-[#10B981]">
                  check_circle
                </span>
              </div>
              <p className="text-[#FAFAFA] font-medium text-xs truncate">
                {destMode === 'create'
                  ? `~/Downloads/${customFolderName}`
                  : destFolder}
              </p>
            </div>

            <div className="bg-[#18181B] rounded-[16px] p-4 border border-[#4338CA]/20">
              <div className="flex items-center gap-2 mb-3">
                <span className="material-symbols-outlined text-[#c3c0ff] text-base">keyboard</span>
                <h3 className="font-headline font-bold text-[#FAFAFA] text-sm">Photo Numbers</h3>
              </div>
              <textarea
                value={fileNames}
                onChange={(e) => setFileNames(e.target.value)}
                placeholder={'Enter photo numbers...\n3185\n3190\n• 3555\n1. 5504'}
                className="w-full h-[140px] bg-[#09090B] rounded-xl p-3 text-[#FAFAFA] font-headline font-bold text-base tracking-tight border-none focus:outline-none focus:ring-2 focus:ring-[#4338CA] resize-none placeholder:text-[#27272A]"
              />
              <div className="mt-2.5 flex items-center justify-between">
                <span className="text-xs text-[#A1A1AA]">
                  {previewNumbers.length} identifiers found
                </span>
                {fileNames && (
                  <button
                    onClick={() => setFileNames('')}
                    className="text-xs text-[#4338CA] font-bold hover:underline"
                  >
                    Clear all
                  </button>
                )}
              </div>
              {duplicateInputs.size > 0 && (
                <div className="mt-2 p-2.5 bg-[#F59E0B]/10 border border-[#F59E0B]/30 rounded-xl flex items-start gap-2">
                  <span className="material-symbols-outlined text-[#F59E0B] text-sm shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                  <div>
                    <p className="text-[10px] font-bold text-[#F59E0B] uppercase tracking-widest font-headline">Duplicates Detected</p>
                    <p className="text-[11px] text-[#A1A1AA] mt-0.5 leading-relaxed">
                      {Array.from(duplicateInputs.entries()).map(([k, v]) => `${k} (${v}×)`).join(', ')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="fixed bottom-0 left-0 w-[35%] p-4 bg-gradient-to-t from-[#09090B] via-[#09090B] to-transparent z-10">
              <button
                onClick={handleCopyFiles}
                disabled={
                  isProcessing ||
                  !sourceFolder ||
                  !fileNames.trim() ||
                  matchedFiles.length === 0 ||
                  (destMode === 'create' ? !customFolderName.trim() : !destFolder)
                }
                className="w-full bg-[#4338CA] text-white font-headline font-bold py-3.5 rounded-[14px] flex items-center justify-center gap-3 hover:bg-[#372abf] transition-all active:scale-[0.98] shadow-2xl shadow-[#4338CA]/20 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>
                  {isProcessing
                    ? 'Processing...'
                    : `Process ${matchedFiles.length} Files`}
                </span>
                <span className="material-symbols-outlined">arrow_forward</span>
              </button>
            </div>
          </div>
        )

      case 'review':
        return (
          <div className="bg-[#18181B] rounded-[20px] p-4 m-2 border border-white/5 flex flex-col gap-4">
            <div className="space-y-3">
              <div className="space-y-1.5 opacity-60">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] font-headline">
                  Source Path
                </label>
                <div className="bg-[#09090B] border border-white/5 p-2.5 rounded-xl text-xs font-mono text-[#A1A1AA] flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm shrink-0">lock</span>
                  <span className="truncate">{sourceFolder}</span>
                </div>
              </div>
              <div className="space-y-1.5 opacity-60">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] font-headline">
                  Destination Path
                </label>
                <div className="bg-[#09090B] border border-white/5 p-2.5 rounded-xl text-xs font-mono text-[#A1A1AA] flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm shrink-0">lock</span>
                  <span className="truncate">
                    {destMode === 'create' ? `~/Downloads/${customFolderName}` : destFolder}
                  </span>
                </div>
              </div>
              <div className="space-y-1.5 opacity-60">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#71717A] font-headline">
                  Numbers Entered
                </label>
                <div className="bg-[#09090B] border border-white/5 p-2.5 rounded-xl text-xs text-[#A1A1AA] min-h-[44px]">
                  {previewNumbers.join(', ')}
                </div>
              </div>
            </div>

            <div className="mt-auto pt-4 border-t border-white/5">
              <button
                onClick={resetAppState}
                className="w-full bg-[#27272A] hover:bg-[#323236] text-[#FAFAFA] font-headline font-semibold py-3 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm"
              >
                <span className="material-symbols-outlined">refresh</span>
                Start New Batch
              </button>
            </div>
          </div>
        )
    }
  }

  // ─── Canvas Content ───

  const renderCanvasContent = (): React.JSX.Element => {
    switch (currentStep) {
      case 'source':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-12 relative">
            <div className="absolute inset-0 dot-grid pointer-events-none" />
            <div className="max-w-md w-full flex flex-col items-center text-center relative">
              <div className="w-64 h-64 mb-12 relative flex items-center justify-center">
                <div className="absolute inset-0 bg-[#4338CA]/5 rounded-full scale-110 blur-3xl" />
                <div className="relative w-48 h-48 bg-white border border-gray-100 rounded-[2rem] shadow-[0px_8px_30px_rgba(0,0,0,0.04)] flex items-center justify-center">
                  <div className="w-32 h-32 border-2 border-dashed border-gray-200 rounded-3xl flex items-center justify-center">
                    <span className="material-symbols-outlined text-gray-300 text-5xl">
                      cloud_off
                    </span>
                  </div>
                  <div className="absolute -top-4 -right-4 w-12 h-12 bg-[#09090B] rounded-2xl flex items-center justify-center shadow-lg transform rotate-12">
                    <span className="material-symbols-outlined text-white text-xl">image</span>
                  </div>
                  <div className="absolute -bottom-2 -left-6 px-4 py-2 bg-white border border-gray-100 rounded-xl shadow-md flex items-center gap-2 transform -rotate-6">
                    <div className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="text-[10px] font-headline font-bold text-gray-400 uppercase tracking-widest leading-none">
                      No Source
                    </span>
                  </div>
                </div>
              </div>
              <h2 className="font-headline text-3xl font-bold text-[#09090B] mb-4">
                Awaiting Source Directory
              </h2>
              <p className="text-[#71717A] text-lg leading-relaxed mb-10">
                The canvas is empty. Select a source folder from the{' '}
                <span className="text-[#4338CA] font-medium">sidebar</span> to begin indexing your
                media.
              </p>
            </div>
          </div>
        )

      case 'destination':
        return (
          <div className="flex-1 flex flex-col items-center justify-center p-12 relative">
            <div className="absolute inset-0 dot-grid pointer-events-none" />
            <div className="absolute top-[20%] right-[10%] w-64 h-64 bg-[#4338CA]/5 rounded-full blur-[100px]" />
            <div className="absolute bottom-[20%] left-[10%] w-48 h-48 bg-[#10B981]/5 rounded-full blur-[80px]" />

            <div className="flex flex-col items-center text-center max-w-md px-8 relative">
              <div className="w-24 h-24 mb-8 relative">
                <div className="absolute inset-0 bg-[#4338CA]/5 rounded-3xl animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="material-symbols-outlined text-5xl text-[#4338CA]/30">
                    folder_zip
                  </span>
                </div>
                <div className="absolute -right-2 -bottom-2 w-10 h-10 bg-white rounded-2xl shadow-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-[#4338CA] text-xl">sync</span>
                </div>
              </div>
              <h2 className="font-headline font-bold text-3xl text-[#09090B] mb-4 tracking-tight">
                Configure Destination
              </h2>
              <p className="text-[#71717A] leading-relaxed mb-8">
                Select your destination storage or create a new project directory. Your assets
                remain safe in the source volume.
              </p>
              <div className="flex gap-3">
                <div className="px-4 py-2 bg-[#F4F4F5] rounded-full flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span className="text-[10px] font-bold text-[#71717A] uppercase tracking-wider">
                    Source Verified
                  </span>
                </div>
                <div className="px-4 py-2 bg-[#4338CA]/5 rounded-full flex items-center gap-2 border border-[#4338CA]/20">
                  <div className="w-2 h-2 rounded-full bg-[#4338CA] animate-ping" />
                  <span className="text-[10px] font-bold text-[#4338CA] uppercase tracking-wider">
                    Pending Destination
                  </span>
                </div>
              </div>
            </div>
          </div>
        )

      case 'metadata':
        return (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-12">
              <div className="flex flex-col mb-10">
                <h2 className="text-4xl font-headline font-bold text-[#09090B] tracking-tight">
                  Active Selection
                </h2>
                <p className="text-[#71717A] mt-2">
                  {matchedFiles.length > 0
                    ? `Reviewing ${matchedFiles.length} matched files from source folder.`
                    : previewNumbers.length > 0
                      ? `Looking for ${previewNumbers.length} numbers in source...`
                      : 'Enter photo numbers in the sidebar to preview matches.'}
                </p>
              </div>

              {matchedFiles.length > 0 ? (
                <>
                  <div className="grid grid-cols-12 px-4 py-3 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
                    <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">#</div>
                    <div className="col-span-7 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">File Name</div>
                    <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">Type</div>
                    <div className="col-span-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">Status</div>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {matchedFiles.map((file, index) => {
                      const ext = file.substring(file.lastIndexOf('.') + 1).toUpperCase()
                      const isRaw = ['ARW', 'CR2', 'NEF', 'DNG', 'ORF', 'PEF', 'RW2', 'RAW', 'RAF'].includes(ext)
                      return (
                        <div
                          key={file}
                          className="grid grid-cols-12 px-4 h-12 items-center hover:bg-gray-50/80 transition-colors group"
                        >
                          <div className="col-span-1 text-sm text-gray-400">{index + 1}</div>
                          <div className="col-span-7 font-medium text-gray-900 text-sm truncate">{file}</div>
                          <div className="col-span-2">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold font-headline ${
                                isRaw
                                  ? 'bg-[#4338CA]/10 text-[#4338CA]'
                                  : 'bg-gray-100 text-gray-500'
                              }`}
                            >
                              {ext}
                            </span>
                          </div>
                          <div className="col-span-2 flex items-center gap-1.5 text-[#10B981] font-headline font-semibold text-xs">
                            <span
                              className="material-symbols-outlined text-sm"
                              style={{ fontVariationSettings: "'FILL' 1" }}
                            >
                              check_circle
                            </span>
                            MATCHED
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </>
              ) : previewNumbers.length > 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">
                    search_off
                  </span>
                  <h3 className="font-headline font-bold text-xl text-[#09090B] mb-2">
                    No Matches Found
                  </h3>
                  <p className="text-[#71717A] max-w-sm">
                    Looking for: {previewNumbers.join(', ')}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">
                    edit_note
                  </span>
                  <h3 className="font-headline font-bold text-xl text-[#09090B] mb-2">
                    Enter Photo Numbers
                  </h3>
                  <p className="text-[#71717A] max-w-sm">
                    Type or paste photo numbers in the sidebar to see matched files here.
                  </p>
                </div>
              )}
            </div>

            {matchedFiles.length > 0 && (
              <div className="fixed bottom-6 right-8 bg-white/60 backdrop-blur-md border border-gray-100 rounded-2xl p-4 flex gap-6 shadow-[0px_8px_30px_rgba(0,0,0,0.04)] z-40">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-headline">
                    Files
                  </span>
                  <span className="font-headline font-bold text-gray-900">
                    {matchedFiles.length}
                  </span>
                </div>
                <div className="w-[1px] h-full bg-gray-100" />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-gray-400 uppercase font-headline">
                    Numbers
                  </span>
                  <span className="font-headline font-bold text-gray-900">
                    {previewNumbers.length}
                  </span>
                </div>
                <div className="w-[1px] h-full bg-gray-100" />
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse" />
                  <span className="text-xs font-bold text-[#09090B]">Ready</span>
                </div>
              </div>
            )}
          </div>
        )

      case 'review':
        return (
          <div className="flex-1 flex flex-col overflow-hidden relative">
            {/* Duplicate inputs modal */}
            {showReviewDuplicateModal && duplicateInputs.size > 0 && (
              <div className="absolute inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-8">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                  <div className="bg-[#F59E0B] px-6 py-4 flex items-center gap-3">
                    <span className="material-symbols-outlined text-white" style={{ fontVariationSettings: "'FILL' 1" }}>warning</span>
                    <h3 className="font-headline font-bold text-white text-base">Duplicate Inputs Detected</h3>
                  </div>
                  <div className="px-6 py-4">
                    <p className="text-sm text-[#71717A] mb-4">The following identifiers appeared more than once in your input. Only one copy was processed per identifier.</p>
                    <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                      {Array.from(duplicateInputs.entries()).map(([key, count]) => (
                        <div key={key} className="px-4 h-11 flex items-center justify-between">
                          <span className="font-headline font-bold text-[#09090B] text-sm">{key}</span>
                          <span className="px-2.5 py-1 bg-[#F59E0B]/10 text-[#F59E0B] rounded-lg text-xs font-bold font-headline">
                            {count}× duplicate
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="px-6 pb-5">
                    <button
                      onClick={() => setShowReviewDuplicateModal(false)}
                      className="w-full py-2.5 bg-[#09090B] text-white font-headline font-bold rounded-xl text-sm hover:bg-[#27272A] transition-colors"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            )}
            {results && results.success.length > 0 && (
              <div className="bg-[#10B981] px-8 py-4 flex items-center justify-between shadow-lg relative z-20">
                <div className="flex items-center gap-3">
                  <div className="bg-white/20 p-1 rounded-full">
                    <span className="material-symbols-outlined text-white text-xl">
                      check_circle
                    </span>
                  </div>
                  <p className="text-white font-bold text-lg">
                    Successfully copied {results.success.length} files.
                  </p>
                </div>
              </div>
            )}

            <div className="flex-1 overflow-y-auto custom-scrollbar bg-white p-8">
              {results ? (
                <div className="max-w-5xl mx-auto">
                  {/* Success Table */}
                  {results.success.length > 0 && (
                    <>
                      <div className="grid grid-cols-12 px-6 py-4 border-b border-gray-100 bg-gray-50/50 rounded-t-2xl">
                        <div className="col-span-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">
                          #
                        </div>
                        <div className="col-span-5 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">
                          File Name
                        </div>
                        <div className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">
                          Input
                        </div>
                        <div className="col-span-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest font-headline">
                          Status
                        </div>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {results.success.map((result, index) => (
                          <div
                            key={`success-${index}`}
                            className="grid grid-cols-12 px-6 h-14 items-center hover:bg-gray-50/80 transition-colors"
                          >
                            <div className="col-span-1 text-sm text-gray-400">{index + 1}</div>
                            <div className="col-span-5 font-medium text-gray-900 text-sm truncate">
                              {result.matched}
                            </div>
                            <div className="col-span-3 text-gray-500 text-sm">{result.input}</div>
                            <div className="col-span-3 flex items-center gap-2 text-[#10B981] font-headline font-semibold text-xs">
                              <span
                                className="material-symbols-outlined text-sm"
                                style={{ fontVariationSettings: "'FILL' 1" }}
                              >
                                check_circle
                              </span>
                              COPIED
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {/* Not Found */}
                  {results.notFound.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-headline font-bold text-[#09090B] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#F59E0B]">warning</span>
                        Not Found ({results.notFound.length})
                      </h3>
                      <div className="flex flex-wrap gap-2">
                        {results.notFound.map((num, i) => (
                          <span
                            key={`nf-${i}`}
                            className="px-3 py-1.5 bg-[#F59E0B]/10 text-[#F59E0B] rounded-lg text-sm font-bold font-headline"
                          >
                            {num}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Failed */}
                  {results.failed.length > 0 && (
                    <div className="mt-8">
                      <h3 className="font-headline font-bold text-[#09090B] mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[#EF4444]">error</span>
                        Failed ({results.failed.length})
                      </h3>
                      <div className="divide-y divide-gray-100 border border-gray-100 rounded-xl overflow-hidden">
                        {results.failed.map((result, i) => (
                          <div
                            key={`fail-${i}`}
                            className="px-6 py-3 flex items-center justify-between"
                          >
                            <div>
                              <span className="font-medium text-sm">{result.matched}</span>
                              <span className="text-xs text-gray-400 ml-2">({result.input})</span>
                            </div>
                            <span className="text-xs text-[#EF4444]">{result.error}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary Stats */}
                  <div className="mt-12 flex justify-center">
                    <div className="bg-white/60 backdrop-blur-md border border-gray-100 rounded-2xl p-4 flex gap-8 shadow-[0px_8px_30px_rgba(0,0,0,0.04)]">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase font-headline">
                          Copied
                        </span>
                        <span className="font-headline font-bold text-gray-900">
                          {results.success.length}
                        </span>
                      </div>
                      <div className="w-[1px] bg-gray-100" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase font-headline">
                          Not Found
                        </span>
                        <span className="font-headline font-bold text-gray-900">
                          {results.notFound.length}
                        </span>
                      </div>
                      <div className="w-[1px] bg-gray-100" />
                      <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase font-headline">
                          Failed
                        </span>
                        <span className="font-headline font-bold text-gray-900">
                          {results.failed.length}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full">
                  <span className="material-symbols-outlined text-6xl text-gray-300 mb-4">
                    hourglass_empty
                  </span>
                  <h3 className="font-headline font-bold text-xl text-[#09090B]">
                    No results yet
                  </h3>
                  <p className="text-[#71717A] mt-2">Complete the previous steps to see results.</p>
                </div>
              )}
            </div>
          </div>
        )
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden">
      {/* Left Panel: Engine Room (35%) */}
      <aside className="w-[35%] bg-[#09090B] relative flex flex-col z-20">
        <div className="flex flex-col h-full p-4 gap-3">
          {/* Brand Header */}
          <div className="px-2 py-3">
            <h1 className="font-headline font-bold tracking-tighter text-[#FAFAFA] text-2xl">
              Kayana
            </h1>
            <p className="font-headline text-[#A1A1AA] text-xs tracking-widest mt-0.5 opacity-60">
              PHOTO HELPER
            </p>
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-col gap-1">
            {STEPS.map((step) => {
              const isActive = currentStep === step.key
              const completed = isStepCompleted(step.key)
              const navigable = canNavigateToStep(step.key)

              return (
                <div
                  key={step.key}
                  onClick={() => navigable && setCurrentStep(step.key)}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-[#4338CA] to-[#372abf] text-white shadow-lg shadow-[#4338CA]/20'
                      : navigable
                        ? 'text-[#A1A1AA] hover:text-white hover:bg-[#27272A] cursor-pointer'
                        : 'text-[#A1A1AA]/40 cursor-not-allowed'
                  }`}
                >
                  <span
                    className="material-symbols-outlined text-[20px]"
                    style={
                      isActive || completed
                        ? { fontVariationSettings: "'FILL' 1" }
                        : undefined
                    }
                  >
                    {step.icon}
                  </span>
                  <span className="font-headline font-bold tracking-tight text-sm">{step.label}</span>
                  {completed && !isActive && (
                    <span
                      className="ml-auto material-symbols-outlined text-xs text-[#10B981]"
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      check_circle
                    </span>
                  )}
                </div>
              )
            })}
          </nav>

          {/* Sidebar Content */}
          <div className="mt-auto flex flex-col gap-3 overflow-hidden">
            {renderSidebarCard()}
          </div>
        </div>
      </aside>

      {/* Right Panel: Canvas (65%) */}
      <main className="flex-1 bg-white relative flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="h-16 w-full flex items-center justify-between px-8 border-b border-gray-100 bg-white/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-6">
            <nav className="flex gap-6">
              {STEPS.map((step) => (
                <span
                  key={step.key}
                  onClick={() => canNavigateToStep(step.key) && setCurrentStep(step.key)}
                  className={`font-headline font-bold text-sm transition-colors ${
                    currentStep === step.key
                      ? 'text-[#4338CA] border-b-2 border-[#4338CA] pb-1'
                      : canNavigateToStep(step.key)
                        ? 'text-[#71717A] hover:text-[#09090B] cursor-pointer'
                        : 'text-[#71717A]/40 cursor-not-allowed'
                  }`}
                >
                  {step.label}
                </span>
              ))}
            </nav>
          </div>
        </header>

        {/* Main Canvas Content */}
        {renderCanvasContent()}

        {/* Global Status Bar */}
        <footer className="h-10 bg-gray-50 border-t border-gray-100 px-8 flex items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <span
                className={`w-1.5 h-1.5 rounded-full ${isProcessing ? 'bg-[#F59E0B] animate-pulse' : 'bg-[#10B981]'}`}
              />
              <span className="text-[10px] font-headline font-bold text-gray-400 uppercase tracking-widest">
                {isProcessing ? 'Processing' : 'System Ready'}
              </span>
            </div>
            <div className="h-3 w-[1px] bg-gray-200" />
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-headline font-bold text-gray-400 uppercase tracking-widest">
                {matchedFiles.length} files matched
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-headline font-bold text-gray-400 uppercase tracking-widest">
              RAW Priority Active
            </span>
          </div>
        </footer>
      </main>

      {/* Shadow decoration for depth */}
      <div className="fixed left-0 top-0 h-full w-[35%] pointer-events-none z-10 shadow-[20px_0_60px_rgba(0,0,0,0.4)] opacity-50" />
    </div>
  )
}

export default App
