#!/usr/bin/env node
/**
 * deploy-helper.js — Update Existing Deployment
 *
 * Instead of creating new deployments (which breaks the URL),
 * this updates the EXISTING web app deployment in-place.
 * The URL stays the same forever.
 */

import { execSync } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GAS_DIR = __dirname + '/google-apps-script';

// The permanent deployment ID (from Manage Deployments in Apps Script editor)
const DEPLOY_ID = 'AKfycbwjAJntmuZ_DHYYrSVfOZ-WPGFO5m2mrxgZ9ydKDkh9_r_y86pQsU79eJPfv52nZZYy';

function run(cmd) {
  return execSync(cmd, { cwd: GAS_DIR, encoding: 'utf8', env: { ...process.env } }).trim();
}

console.log('🚀  Updating existing deployment...');

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
