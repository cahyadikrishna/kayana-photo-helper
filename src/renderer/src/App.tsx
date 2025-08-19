import { useState, useEffect } from 'react'
import './App.css'

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
      } catch (error) {
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
    <div className="app-container">
      <header className="app-header">
        <h1>📸 Photo Helper</h1>
        <p>Filter and copy photos by number - supports various input formats</p>
        <small>🎯 Smart filtering: Prioritizes RAW files when both RAW and JPG exist</small>
      </header>

      <div className="main-content">
        <div className="input-section">
          <div className="folder-section">
            <div className="form-group">
              <label>Source Folder:</label>
              <div className="folder-input">
                <input
                  type="text"
                  value={sourceFolder}
                  readOnly
                  placeholder="Select folder with original photos"
                />
                <button onClick={() => handleSelectFolder('source')}>Browse</button>
              </div>
            </div>

            <div className="form-group">
              <label>Destination Folder:</label>
              <div className="dest-mode-selector">
                <label className="radio-option">
                  <input
                    type="radio"
                    value="create"
                    checked={destMode === 'create'}
                    onChange={(e) => setDestMode(e.target.value as 'create' | 'select')}
                  />
                  <span>Create in Downloads</span>
                </label>
                <label className="radio-option">
                  <input
                    type="radio"
                    value="select"
                    checked={destMode === 'select'}
                    onChange={(e) => setDestMode(e.target.value as 'create' | 'select')}
                  />
                  <span>Select existing folder</span>
                </label>
              </div>

              {destMode === 'create' ? (
                <div className="folder-input">
                  <input
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
                <div className="folder-input">
                  <input
                    type="text"
                    value={destFolder}
                    readOnly
                    placeholder="Select folder to copy selected photos"
                  />
                  <button onClick={() => handleSelectFolder('destination')}>Browse</button>
                </div>
              )}
            </div>
          </div>

          <div className="main-input">
            <div className="form-group">
              <label htmlFor="fileNames">Photo Numbers or Names:</label>

              <textarea
                id="fileNames"
                value={fileNames}
                onChange={(e) => setFileNames(e.target.value)}
                placeholder="Paste your list here - supports various formats:&#10;3185&#10;3190&#10;• 3555&#10;1. 5504&#10;IMG_1234.JPG"
                rows={8}
              />
            </div>
          </div>

          <button
            className="copy-button"
            onClick={handleCopyFiles}
            disabled={
              isProcessing ||
              !sourceFolder ||
              !fileNames.trim() ||
              (destMode === 'create' ? !customFolderName.trim() : !destFolder)
            }
          >
            {isProcessing ? 'Copying...' : `Copy ${matchedFiles.length} Selected Photos`}
          </button>
        </div>

        <div className="output-section">
          {sourceFolder && previewNumbers.length > 0 && (
            <div className="preview-section">
              {matchedFiles.length > 0 ? (
                <>
                  <h4>🔍 Found {matchedFiles.length} matching files:</h4>
                  <div className="matched-files-preview">
                    {matchedFiles.slice(0, 10).map((file) => (
                      <span key={file} className="file-tag">
                        {file}
                      </span>
                    ))}
                    {matchedFiles.length > 10 && (
                      <span className="more-files">+{matchedFiles.length - 10} more...</span>
                    )}
                  </div>
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
            <div className="results-section">
              <h3>Copy Results</h3>
              {results.success.length > 0 && (
                <div className="result-group success">
                  <h4>✅ Successfully copied ({results.success.length}):</h4>
                  <ul>
                    {results.success.map((result, index) => (
                      <li key={index}>
                        <strong>{result.input}</strong> → {result.matched}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {results.notFound.length > 0 && (
                <div className="result-group not-found">
                  <h4>❌ Numbers not found ({results.notFound.length}):</h4>
                  <ul>
                    {results.notFound.map((number, index) => (
                      <li key={index}>{number}</li>
                    ))}
                  </ul>
                </div>
              )}

              {results.failed.length > 0 && (
                <div className="result-group failed">
                  <h4>⚠️ Failed to copy ({results.failed.length}):</h4>

                  <ul>
                    {results.failed.map((result, index) => (
                      <li key={index}>
                        <strong>{result.input}</strong> → {result.matched}
                        <small> (Error: {result.error})</small>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
