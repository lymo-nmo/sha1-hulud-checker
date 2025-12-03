# 🪱 SHA1 Hulud Checker

A fast, zero-dependency scanner that detects npm packages affected by SHA1 collision vulnerabilities in your lockfiles.

> *"The spice must flow... but not through compromised packages."*

## 🚨 What is this about?

A significant number of npm packages have been identified as potentially vulnerable due to SHA1 collision attacks. This tool scans your project's lockfiles to detect if any of these affected package versions are present in your dependency tree.

## ✨ Features

- **Multi-format support** — Scans all major JavaScript lockfile formats
- **Recursive scanning** — Automatically finds lockfiles in monorepos and nested projects
- **Zero dependencies** — Pure Node.js, no additional packages required
- **CI-friendly** — JSON output mode and exit codes for automation
- **Fast** — Efficiently parses lockfiles without external tools

## 📦 Supported Lockfiles

| Package Manager | Lockfile |
|----------------|----------|
| npm | `package-lock.json`, `npm-shrinkwrap.json` |
| pnpm | `pnpm-lock.yaml` |
| yarn | `yarn.lock` |
| bun | `bun.lockb`, `bun.lock` |

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/your-org/sha1-hulud-checker.git
cd sha1-hulud-checker

# Scan your project
node scan-lockfiles.js /path/to/your/project
```

## 📖 Usage

### Basic Usage

```bash
# Scan a specific project directory (recursively finds all lockfiles)
node scan-lockfiles.js /path/to/project

# Scan a specific lockfile
node scan-lockfiles.js /path/to/package-lock.json

# Scan the default ./locks directory
node scan-lockfiles.js
```

### Options

```
Usage:
  node scan-lockfiles.js [options] [path]

Arguments:
  path          Path to a lockfile, project folder, or directory containing lockfiles
                (default: ./locks)

Options:
  -h, --help    Show help message
  -q, --quiet   Only output results, no progress messages
  -j, --json    Output results as JSON
```

### npm Scripts

```bash
# Scan files in the ./locks directory
npm run scan

# Scan all lockfiles in ./locks
npm run scan:all
```

### JSON Output (CI/CD Integration)

```bash
node scan-lockfiles.js --json /path/to/project
```

Output:
```json
{
  "totalAffectedPackages": 2,
  "lockfilesScanned": 3,
  "lockfilesWithIssues": 1,
  "results": [
    {
      "lockfile": "package-lock.json",
      "packages": [
        { "packageName": "@example/package", "version": "1.2.3" },
        { "packageName": "another-pkg", "version": "4.5.6" }
      ]
    }
  ]
}
```

## 🔍 Example Output

```
🔍 SHA1 Hulud Checker - Lockfile Scanner

📋 Loading affected packages from: affected_packages.csv
   Found 847 unique packages with 1001 affected versions

📁 Scanning 3 lockfile(s):

   🔎 package-lock.json
      ⚠️  Found 2 affected package(s)
   🔎 pnpm-lock.yaml
      ✅ No affected packages found
   🔎 yarn.lock
      ✅ No affected packages found

════════════════════════════════════════════════════════════
📊 SUMMARY
════════════════════════════════════════════════════════════

⚠️  Found 2 affected package(s) across 1 lockfile(s):

📄 package-lock.json:
────────────────────────────────────
   • @example/package@1.2.3
   • another-pkg@4.5.6
```

## 🧪 Testing

Generate test lockfiles with injected vulnerable packages:

```bash
npm run generate:affected-locks
```

This creates `_inf` suffixed lockfiles in the `demo/` directory with randomly selected affected packages for testing purposes.

Then scan them:

```bash
node scan-lockfiles.js demo/
```

## 🏗️ Project Structure

```
sha1-hulud-checker/
├── scan-lockfiles.js           # Main scanner script
├── generate-infected-lockfiles.js  # Test data generator
├── affected_packages.csv       # Database of affected packages
├── demo/                       # Demo lockfiles for testing
│   ├── package-lock.json
│   └── pnpm-lock.yaml
├── locks/                      # Default scan directory
└── package.json
```

## 🔄 Exit Codes

| Code | Meaning |
|------|---------|
| `0` | No affected packages found |
| `1` | Affected packages detected (or no lockfiles found) |

This makes it easy to integrate into CI/CD pipelines:

```yaml
# GitHub Actions example
- name: Check for SHA1 vulnerabilities
  run: node scan-lockfiles.js --json . || exit 1
```

## 📋 Updating the Affected Packages List

The `affected_packages.csv` file contains the list of known affected packages. The format is:

```csv
"Packages";"Version"
"package-name";"1.2.3"
```

To update, replace or append to this file with newly identified packages.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 📄 License

MIT

---

<p align="center">
  <i>Named after Shai-Hulud, the great sandworms of Arrakis.<br/>
  They who control the lockfiles, control the supply chain.</i>
</p>

