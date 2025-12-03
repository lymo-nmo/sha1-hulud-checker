#!/usr/bin/env node

import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOCKS_DIR = join(__dirname, 'locks');
const AFFECTED_PACKAGES_FILE = join(__dirname, 'affected_packages.csv');

// Common lockfile names to look for in project directories
const COMMON_LOCKFILES = [
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
];

function parseAffectedPackages(csvPath) {
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  
  // Skip header line
  const packages = new Map();
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV with semicolon delimiter and quoted values
    const match = line.match(/"([^"]+)";"([^"]+)"/);
    if (match) {
      const [, packageName, version] = match;
      const key = `${packageName}@${version}`;
      if (!packages.has(packageName)) {
        packages.set(packageName, new Set());
      }
      packages.get(packageName).add(version);
    }
  }
  
  return packages;
}

function scanLockfile(lockfilePath, affectedPackages) {
  const content = readFileSync(lockfilePath, 'utf-8');
  const found = [];
  const checked = new Set();
  
  // Detect file type and use appropriate parser
  const isJson = lockfilePath.endsWith('.json');
  
  if (isJson) {
    scanJsonLockfile(content, affectedPackages, found, checked);
  } else {
    scanYamlLockfile(content, affectedPackages, found, checked);
  }
  
  return found;
}

function scanJsonLockfile(content, affectedPackages, found, checked) {
  try {
    const lockfile = JSON.parse(content);
    
    // npm package-lock.json v2/v3 format: packages are in "packages" object
    // Keys are like "node_modules/@scope/package" or "node_modules/package"
    if (lockfile.packages) {
      for (const [key, value] of Object.entries(lockfile.packages)) {
        if (!value || !value.version) continue;
        
        // Extract package name from node_modules path
        // "node_modules/@scope/package" -> "@scope/package"
        // "node_modules/package" -> "package"
        // Also handle nested: "node_modules/foo/node_modules/bar" -> "bar"
        let packageName = key;
        
        // Handle node_modules prefix (take the last package in the path)
        const nodeModulesMatch = key.match(/node_modules\/(.+)$/);
        if (nodeModulesMatch) {
          packageName = nodeModulesMatch[1];
          // If there are nested node_modules, get the last package
          const lastNodeModules = packageName.lastIndexOf('node_modules/');
          if (lastNodeModules !== -1) {
            packageName = packageName.substring(lastNodeModules + 'node_modules/'.length);
          }
        }
        
        // Skip empty package name (root package)
        if (!packageName) continue;
        
        checkAndAddPackage(packageName, value.version, affectedPackages, found, checked);
      }
    }
    
    // npm package-lock.json v1 format: packages are in "dependencies" object (recursive)
    if (lockfile.dependencies) {
      scanNpmV1Dependencies(lockfile.dependencies, affectedPackages, found, checked);
    }
  } catch (e) {
    console.error(`Error parsing JSON lockfile: ${e.message}`);
  }
}

function scanNpmV1Dependencies(deps, affectedPackages, found, checked) {
  for (const [packageName, value] of Object.entries(deps)) {
    if (value && value.version) {
      checkAndAddPackage(packageName, value.version, affectedPackages, found, checked);
    }
    // Recurse into nested dependencies
    if (value && value.dependencies) {
      scanNpmV1Dependencies(value.dependencies, affectedPackages, found, checked);
    }
  }
}

