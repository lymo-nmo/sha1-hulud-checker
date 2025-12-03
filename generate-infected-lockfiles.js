#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DEMO_DIR = join(__dirname, 'demo');
const AFFECTED_PACKAGES_FILE = join(__dirname, 'affected_packages.csv');

// Source files
const PACKAGE_LOCK_SOURCE = join(DEMO_DIR, 'package-lock.json');
const PNPM_LOCK_SOURCE = join(DEMO_DIR, 'pnpm-lock.yaml');

// Output files (with _inf suffix)
const PACKAGE_LOCK_OUTPUT = join(DEMO_DIR, 'package-lock_inf.json');
const PNPM_LOCK_OUTPUT = join(DEMO_DIR, 'pnpm-lock_inf.yaml');

/**
 * Parse affected packages from CSV
 */
function parseAffectedPackages(csvPath) {
  const content = readFileSync(csvPath, 'utf-8');
  const lines = content.trim().split('\n');
  const packages = [];
  
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    // Parse CSV with semicolon delimiter and quoted values
    const match = line.match(/"([^"]+)";"([^"]+)"/);
    if (match) {
      const [, packageName, version] = match;
      packages.push({ packageName, version });
    }
  }
  
  return packages;
}

/**
 * Get N random items from an array
 */
function getRandomItems(array, count) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate a fake SHA-512 integrity hash
 */
function generateFakeIntegrity() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let hash = '';
  for (let i = 0; i < 86; i++) {
    hash += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `sha512-${hash}==`;
}

/**
 * Inject packages into npm package-lock.json
 */
function injectIntoPackageLock(sourcePath, outputPath, packagesToInject) {
  const content = readFileSync(sourcePath, 'utf-8');
  const lockfile = JSON.parse(content);
  
  // Ensure packages object exists
  if (!lockfile.packages) {
    lockfile.packages = {};
  }
  
  console.log(`\n📦 Injecting ${packagesToInject.length} package(s) into package-lock.json:`);
  
  for (const pkg of packagesToInject) {
    const key = `node_modules/${pkg.packageName}`;
    
    // Create a realistic-looking package entry
    lockfile.packages[key] = {
      version: pkg.version,
      resolved: `https://registry.npmjs.org/${pkg.packageName}/-/${pkg.packageName.replace('@', '').replace('/', '-')}-${pkg.version}.tgz`,
      integrity: generateFakeIntegrity(),
    };
    
    console.log(`   • ${pkg.packageName}@${pkg.version}`);
  }
  
  // Write the modified lockfile
  writeFileSync(outputPath, JSON.stringify(lockfile, null, 2));
  console.log(`   ✅ Written to: ${outputPath}`);
}

/**
 * Inject packages into pnpm-lock.yaml
 */
function injectIntoPnpmLock(sourcePath, outputPath, packagesToInject) {
  let content = readFileSync(sourcePath, 'utf-8');
  
  console.log(`\n📦 Injecting ${packagesToInject.length} package(s) into pnpm-lock.yaml:`);
  
  // Find the packages section (or snapshots section for newer pnpm)
  // We'll look for either "packages:" or "snapshots:" section
  let insertPoint = content.indexOf('\npackages:');
  let sectionName = 'packages';
  
  if (insertPoint === -1) {
    insertPoint = content.indexOf('\nsnapshots:');
    sectionName = 'snapshots';
  }
  
  if (insertPoint === -1) {
    // If no packages section exists, append one at the end
    content += '\n\npackages:\n';
    insertPoint = content.length;
    sectionName = 'packages';
  } else {
    // Move past the section header line
    insertPoint = content.indexOf('\n', insertPoint + 1);
    if (insertPoint === -1) {
      insertPoint = content.length;
    }
  }
  
  // Generate YAML entries for each package
  let yamlEntries = '\n';
  
  for (const pkg of packagesToInject) {
    const integrity = generateFakeIntegrity();
    
    // Format depends on pnpm lockfile version
    // Modern format: 'package@version':
    yamlEntries += `  '${pkg.packageName}@${pkg.version}':\n`;
    yamlEntries += `    resolution: {integrity: ${integrity}}\n`;
    yamlEntries += `    engines: {node: '>=14'}\n`;
    yamlEntries += `\n`;
    
    console.log(`   • ${pkg.packageName}@${pkg.version}`);
  }
  
  // Insert the entries after the packages/snapshots section header
  const before = content.slice(0, insertPoint);
  const after = content.slice(insertPoint);
  content = before + yamlEntries + after;
  
  // Write the modified lockfile
  writeFileSync(outputPath, content);
  console.log(`   ✅ Written to: ${outputPath}`);
}

function main() {
  console.log('🧪 Infected Lockfile Generator\n');
  console.log('═'.repeat(50));
  
  // Parse affected packages
  const allAffectedPackages = parseAffectedPackages(AFFECTED_PACKAGES_FILE);
  console.log(`📋 Loaded ${allAffectedPackages.length} affected packages from CSV`);
  
  // Randomly select 1-5 packages to inject
  const numPackages = Math.floor(Math.random() * 5) + 1; // 1 to 5
  const selectedPackages = getRandomItems(allAffectedPackages, numPackages);
  
  console.log(`🎲 Randomly selected ${numPackages} package(s) to inject`);
  
  // Inject into package-lock.json
  injectIntoPackageLock(PACKAGE_LOCK_SOURCE, PACKAGE_LOCK_OUTPUT, selectedPackages);
  
  // Inject into pnpm-lock.yaml
  injectIntoPnpmLock(PNPM_LOCK_SOURCE, PNPM_LOCK_OUTPUT, selectedPackages);
  
  console.log('\n' + '═'.repeat(50));
  console.log('✅ Done! Now you can test with:');
  console.log('   node scan-lockfiles.js demo/');
  console.log('');
}

main();

