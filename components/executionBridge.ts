import express, { Request, Response } from 'express';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' }));

// ── CONFIG ──────────────────────────────────────────────────────────────────
// Point this at your ONNX Studio project root
const PROJECT_ROOT = process.env.BRIDGE_PROJECT_ROOT || path.resolve(__dirname, '../../onnx-studio');
const PORT = 3006;
const MAX_EXEC_MS = 30_000; // 30 second timeout on commands
// ────────────────────────────────────────────────────────────────────────────

// Prevent path traversal outside project root
function safePath(relativePath: string): string | null {
  const resolved = path.resolve(PROJECT_ROOT, relativePath);
  if (!resolved.startsWith(PROJECT_ROOT)) return null;
  return resolved;
}

// ── WRITE FILE ───────────────────────────────────────────────────────────────
// POST /write-file  { path: "src/foo/bar.ts", content: "..." }
app.post('/write-file', (req: Request, res: Response) => {
  const { path: filePath, content } = req.body;

  if (!filePath || content === undefined) {
    return res.status(400).json({ ok: false, error: 'path and content required' });
  }

  const abs = safePath(filePath);
  if (!abs) {
    return res.status(403).json({ ok: false, error: 'path traversal rejected' });
  }

  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    console.log(`[bridge] wrote ${abs}`);
    return res.json({ ok: true, path: abs });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── READ FILE ────────────────────────────────────────────────────────────────
// GET /read-file?path=src/foo/bar.ts
app.get('/read-file', (req: Request, res: Response) => {
  const filePath = req.query.path as string;

  if (!filePath) {
    return res.status(400).json({ ok: false, error: 'path query param required' });
  }

  const abs = safePath(filePath);
  if (!abs) {
    return res.status(403).json({ ok: false, error: 'path traversal rejected' });
  }

  try {
    const content = fs.readFileSync(abs, 'utf8');
    return res.json({ ok: true, content });
  } catch (err: any) {
    return res.status(404).json({ ok: false, error: err.message });
  }
});

// ── LIST FILES ───────────────────────────────────────────────────────────────
// GET /list-files?dir=src/visualize
app.get('/list-files', (req: Request, res: Response) => {
  const dirPath = (req.query.dir as string) || '';
  const abs = safePath(dirPath);

  if (!abs) {
    return res.status(403).json({ ok: false, error: 'path traversal rejected' });
  }

  try {
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const files = entries.map(e => ({
      name: e.name,
      type: e.isDirectory() ? 'dir' : 'file',
    }));
    return res.json({ ok: true, files });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// ── RUN COMMAND ──────────────────────────────────────────────────────────────
// POST /run-command  { command: "npm test", cwd: "." }
// cwd is relative to PROJECT_ROOT
app.post('/run-command', (req: Request, res: Response) => {
  const { command, cwd: relCwd } = req.body;

  if (!command) {
    return res.status(400).json({ ok: false, error: 'command required' });
  }

  // Whitelist safe commands — extend as needed
  const ALLOWED_PREFIXES = ['npm ', 'npx ', 'node ', 'tsc', 'vitest', 'jest', 'ts-node'];
  const isAllowed = ALLOWED_PREFIXES.some(p => command.startsWith(p));
  if (!isAllowed) {
    return res.status(403).json({ ok: false, error: `command not in allowlist: ${command}` });
  }

  const execCwd = relCwd ? safePath(relCwd) : PROJECT_ROOT;
  if (!execCwd) {
    return res.status(403).json({ ok: false, error: 'cwd path traversal rejected' });
  }

  console.log(`[bridge] exec: ${command} (cwd: ${execCwd})`);

  exec(command, { cwd: execCwd, timeout: MAX_EXEC_MS }, (err, stdout, stderr) => {
    return res.json({
      ok: !err || err.code !== undefined, // non-zero exit is still a valid result
      exitCode: err?.code ?? 0,
      stdout,
      stderr,
    });
  });
});

// ── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ ok: true, projectRoot: PROJECT_ROOT, port: PORT });
});

app.listen(PORT, () => {
  console.log(`[bridge] execution bridge running on http://localhost:${PORT}`);
  console.log(`[bridge] project root: ${PROJECT_ROOT}`);
});
