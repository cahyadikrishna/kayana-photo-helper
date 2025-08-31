import { useState, useEffect } from 'react'
import { Button } from './components/ui/button'
import { Input } from './components/ui/input'
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group'
import { Textarea } from './components/ui/textarea'
import { ScrollArea } from './components/ui/scroll-area'
import { Separator } from './components/ui/separator'

function App(): React.JSX.Element {
  const [fileNames, setFileNames] = useState('')
  const [sourceFolder, setSourceFolder] = useState('')
  const [destFolder, setDestFolder] = useState('')
  const [destMode, setDestMode] = useState<'select' | 'create'>('create')
  const [customFolderName, setCustomFolderName] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [previewNumbers, setPreviewNumbers] = useState<string[]>([])
  const [matchedFiles, setMatchedFiles] = useState<string[]>([])
  const [results, setResults] = useState<{
    success: { input: string; matched: string }[]
    failed: { input: string; matched: string; error: string }[]
    notFound: string[]
  } | null>(null)

  // Parse numbers from input text
  const parseNumbersFromInput = (input: string): string[] => {
    const lines = input.split('\n')
    const numbers: string[] = []

    for (const line of lines) {
      const trimmedLine = line.trim()
      if (!trimmedLine) continue

      // Handle various list formats and extract the actual photo numbers
      let cleanLine = trimmedLine

      // Remove numbered list prefixes like "1. ", "2. ", etc.
      cleanLine = cleanLine.replace(/^\d+\.\s*/, '')

      // Remove bullet point prefixes like "• ", "- ", "* "
      cleanLine = cleanLine.replace(/^[•\-*]\s*/, '')

      // Remove any remaining leading/trailing whitespace
      cleanLine = cleanLine.trim()

      // Now extract numbers from the cleaned line
      // Look for 3-4 digit numbers (typical photo numbers) or longer sequences
      if (cleanLine) {
        const photoNumbers = cleanLine.match(/\d{3,}/g) // Match numbers with 3+ digits
        if (photoNumbers) {
          numbers.push(...photoNumbers)
        } else {
          // Fallback: if no 3+ digit numbers, get any numbers
          const anyNumbers = cleanLine.match(/\d+/g)
          if (anyNumbers) {
            // Filter out very small numbers (likely not photo numbers)
            const filteredNumbers = anyNumbers.filter((num) => parseInt(num, 10) >= 100)
            numbers.push(...filteredNumbers)
          }
        }
      }
    }

    return [...new Set(numbers)] // Remove duplicates
  }

  // Update preview when input changes
  useEffect(() => {
    const numbers = parseNumbersFromInput(fileNames)
    console.log('Input text:', fileNames)
    console.log('Parsed numbers from input:', numbers)
    setPreviewNumbers(numbers)
  }, [fileNames])

  // Update matched files when source folder or preview numbers change
  useEffect(() => {
    const updateMatchedFiles = async (): Promise<void> => {
      console.log('updateMatchedFiles called with:', { sourceFolder, previewNumbers })
      if (sourceFolder && previewNumbers.length > 0) {
        try {
          const sourceFiles = await window.api.getSourceFiles(sourceFolder)
          console.log('Source files retrieved:', sourceFiles)

          // Helper functions for RAW prioritization
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

          const getBaseName = (filename: string): string => {
            return filename.substring(0, filename.lastIndexOf('.'))
          }

          const isRawFile = (filename: string): boolean => {
            const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'))
            return rawExtensions.includes(ext)
          }

          const prioritizeRawFiles = (matchingFiles: string[]): string[] => {
            const grouped = new Map<string, string[]>()

            // Group files by base name
            for (const file of matchingFiles) {
              const baseName = getBaseName(file)
              if (!grouped.has(baseName)) {
                grouped.set(baseName, [])
              }
              grouped.get(baseName)!.push(file)
            }

            const prioritizedFiles: string[] = []

            // For each group, prefer RAW over JPG
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

              // Priority: RAW > Other formats > JPEG (only if no RAW available)
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

          const matched: string[] = []

          for (const number of previewNumbers) {
            console.log('Processing number:', number)
            const matchingFiles = sourceFiles.filter((file) => {
              const fileNumbers = file.match(/\d+/g) || []
              return fileNumbers.some((fileNum) => {
                // Convert both to integers for comparison to ignore leading zeros
                const inputNum = parseInt(number, 10)
                const fileNumInt = parseInt(fileNum, 10)

                // Also check if the input number is contained within the file number
                // This handles cases like input "1503" matching file number "01503"
                return (
                  fileNumInt === inputNum || fileNum.includes(number) || number.includes(fileNum)
                )
              })
            })

            // Apply RAW file prioritization to preview as well
            const prioritizedFiles = prioritizeRawFiles(matchingFiles)
            console.log(
              'Matching files for',
              number,
              ':',
              matchingFiles,
              '-> prioritized:',
              prioritizedFiles
            )
            matched.push(...prioritizedFiles)
          }

          const finalMatched = [...new Set(matched)]
          console.log('Final matched files:', finalMatched)
          setMatchedFiles(finalMatched) // Remove duplicates
        } catch (error) {
          console.error('Error getting source files:', error)
        }
      } else {
        console.log('Clearing matched files - no source folder or preview numbers')
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
      } else {
        setDestFolder(folderPath)
      }
    }
  }

  const handleCopyFiles = async (): Promise<void> => {
    if (!sourceFolder || !fileNames.trim()) {
      alert('Please select source folder and enter photo numbers')
      return
    }

    // Validate destination folder based on mode
    let finalDestFolder = ''
    if (destMode === 'create') {
      if (!customFolderName.trim()) {
        alert('Please enter a folder name for the destination')
        return
      }
      try {
        finalDestFolder = await window.api.createDestFolder(customFolderName.trim())
      } catch {
        alert('Failed to create destination folder')
        return
      }
    } else {
      if (!destFolder) {
        alert('Please select a destination folder')
        return
      }
      finalDestFolder = destFolder
    }

    setIsProcessing(true)
    setResults(null)

    // Parse numbers from the input
    const numbers = parseNumbersFromInput(fileNames)

    try {
      const copyResults = await window.api.copyFiles(sourceFolder, finalDestFolder, numbers)
      setResults(copyResults)
    } catch (error) {
      console.error('Error copying files:', error)
      alert('An error occurred while copying files')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="p-6">
      <header className="flex flex-col items-center gap-1">
        <h1 className="font-bold text-2xl">📸 Kayana Photo Helper</h1>
        <p>Filter and copy photos by number - supports various input formats</p>
        <small className="text-green-500">
          🎯 Smart filtering: Prioritizes RAW files when both RAW and JPG exist
        </small>
      </header>

      <div className="flex flex-fow gap-4 w-full mt-6">
        <div className="w-full">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col">
              <label>Source Folder:</label>

              <div className="flex gap-2">
                <Input
                  type="text"
                  value={sourceFolder}
                  readOnly
                  placeholder="Select folder with original photos"
                />

                <Button variant="default" size="lg" onClick={() => handleSelectFolder('source')}>
                  Browse
                </Button>
              </div>
            </div>

            <div className="form-group">
              <label>Destination Folder:</label>
              <RadioGroup
                value={destMode}
                onValueChange={(val) => setDestMode(val as 'create' | 'select')}
                className="dest-mode-selector flex flex-row"
              >
                <label className="radio-option">
                  <RadioGroupItem value="create" />
                  <span>Create in Downloads</span>
                </label>

                <label className="radio-option">
                  <RadioGroupItem value="select" />
                  <span>Select existing folder</span>
                </label>
              </RadioGroup>

              {destMode === 'create' ? (
                <div className="folder-input">
                  <Input
                    type="text"
                    value={customFolderName}
                    onChange={(e) => setCustomFolderName(e.target.value)}
                    placeholder="Enter folder name (e.g., 'Client Wedding Photos')"
                  />

                  <span className="folder-hint">
                    📁 ~/Downloads/{customFolderName || 'folder-name'}
                  </span>
                </div>
              ) : (
                <div className="flex flex-row gap-2">
                  <Input
                    type="text"
                    value={destFolder}
                    readOnly
                    placeholder="Select folder to copy selected photos"
                  />

                  <Button
                    variant="default"
                    size="lg"
                    onClick={() => handleSelectFolder('destination')}
                  >
                    Browse
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4">
            <div className="form-group">
              <label htmlFor="fileNames">Photo Numbers or Names:</label>

              <Textarea
                id="fileNames"
                value={fileNames}
                onChange={(e) => setFileNames(e.target.value)}
                placeholder={
                  'Paste your list here - supports various formats:\n3185\n3190\n• 3555\n1. 5504\nIMG_1234.JPG'
                }
                rows={10}
              />
            </div>
          </div>

          <Button
            className="w-full mt-4"
            variant="default"
            size="lg"
            onClick={handleCopyFiles}
            disabled={
              isProcessing ||
              !sourceFolder ||
              !fileNames.trim() ||
              (destMode === 'create' ? !customFolderName.trim() : !destFolder)
            }
          >
            {isProcessing ? 'Copying...' : `Copy ${matchedFiles.length} Selected Photos`}
          </Button>
        </div>

        <div className="w-full">
          {sourceFolder && previewNumbers.length > 0 && (
            <div className="preview-section">
              {matchedFiles.length > 0 ? (
                <>
                  <h4>🔍 Found {matchedFiles.length} matching files:</h4>
                  <ScrollArea className="h-64 w-full rounded-md border">
                    <div className="p-4">
                      {matchedFiles.map((file, index) => (
                        <div key={file}>
                          <div className="text-sm">{file}</div>
                          {index < matchedFiles.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </>
              ) : (
                <div>
                  <h4>🔍 No matching files found</h4>
                  <p>Looking for numbers: {previewNumbers.join(', ')}</p>
                  <p>In folder: {sourceFolder}</p>
                </div>
              )}
            </div>
          )}

          {results && (
            <div className="results-section mt-4">
              <h4 className="mb-2">📋 Copy Results</h4>
              <ScrollArea className="h-72 w-full rounded-md border">
                <div className="p-4">
                  {results.success.length > 0 && (
                    <>
                      <h5 className="text-sm font-semibold text-green-600 mb-2">
                        ✅ Successfully copied ({results.success.length}):
                      </h5>
                      {results.success.map((result, index) => (
                        <div key={`success-${index}`}>
                          <div className="text-sm">
                            <strong>{result.input}</strong> → {result.matched}
                          </div>
                          {index < results.success.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                      <Separator className="my-4" />
                    </>
                  )}

                  {results.notFound.length > 0 && (
                    <>
                      <h5 className="text-sm font-semibold text-yellow-600 mb-2">
                        🤔 Numbers not found ({results.notFound.length}):
                      </h5>
                      {results.notFound.map((number, index) => (
                        <div key={`not-found-${index}`}>
                          <div className="text-sm">{number}</div>
                          {index < results.notFound.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                      <Separator className="my-4" />
                    </>
                  )}

                  {results.failed.length > 0 && (
                    <>
                      <h5 className="text-sm font-semibold text-red-600 mb-2">
                        ⚠️ Failed to copy ({results.failed.length}):
                      </h5>
                      {results.failed.map((result, index) => (
                        <div key={`failed-${index}`}>
                          <div className="text-sm">
                            <strong>{result.input}</strong> → {result.matched}
                            <span className="text-xs text-red-500"> (Error: {result.error})</span>
                          </div>
                          {index < results.failed.length - 1 && <Separator className="my-2" />}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
