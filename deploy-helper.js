#!/usr/bin/env node
/**
 * deploy-helper.js — Update Existing Deployment
 *
 * Instead of creating new deployments (which breaks the URL),
 * this updates the EXISTING web app deployment in-place.
 * The URL stays the same forever.
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import fs from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAS_DIR = join(__dirname, 'google-apps-script');

// Read deployment password from .env (which is ignored in git)
let DEPLOY_PASSWORD = 'sonic'; // Default fallback
try {
  const envContent = fs.readFileSync(join(__dirname, '.env'), 'utf8');
  const match = envContent.match(/^DEPLOY_PASSWORD=(.*)$/m);
  if (match) {
    DEPLOY_PASSWORD = match[1].trim();
  }
} catch (e) {
  console.warn('⚠️  Could not read .env file. Using default fallback password.');
}

// The permanent deployment ID (from Manage Deployments in Apps Script editor)
const DEPLOY_ID = 'AKfycbwjAJntmuZ_DHYYrSVfOZ-WPGFO5m2mrxgZ9ydKDkh9_r_y86pQsU79eJPfv52nZZYy';

function run(cmd) {
  return execSync(cmd, { cwd: GAS_DIR, encoding: 'utf8', env: { ...process.env } }).trim();
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.question('🔒 Enter deployment password to proceed: ', (answer) => {
  if (answer.trim() !== DEPLOY_PASSWORD) {
    console.error('\n❌ Incorrect password. Deployment aborted to prevent accidental overwrites.');
    rl.close();
    process.exit(1);
  }
  rl.close();

  console.log('\n🚀  Updating existing deployment...');

  try {
    const output = run(`npx -y @google/clasp deploy -i ${DEPLOY_ID} -d "Updated $(date '+%Y-%m-%d %H:%M')"`);
    console.log('   ' + output);
    console.log('\n✅  Done! Your web app is updated.');
    console.log('   Run: npm run open:web');
  } catch (e) {
    console.error('❌  Deploy failed:', e.message);
    console.error('\n   Try deploying manually:');
    console.error('   1. npm run open');
    console.error('   2. Deploy → Manage deployments → Edit → New version → Deploy');
    process.exit(1);
  }
});
