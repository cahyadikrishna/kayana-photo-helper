# 🧪 Photo Helper - Test Guide

## What We've Improved

### ✨ **Smart Number Extraction**

The app now intelligently parses photo numbers from various input formats:

1. **Simple numbers**: `3185`, `3190`, `3194`
2. **Bullet points**: `• 3551`, `• 3555`, `• 3563`
3. **Numbered lists**: `1. 5504`, `2. 5520`, `3. 5532`
4. **Mixed formats**: Any combination of the above

### 🔍 **Live Preview**

- As you type, see parsed numbers in real-time
- When you select a source folder, instantly see matching files
- Preview shows up to 10 matching files with count

### 🎯 **Smart File Matching**

- Matches any file containing the specified numbers
- Supports all image formats (JPG, RAW, TIFF, PNG, etc.)
- Can match multiple files per number (e.g., RAW + JPG of same shot)

### 📁 **Smart Destination Folders**

- **Auto-create**: Just type a folder name, app creates it in Downloads
- **Manual select**: Browse to choose any existing folder
- **Live preview**: See the full path as you type

## 🧪 Test Cases

### Test Case 1: Simple Numbers

```
3185
3190
3194
3214
```

### Test Case 2: Bullet Points

```
• 3551
• 3555
• 3563
• 3571
```

### Test Case 3: Numbered List

```
1. 5504
2. 5520
3. 5532
4. 5533
```

### Test Case 4: Mixed Format

```
• 3185
2. 3190
3194
• 3214
```

### Test Case 5: Leading Zeros & Number Matching

```
1503
01503
005504
ZVE01503
```

Tests the improved number matching that handles:

- Input "1503" → finds "ZVE01503.JPG", "IMG_1503.RAW"
- Input "01503" → finds files with or without leading zeros
- Input "005504" → matches "5504" in filenames

## 📋 How to Test

1. **Paste any test case** into the text area
2. **Check the preview** - should show "📋 Parsed numbers: 3185, 3190, 3194, 3214"
3. **Select source folder** with your photos
4. **See matching files** - shows "🔍 Found X matching files"
5. **Choose destination mode**:
   - **Create in Downloads**: Type folder name (e.g., "Client Wedding Selection")
   - **Select existing**: Browse to any folder
6. **Copy files** - detailed results show input → matched file mapping

### Test Destination Modes

#### Mode 1: Auto-Create in Downloads

1. Select "Create in Downloads" radio button
2. Type folder name: "Wedding Photos Final"
3. See preview: "📁 ~/Downloads/Wedding Photos Final"
4. Copy files - folder is automatically created

#### Mode 2: Manual Folder Selection

1. Select "Select existing folder" radio button
2. Click "Browse" to choose any folder
3. Copy files to selected location

## 🎯 Real-World Scenarios

### Wedding Photographer

Client sends: "I love photos 1234, 1240, 1267"
→ Finds: `WED_1234.JPG`, `WED_1234.RAW`, `WED_1240.JPG`, etc.

### Event Photographer

Client sends numbered list from gallery review
→ Automatically extracts just the photo numbers
→ Finds all matching files regardless of prefix

### Studio Workflow

Photo editor gets mixed format list from client
→ Smart parsing handles any format
→ Preview shows exactly what will be copied

## 💡 Features

- ✅ **Safe copying** (originals preserved)
- ✅ **Batch processing** (handles hundreds of photos)
- ✅ **Format agnostic** (works with any file naming)
- ✅ **Error reporting** (shows what failed and why)
- ✅ **Progress feedback** (real-time status updates)
- ✅ **Multiple formats** (copies both RAW + JPG if both exist)

---

**Try it now!** The app should be running and ready to test with your photo collections.
