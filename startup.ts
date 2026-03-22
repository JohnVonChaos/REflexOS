#!/usr/bin/env node

/**
 * Startup launcher for ReflexOS dev server
 * Runs non-blocking health checks then launches Vite dev server
 */

import { spawn } from 'child_process';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { runStartupHealthCheck } from './services/startupHealthCheck.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Load AISettings from the session storage file if it exists
 * This allows us to access configured API keys and search modes
 */
async function loadAISettings(): Promise<any> {
  try {
    // Try to load from IndexedDB export or a config file
    // For now, return empty object - checks will handle missing config gracefully
    return {};
  } catch (error) {
    return {};
  }
}

/**
 * Launch the browser/express server (browserServer.ts) in the background.
 * Output is prefixed with [server] so it is distinguishable from Vite output.
 */
function launchBrowserServer(): void {
  console.log('[startup] Spawning browser server (port 3005)...');

  const server = spawn('npx', ['tsx', 'server/browserServer.ts'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
    cwd: __dirname,
  });

  server.stdout?.on('data', (data: Buffer) => {
    process.stdout.write(`[server] ${data.toString()}`);
  });

  server.stderr?.on('data', (data: Buffer) => {
    process.stderr.write(`[server] ${data.toString()}`);
  });

  server.on('error', (error: Error) => {
    console.error('[server] Failed to start browser server:', error.message);
  });

  server.on('close', (code: number | null) => {
    if (code !== 0 && code !== null) {
      console.warn(`[server] Browser server exited with code ${code}`);
    }
  });
}

/**
 * Launch Vite dev server
 */
function launchVite(): void {
  console.log('Spawning Vite dev server...\n');

  const vite = spawn('vite', [], {
    stdio: 'inherit',
    shell: true,
    cwd: __dirname,
  });

  vite.on('error', error => {
    console.error('❌ Failed to start Vite:', error.message);
    process.exit(1);
  });

  vite.on('close', code => {
    if (code !== 0) {
      console.error(`Vite exited with code ${code}`);
      process.exit(code);
    }
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    // Load AI settings (for Brave API key, search mode, etc.)
    const settings = await loadAISettings();

    // Run non-blocking health check pipeline
    // This will display status and optionally wait for keypress if there are warnings
    await runStartupHealthCheck(settings);

    // Launch the Express/Playwright browser server concurrently (port 3005)
    // This also serves as the Brave API proxy so the browser doesn't hit CORS.
    launchBrowserServer();

    // Launch Vite
    launchVite();
  } catch (error) {
    console.error('❌ Startup error:', error);
    process.exit(1);
  }
}

main();
