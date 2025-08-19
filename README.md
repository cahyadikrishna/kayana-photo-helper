# 📸 Photo Helper

A simple Electron app that helps photographers and editors filter and copy specific photos from a large collection based on a list of filenames.

## Features

- **Smart Number Parsing**: Just paste photo numbers in any format - handles bullets, numbering, mixed lists
- **Flexible Input**: Works with full filenames OR just numbers (e.g., "3185" finds "WED_3185.JPG")
- **Live Preview**: See parsed numbers and matching files in real-time as you type
- **Smart Destinations**: Auto-create folders in Downloads OR select any existing folder
- **Multi-format Support**: Copies all matching files (RAW + JPG of same shot)
- **Detailed Results**: See which files were successfully copied, which weren't found, and which failed

## How to Use

1. **Paste Your List**: Copy photo numbers or names in any format:

   ```
   3185
   3190
   • 3555
   1. 5504
   IMG_1234.JPG
   ```

2. **See Live Preview**: Watch as numbers are parsed and matching files are found

3. **Select Source Folder**: Click "Browse" to choose the folder containing your original photos

4. **Choose Destination**:
   - **Auto-create**: Type a folder name (creates in Downloads)
   - **Select existing**: Browse to any folder

5. **Copy Photos**: Click "Copy Selected Photos" to start the process

6. **Review Results**: The app will show you:
   - ✅ Successfully copied files (with input → matched file mapping)
   - ❌ Numbers that weren't found in the source folder
   - ⚠️ Files that failed to copy (permission issues, etc.)

## Development

### Prerequisites

- Node.js (v16 or later)
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Build for specific platforms
pnpm build:mac
pnpm build:win
pnpm build:linux
```

### Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool
- **electron-vite** - Electron + Vite integration

## Use Cases

- **Wedding Photographers**: Filter client's favorite photos from a large shoot
- **Event Photographers**: Create curated galleries from hundreds of photos
- **Photo Editors**: Organize photos based on client selections
- **Studio Workflows**: Batch process specific photos for delivery

## File Formats Supported

The app works with any file format since it copies files by name. Common formats include:

- JPEG (.jpg, .jpeg)
- RAW formats (.raw, .cr2, .nef, .arw, etc.)
- PNG (.png)
- TIFF (.tiff, .tif)
- Any other file format

## Safety Features

- **Copy Operation**: Files are copied, not moved, so originals are preserved
- **Error Handling**: Detailed error reporting for troubleshooting
- **Path Validation**: Ensures source files exist before attempting copy
- **Progress Feedback**: Shows which files succeeded/failed

---

Built with ❤️ for photographers and photo editors