function scanYamlLockfile(content, affectedPackages, found, checked) {
  const lines = content.split('\n');
  
  // Method 1: Match package entries in packages section format: 'package-name@version':
  // Also handles scoped packages like '@scope/package@version'
  const packageAtVersionRegex = /['"]?(@?[^@'"]+)@([^'":\s]+)['"]?:/g;
  
  let match;
  while ((match = packageAtVersionRegex.exec(content)) !== null) {
    const [, packageName, version] = match;
    checkAndAddPackage(packageName, version, affectedPackages, found, checked);
  }
  
  // Method 2: Match importers section format where package name and version are on separate lines:
  //   'package-name':
  //     specifier: ^X.Y.Z
  //     version: X.Y.Z
  let currentPackage = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Match package name lines like: '@scope/package': or 'package':
    // These appear indented in the importers section
    const pkgMatch = line.match(/^\s+['"]?(@?[\w\-./]+)['"]?:\s*$/);
    if (pkgMatch) {
      currentPackage = pkgMatch[1];
      continue;
    }
    
    // Match version lines like: version: X.Y.Z
    if (currentPackage) {
      const versionMatch = line.match(/^\s+version:\s*['"]?([^'"(\s]+)/);
      if (versionMatch) {
        const version = versionMatch[1];
        checkAndAddPackage(currentPackage, version, affectedPackages, found, checked);
        currentPackage = null;
      } else if (!line.match(/^\s+specifier:/)) {
        // Reset if we hit a line that's not specifier or version
        currentPackage = null;
      }
    }
  }
}

function checkAndAddPackage(packageName, version, affectedPackages, found, checked) {
  const key = `${packageName}@${version}`;
  
  // Avoid duplicate checks
  if (checked.has(key)) return;
  checked.add(key);
  
  // Check if this package+version is in affected list
  if (affectedPackages.has(packageName)) {
    const affectedVersions = affectedPackages.get(packageName);
    if (affectedVersions.has(version)) {
      found.push({ packageName, version });
    }
  }
}

function isLockfile(filename) {
  const lower = filename.toLowerCase();
  
  // Exact matches for common lockfiles
  if (COMMON_LOCKFILES.some(lf => lower === lf.toLowerCase())) {
    return true;
  }
  
  // Files with "lock" in the name
  if (lower.includes('lock')) {
    return lower.endsWith('.json') || 
           lower.endsWith('.yaml') || 
           lower.endsWith('.yml') ||
           lower.endsWith('.lock') ||
           lower.endsWith('.lockb');
  }
  
  return false;
}

// Directories to skip when recursively searching
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  'vendor',
  'dist',
  'build',
  '.next',
  '.nuxt',
  '.output',
  '.turbo',
  '.cache',
]);

function findLockfilesInProject(projectDir, recursive = true) {
  const found = [];
  
  // Check for common lockfiles in this directory
  for (const lockfile of COMMON_LOCKFILES) {
    const fullPath = join(projectDir, lockfile);
    if (existsSync(fullPath)) {
      found.push(fullPath);
    }
  }
  
  // Also check for any lockfile-like files in this directory
  try {
    const entries = readdirSync(projectDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = join(projectDir, entry.name);
      
      if (entry.isFile() && isLockfile(entry.name)) {
        // Add if not already in found list
        if (!found.includes(fullPath)) {
          found.push(fullPath);
        }
      } else if (recursive && entry.isDirectory() && !SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
        // Recursively search subdirectories (skip hidden dirs and common non-source dirs)
        const subFound = findLockfilesInProject(fullPath, true);
        found.push(...subFound);
      }
    }
  } catch (e) {
    // Ignore permission errors, etc.
  }
  
  return found;
}

function getLockfiles(pathArg, recursive = true) {
  if (pathArg) {
    // Check if it's a file or directory
    const stat = statSync(pathArg);
    if (stat.isDirectory()) {
      // Recursively find all lockfiles in the project
      return findLockfilesInProject(pathArg, recursive);
    }
    return [pathArg];
  }
  
  // Default: scan locks directory (non-recursive for the locks folder)
  return findLockfilesInProject(LOCKS_DIR, false);
}

function printHelp() {
  console.log(`
🔍 SHA1 Hulud Checker - Lockfile Scanner

Usage:
  node scan-lockfiles.js [options] [path]

Arguments:
  path          Path to a lockfile, project folder, or directory containing lockfiles
                (default: ./locks)

Options:
  -h, --help    Show this help message
  -q, --quiet   Only output results, no progress messages
  -j, --json    Output results as JSON

Supported Lockfiles:
  • package-lock.json (npm)
  • npm-shrinkwrap.json (npm)
  • pnpm-lock.yaml (pnpm)
  • yarn.lock (yarn)
  • bun.lockb / bun.lock (bun)

Recursive Search:
  When scanning a project folder, the script recursively searches all subdirectories
  for lockfiles, automatically skipping: node_modules, .git, vendor, dist, build, etc.

Examples:
  node scan-lockfiles.js                          # Scan all files in ./locks
  node scan-lockfiles.js /path/to/my-project      # Recursively find lockfiles in project
  node scan-lockfiles.js /path/to/monorepo        # Find lockfiles in all packages
  node scan-lockfiles.js pnpm-lock.yaml           # Scan a specific file
`);
}

function main() {
  const args = process.argv.slice(2);
  
  // Handle help flag
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    process.exit(0);
  }
  
  const quiet = args.includes('-q') || args.includes('--quiet');
  const jsonOutput = args.includes('-j') || args.includes('--json');
  const pathArg = args.find(a => !a.startsWith('-'));
  
  if (!jsonOutput) {
    console.log('🔍 SHA1 Hulud Checker - Lockfile Scanner\n');
  }
  
  // Parse affected packages
  const affectedPackages = parseAffectedPackages(AFFECTED_PACKAGES_FILE);
  
  let totalAffectedVersions = 0;
  for (const versions of affectedPackages.values()) {
    totalAffectedVersions += versions.size;
  }
  
  if (!jsonOutput && !quiet) {
    console.log(`📋 Loading affected packages from: ${AFFECTED_PACKAGES_FILE}`);
    console.log(`   Found ${affectedPackages.size} unique packages with ${totalAffectedVersions} affected versions\n`);
  }
  
  // Get lockfiles to scan
  const lockfiles = getLockfiles(pathArg);
  
  if (lockfiles.length === 0) {
    if (jsonOutput) {
      console.log(JSON.stringify({ error: 'No lockfiles found to scan', results: [] }));
    } else {
      console.log('❌ No lockfiles found to scan');
    }
    process.exit(1);
  }
  
  if (!jsonOutput && !quiet) {
    console.log(`📁 Scanning ${lockfiles.length} lockfile(s):\n`);
  }
  
  let totalFound = 0;
  const allResults = [];
  
  for (const lockfile of lockfiles) {
    const filename = basename(lockfile);
    
    if (!jsonOutput && !quiet) {
      console.log(`   🔎 ${filename}`);
    }
    
    const found = scanLockfile(lockfile, affectedPackages);
    
    if (found.length > 0) {
      totalFound += found.length;
      allResults.push({ lockfile: filename, packages: found });
      if (!jsonOutput && !quiet) {
        console.log(`      ⚠️  Found ${found.length} affected package(s)`);
      }
    } else {
      if (!jsonOutput && !quiet) {
        console.log(`      ✅ No affected packages found`);
      }
    }
  }
  
  // Output results
  if (jsonOutput) {
    console.log(JSON.stringify({
      totalAffectedPackages: totalFound,
      lockfilesScanned: lockfiles.length,
      lockfilesWithIssues: allResults.length,
      results: allResults
    }, null, 2));
  } else {
    console.log('\n' + '═'.repeat(60));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(60));
    
    if (totalFound === 0) {
      console.log('\n✅ No affected packages found in any lockfile!\n');
    } else {
      console.log(`\n⚠️  Found ${totalFound} affected package(s) across ${allResults.length} lockfile(s):\n`);
      
      for (const result of allResults) {
        console.log(`\n📄 ${result.lockfile}:`);
        console.log('─'.repeat(40));
        for (const pkg of result.packages) {
          console.log(`   • ${pkg.packageName}@${pkg.version}`);
        }
      }
      console.log('\n');
    }
  }
  
  process.exit(totalFound > 0 ? 1 : 0);
}

main();

