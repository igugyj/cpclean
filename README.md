# CompareCleaner

Scan your project for unreferenced files and safely clean them up.

---

## Features

- Scan target folders for files not referenced in any source files
- Customizable via `.vscode/cpcleaner.jsonc` (extensions, exclusions, delimiters)
- Incremental cache for faster subsequent scans
- Safe deletion: files go to system trash (recoverable)
- Cancel anytime during scanning
- Git-aware: respects `.gitignore`

---

## Quick Start

### Installation

Install from VS Code Marketplace, or manually via `.vsix` file.

### Open Panel

- Click `$(search) CPC` on the status bar
- Or run command **`CompareCleaner: Open Panel`**

### First Use

1. Confirm **Scan Roots** (defaults to current workspace)
2. Confirm **Reference Sources** (auto-collects `*.md`, `*.txt`, `*.rst`, etc.)
3. Click **Run Scan**
4. Review the list of unreferenced files (double-click to preview)
5. Select files to delete and click **Clean Up** (moves to trash)

---

## Configuration

Configuration file: `.vscode/cpcleaner.jsonc` (JSON with comments).

Click the **Settings** button in the panel to generate the template automatically.

### Options

| Field                 | Type                    | Default                                             | Description                                               |
| :-------------------- | :---------------------- | :-------------------------------------------------- | :-------------------------------------------------------- |
| `referenceExtensions` | `string[]`              | `["md","txt","rst","html","tsx","css","py","json"]` | Reference file extensions (no dot)                        |
| `targetExtensions`    | `string[]`              | `["png","jpg","jpeg","gif","svg","ico","webp"]`     | Target file extensions (no dot)                           |
| `excludeFolders`      | `string[]`              | `["node_modules","dist",".git","__pycache__"]`      | Folders to exclude                                        |
| `pairs`               | `Record<string,string>` | see below                                           | Delimiter pairs for filename extraction                   |
| `scanRoot`            | `string`                | `""`                                                | Scan root (relative to workspace); empty = workspace root |
| `allowExternalScan`   | `boolean`               | `false`                                             | Allow scanning outside workspace                          |

### Default Delimiters

```json
"pairs": {
  "(": ")",
  "\"": "\"",
  "'": "'",
  "`": "`",
  "[": "]",
  "<": ">"
}
```

### Example Configuration

```json
{
  "referenceExtensions": ["md", "txt", "rst", "adoc"],
  "targetExtensions": [
    "png",
    "jpg",
    "jpeg",
    "gif",
    "svg",
    "ico",
    "webp",
    "mp4"
  ],
  "excludeFolders": ["node_modules", "dist", ".git", "__pycache__", "vendor"],
  "pairs": {
    "(": ")",
    "\"": "\"",
    "'": "'",
    "`": "`",
    "[": "]",
    "<": ">"
  },
  "scanRoot": "",
  "allowExternalScan": false
}
```

---

## Matching Rules

A target file is considered "referenced" if its filename appears in any reference file through either of the following methods:

### 1. Delimiter Extraction (Exact)

Extracts filenames (with extension) surrounded by delimiter pairs.

**Examples:**

| Reference Content   | Matched Result |
| :------------------ | :------------- |
| `(assets/logo.png)` | `logo.png`     |
| `![alt](photo.jpg)` | `photo.jpg`    |
| `"image.svg"`       | `image.svg`    |

### 2. Text Inclusion (Fallback)

If delimiter extraction fails, the entire reference content is searched for the filename. This handles delimiter-free references such as YAML lists.

**Example:**

```yaml
- assets/banner.png
- assets/icon.svg
```

Both methods are combined: if a filename appears in any reference file, it is marked as "referenced".

> Only the filename (with extension) is matched, not the full path. For example, both `assets/logo.png` and `images/logo.png` will match `logo.png`.

---

## Usage Guide

| Action                | Description                                                         |
| :-------------------- | :------------------------------------------------------------------ |
| **Scan Roots**        | Defaults to current workspace; add/remove multiple folders manually |
| **Reference Sources** | Auto-collected by default; manually add/remove specific files       |
| **Run Scan**          | Start scanning; supports cancellation                               |
| **Remove Selected**   | Remove selected files from the list (does not delete files)         |
| **Clear List**        | Clear all unreferenced files from the list                          |
| **Clear Cache**       | Delete incremental cache; forces full scan next time                |
| **Clean Up**          | Move selected files to system trash (recoverable)                   |
| **Double-click File** | Preview file in VS Code                                             |
| **Reset**             | Restore all states to initial values                                |
| **Settings**          | Open `.vscode/cpcleaner.jsonc` configuration file                   |

---

## Notes

- Deleted files go to the system **Trash** and can be restored manually
- Review the list carefully before cleaning to avoid accidental deletion
- If configuration file has syntax errors, defaults will be used with a warning notification
- External directory scanning is disabled by default; enable via `allowExternalScan: true`
- `.gitignore` entries are automatically excluded from both scan roots and reference sources

---

## Technical Details

- **Target File Collection**: Recursively traverse scan roots, filter by `targetExtensions`
- **Reference File Collection**: Recursively traverse workspace, filter by `referenceExtensions`, respect `.gitignore`
- **Cache**: Stores `mtime`, `size`, `isReferenced` per file; subsequent scans only process changed files
- **Concurrency**: Single-threaded recursion with `AbortSignal` for safe cancellation
- **Error Handling**: Skip directories with permission errors; continue scanning

---

## License

MIT
