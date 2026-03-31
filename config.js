/**
 * config.js — Loads environment variables for the Orchestrator
 *
 * Usage:
 *   import { config } from './config.js';
 *   console.log(config.ANTHROPIC_API_KEY);
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadEnv(filePath) {
  const vars = {};
  try {
    const content = readFileSync(filePath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();
      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      vars[key] = value;
    }
  } catch (err) {
    console.error(`⚠️  Could not load ${filePath}. Copy .env.example to .env and fill in your keys.`);
    console.error(`   Run: cp .env.example .env`);
  }
  return vars;
}

const envVars = loadEnv(resolve(__dirname, '.env'));

// Merge into process.env
for (const [key, value] of Object.entries(envVars)) {
  if (!process.env[key]) {
    process.env[key] = value;
  }
}

export const config = {
  // LLM Keys
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',

  // Model
  DEFAULT_MODEL: process.env.DEFAULT_MODEL || 'gemini-1.5-pro',

  // MCP
  CHROME_DEBUGGER_PORT: parseInt(process.env.CHROME_DEBUGGER_PORT || '9222', 10),
};

/**
 * Validates that at least one LLM API key is configured.
 * Call this at startup to fail fast if keys are missing.
 */
export function validateConfig() {
  const hasKey = config.ANTHROPIC_API_KEY || config.GOOGLE_API_KEY || config.OPENAI_API_KEY;
  if (!hasKey) {
    console.error('❌ No LLM API key found!');
    console.error('   1. Copy .env.example to .env:  cp .env.example .env');
    console.error('   2. Fill in at least one API key (ANTHROPIC_API_KEY or GOOGLE_API_KEY)');
    process.exit(1);
  }

  console.log(`✅ Config loaded. Using model: ${config.DEFAULT_MODEL}`);
  return true;
}
