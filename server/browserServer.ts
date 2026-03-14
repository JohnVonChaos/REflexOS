import { chromium, Browser, Page } from 'playwright';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';

interface AgentScoreRow {
    id: number;
    task: string;
    model: string;
    success: number;
    duration_ms: number;
    iteration: number;
    timestamp: string;
}

const app = express();
app.use(express.json());

// Enable CORS for all origins
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

let browser: Browser | null = null;

// Realistic user agents (recent Chrome versions)
const USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

// Random viewport sizes (common resolutions)
const VIEWPORTS = [
    { width: 1920, height: 1080 },
    { width: 1366, height: 768 },
    { width: 1536, height: 864 },
    { width: 1440, height: 900 }
];

function randomChoice<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function getBrowser(): Promise<Browser> {
    if (!browser) {
        console.log('[Server] Launching Browser (humanized)...');
        browser = await chromium.launch({
            headless: false,
            args: [
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-web-security',
                '--disable-features=IsolateOrigins,site-per-process'
            ]
        });
    }
    return browser;
}

// Simulate human-like mouse movements
async function humanMouseMove(page: Page) {
    const viewport = page.viewportSize();
    if (!viewport) return;

    // Random movements
    for (let i = 0; i < 3; i++) {
        const x = Math.floor(Math.random() * viewport.width);
        const y = Math.floor(Math.random() * viewport.height);
        await page.mouse.move(x, y, { steps: 10 });
        await page.waitForTimeout(Math.random() * 200 + 100);
    }
}

// Simulate human-like scrolling
async function humanScroll(page: Page) {
    const scrolls = Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < scrolls; i++) {
        await page.evaluate(() => {
            window.scrollBy({
                top: Math.random() * 300 + 100,
                behavior: 'smooth'
            });
        });
        await page.waitForTimeout(Math.random() * 500 + 300);
    }
}

// Fetch FULL content from a URL - for Llama4 Maverick's million tokens!
async function fetchPageContent(page: Page, url: string): Promise<{ title: string; snippet: string }> {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

        // Wait for content to load
        await page.waitForTimeout(1000);

        const content = await page.evaluate(() => {
            // Get title
            const title = document.querySelector('h1')?.textContent?.trim() ||
                document.title || '';

            // Get ALL article content - the whole damn thing!
            let fullText = '';

            // Try to find the main content area
            const contentArea = document.querySelector('article, main, .content, .article-body, .entry-content, #content, .post-content') ||
                document.body;

            if (contentArea) {
                // Get all paragraphs, headings, and list items
                const elements = contentArea.querySelectorAll('p, h1, h2, h3, h4, li');
                elements.forEach(el => {
                    const text = el.textContent?.trim();
                    if (text && text.length > 10) {
                        fullText += text + '\n\n';
                    }
                });
            }

            // If we got nothing, try just getting all text
            if (!fullText) {
                fullText = document.body?.innerText || '';
            }

            return {
                title: title,
                snippet: fullText.substring(0, 50000) // 50k chars per page for full content
            };
        });

        console.log(`[Server] Scraped ${content.snippet.length} chars from ${url.substring(0, 40)}...`);
        return content;
    } catch (e: any) {
        console.log(`[Server] Failed to fetch ${url}: ${e.message}`);
        return { title: '', snippet: '' };
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', message: 'Playwright search server is running' });
});

// ─── CODING AGENT ENDPOINTS ────────────────────────────────────────────────

/** POST /run-agent  { task }  → CodingTaskResult */
app.post('/run-agent', async (req, res) => {
    const { task } = req.body;
    if (!task || !task.id || !task.cwd || !task.test_command) {
        return res.status(400).json({ error: 'task.id, task.cwd, and task.test_command are required' });
    }

    const startTime = Date.now();
    const tempDir = path.join(__dirname, '../temp-coding-tasks', task.id);
    const taskJsonPath = path.join(tempDir, 'task.json');
    const agentPath = path.resolve(__dirname, '../agent.ts');
    const scoresPath = path.join(path.dirname(agentPath), 'agent_scores.json');
    const timeoutMs = task.timeout_ms ?? 60_000;

    try {
        // Write task files to temp dir
        fs.mkdirSync(tempDir, { recursive: true });
        for (const file of (task.files ?? [])) {
            const fp = path.join(tempDir, file.path);
            fs.mkdirSync(path.dirname(fp), { recursive: true });
            fs.writeFileSync(fp, file.content, 'utf-8');
        }
        fs.writeFileSync(taskJsonPath, JSON.stringify(task, null, 2));

        // Spawn: npx tsx agent.ts task.json
        const result = await new Promise<{ stdout: string; stderr: string; code: number }>((resolve, reject) => {
            let stdout = '';
            let stderr = '';
            let timedOut = false;

            const timer = setTimeout(() => {
                timedOut = true;
                proc.kill();
            }, timeoutMs);

            const proc = spawn('npx', ['tsx', agentPath, taskJsonPath], {
                cwd: path.dirname(agentPath),
                shell: process.platform === 'win32',
            });

            proc.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
            proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
            proc.on('close', (code: number | null) => {
                clearTimeout(timer);
                resolve({ stdout, stderr, code: timedOut ? 124 : (code ?? 1) });
            });
            proc.on('error', (err: Error) => { clearTimeout(timer); reject(err); });
        });

        const duration_ms = Date.now() - startTime;
        const success = result.code === 0;

        // Read model + iteration from JSON scores file
        let modelUsed = 'unknown';
        let iterationCount = 0;
        try {
            if (fs.existsSync(scoresPath)) {
                const scores: AgentScoreRow[] = JSON.parse(fs.readFileSync(scoresPath, 'utf-8'));
                const row = scores.filter(r => r.task === task.id).at(-1);
                if (row) { modelUsed = row.model; iterationCount = row.iteration; }
            }
        } catch { /* ignore */ }

        // Append this run to the scores file
        const newRow: AgentScoreRow = {
            id: Date.now(),
            task: task.id,
            model: modelUsed,
            success: success ? 1 : 0,
            duration_ms: Date.now() - startTime,
            iteration: iterationCount,
            timestamp: new Date().toISOString(),
        };
        try {
            const existing: AgentScoreRow[] = fs.existsSync(scoresPath)
                ? JSON.parse(fs.readFileSync(scoresPath, 'utf-8'))
                : [];
            existing.push(newRow);
            fs.writeFileSync(scoresPath, JSON.stringify(existing, null, 2));
        } catch { /* ignore */ }

        res.json({
            taskId: task.id,
            success,
            output: `${result.stdout}\n${result.stderr}`,
            error: success ? undefined : `Agent exited with code ${result.code}`,
            duration_ms,
            modelUsed,
            iterationCount,
            dbPath: scoresPath,
        });
    } catch (err: any) {
        res.status(500).json({
            taskId: task.id,
            success: false,
            output: '',
            error: err.message,
            duration_ms: Date.now() - startTime,
            iterationCount: 0,
            dbPath: '',
        });
    }
});

/** GET /agent-leaderboard?limit=N  → AgentScoreRow[] */
app.get('/agent-leaderboard', (req, res) => {
    const limit = parseInt(String(req.query.limit ?? '20'), 10);
    const agentPath = path.resolve(__dirname, '../agent.ts');
    const scoresPath = path.join(path.dirname(agentPath), 'agent_scores.json');
    try {
        if (!fs.existsSync(scoresPath)) return res.json([]);
        const scores: AgentScoreRow[] = JSON.parse(fs.readFileSync(scoresPath, 'utf-8'));
        res.json(scores.slice(-limit).reverse());
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/** GET /agent-models  → string[] */
app.get('/agent-models', (req, res) => {
    const agentPath = path.resolve(__dirname, '../agent.ts');
    try {
        const output = execSync(`npx tsx "${agentPath}" models`, { encoding: 'utf-8' });
        const models = output.split('\n').map(l => l.trim()).filter(Boolean);
        res.json(models);
    } catch {
        res.json([]);
    }
});

// ─── END CODING AGENT ENDPOINTS ────────────────────────────────────────────

// ─── FILE SYSTEM ENDPOINTS FOR AGENT ──────────────────────────────────────

/** GET /api/fs/list?path=<dir>  → { files: FileItem[], directories: FileItem[], error?: string } */
app.get('/api/fs/list', (req, res) => {
    const targetPath = req.query.path as string || process.cwd();
    
    try {
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: `Directory not found: ${targetPath}`, files: [], directories: [] });
        }
        
        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: `Path is not a directory: ${targetPath}`, files: [], directories: [] });
        }
        
        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const files = items
            .filter(item => item.isFile())
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name),
                size: fs.statSync(path.join(targetPath, item.name)).size,
                modified: fs.statSync(path.join(targetPath, item.name)).mtime.toISOString(),
            }));
        
        const directories = items
            .filter(item => item.isDirectory())
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name),
                size: 0,
                modified: fs.statSync(path.join(targetPath, item.name)).mtime.toISOString(),
            }));
        
        res.json({ files, directories });
    } catch (err: any) {
        res.status(500).json({ error: err.message, files: [], directories: [] });
    }
});

/** GET /api/fs/read?path=<file>  → { content: string, error?: string } */
app.get('/api/fs/read', (req, res) => {
    const filePath = req.query.path as string;
    
    if (!filePath) {
        return res.status(400).json({ error: 'path parameter is required' });
    }
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `File not found: ${filePath}` });
        }
        
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return res.status(400).json({ error: `Path is not a file: ${filePath}` });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/fs/write  { path: string, content: string }  → { success: boolean, error?: string } */
app.post('/api/fs/write', (req, res) => {
    const { path: filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
        return res.status(400).json({ success: false, error: 'path and content are required' });
    }
    
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /api/fs/mkdir  { path: string }  → { success: boolean, error?: string } */
app.post('/api/fs/mkdir', (req, res) => {
    const { path: dirPath } = req.body;
    
    if (!dirPath) {
        return res.status(400).json({ success: false, error: 'path is required' });
    }
    
    try {
        fs.mkdirSync(dirPath, { recursive: true });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** DELETE /api/fs/delete?path=<file>  → { success: boolean, error?: string } */
app.delete('/api/fs/delete', (req, res) => {
    const filePath = req.query.path as string;
    
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'path parameter is required' });
    }
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: `Path not found: ${filePath}` });
        }
        
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── END FILE SYSTEM ENDPOINTS ─────────────────────────────────────────────

// ─── FILE SYSTEM ENDPOINTS FOR AGENT ──────────────────────────────────────────

/** GET /api/fs/list?path=<dir>  → { files: FileItem[], directories: FileItem[], error?: string } */
app.get('/api/fs/list', (req, res) => {
    const targetPath = req.query.path as string || process.cwd();
    
    try {
        if (!fs.existsSync(targetPath)) {
            return res.status(404).json({ error: `Directory not found: ${targetPath}`, files: [], directories: [] });
        }
        
        const stats = fs.statSync(targetPath);
        if (!stats.isDirectory()) {
            return res.status(400).json({ error: `Path is not a directory: ${targetPath}`, files: [], directories: [] });
        }
        
        const items = fs.readdirSync(targetPath, { withFileTypes: true });
        const files = items
            .filter(item => item.isFile())
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name),
                size: fs.statSync(path.join(targetPath, item.name)).size,
                modified: fs.statSync(path.join(targetPath, item.name)).mtime.toISOString(),
            }));
        
        const directories = items
            .filter(item => item.isDirectory())
            .map(item => ({
                name: item.name,
                path: path.join(targetPath, item.name),
                size: 0,
                modified: fs.statSync(path.join(targetPath, item.name)).mtime.toISOString(),
            }));
        
        res.json({ files, directories });
    } catch (err: any) {
        res.status(500).json({ error: err.message, files: [], directories: [] });
    }
});

/** GET /api/fs/read?path=<file>  → { content: string, error?: string } */
app.get('/api/fs/read', (req, res) => {
    const filePath = req.query.path as string;
    
    if (!filePath) {
        return res.status(400).json({ error: 'path parameter is required' });
    }
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ error: `File not found: ${filePath}` });
        }
        
        const stats = fs.statSync(filePath);
        if (!stats.isFile()) {
            return res.status(400).json({ error: `Path is not a file: ${filePath}` });
        }
        
        const content = fs.readFileSync(filePath, 'utf-8');
        res.json({ content });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/** POST /api/fs/write  { path: string, content: string }  → { success: boolean, error?: string } */
app.post('/api/fs/write', (req, res) => {
    const { path: filePath, content } = req.body;
    
    if (!filePath || content === undefined) {
        return res.status(400).json({ success: false, error: 'path and content are required' });
    }
    
    try {
        // Create directory if it doesn't exist
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(filePath, content, 'utf-8');
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** POST /api/fs/mkdir  { path: string }  → { success: boolean, error?: string } */
app.post('/api/fs/mkdir', (req, res) => {
    const { path: dirPath } = req.body;
    
    if (!dirPath) {
        return res.status(400).json({ success: false, error: 'path is required' });
    }
    
    try {
        fs.mkdirSync(dirPath, { recursive: true });
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

/** DELETE /api/fs/delete?path=<file>  → { success: boolean, error?: string } */
app.delete('/api/fs/delete', (req, res) => {
    const filePath = req.query.path as string;
    
    if (!filePath) {
        return res.status(400).json({ success: false, error: 'path parameter is required' });
    }
    
    try {
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({ success: false, error: `Path not found: ${filePath}` });
        }
        
        const stats = fs.statSync(filePath);
        if (stats.isDirectory()) {
            fs.rmSync(filePath, { recursive: true, force: true });
        } else {
            fs.unlinkSync(filePath);
        }
        
        res.json({ success: true });
    } catch (err: any) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ─── END FILE SYSTEM ENDPOINTS ─────────────────────────────────────────────

app.post('/search', async (req, res) => {
    const { query, maxResults = 5 } = req.body;

    if (!query) {
        return res.status(400).json({ error: 'Query is required' });
    }

    console.log(`[Server] Searching: ${query}`);

    let page: Page | null = null;
    try {
        const browserInstance = await getBrowser();

        // Create context with random user agent and viewport
        const context = await browserInstance.newContext({
            userAgent: randomChoice(USER_AGENTS),
            viewport: randomChoice(VIEWPORTS),
            locale: 'en-US',
            timezoneId: 'America/New_York',
            permissions: [],
            extraHTTPHeaders: {
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'DNT': '1',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });

        page = await context.newPage();

        // Inject stealth scripts to hide automation
        await page.addInitScript(() => {
            // Override navigator.webdriver
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });

            // Override plugins
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });

            // Override languages
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en']
            });

            // Chrome runtime
            (window as any).chrome = {
                runtime: {}
            };

            // Permissions
            const originalQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters: any) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: 'denied' } as PermissionStatus)
                    : originalQuery(parameters);
        });

        // Bing search with human-like behavior
        const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

        // Random delay before navigation (1-3 seconds)
        await page.waitForTimeout(Math.random() * 2000 + 1000);

        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });

        // Human-like behavior after page load
        await page.waitForTimeout(Math.random() * 1000 + 1500);
        await humanMouseMove(page);
        await page.waitForTimeout(Math.random() * 500 + 500);
        await humanScroll(page);

        // Get URLs from Bing search results
        const urls = await page.evaluate(() => {
            const items: { url: string; title: string }[] = [];

            // Bing uses li.b_algo for organic results
            const results = document.querySelectorAll('li.b_algo');

            results.forEach(result => {
                if (items.length >= 5) return;

                const titleLink = result.querySelector('h2 a');
                if (!titleLink) return;

                const href = titleLink.getAttribute('href') || '';
                const title = titleLink.textContent?.trim() || '';

                // Skip Bing internal links and ads
                if (href.includes('bing.com') ||
                    href.includes('microsoft.com/en-us/bing') ||
                    !href.startsWith('http')) {
                    return;
                }

                if (title && href && !items.find(i => i.url === href)) {
                    items.push({ url: href, title });
                }
            });

            return items;
        });

        console.log(`[Server] Found ${urls.length} URLs, fetching content...`);

        // Fetch actual content from each URL with random delays
        const results = [];
        for (const item of urls) {
            // Longer random delay (2-5 seconds) to look more human
            const delay = Math.floor(Math.random() * 3000) + 2000;
            console.log(`[Server] Waiting ${delay}ms, then fetching: ${item.url.substring(0, 50)}...`);
            await new Promise(resolve => setTimeout(resolve, delay));

            const content = await fetchPageContent(page, item.url);
            results.push({
                title: content.title || item.title,
                url: item.url,
                snippet: content.snippet
            });
        }

        // await page.close();
        // await context.close();

        console.log(`[Server] Done! ${results.length} results with content`);
        res.json(results);

    } catch (error: any) {
        console.error('[Server] Search error:', error.message);
        // if (page) await page.close();
        res.status(500).json({ error: error.message });
    }
});

const PORT = 3005;
app.listen(PORT, () => {
    console.log(`Browser Agent Server running on port ${PORT}`);
});

// Cleanup on exit
process.on('SIGINT', async () => {
    if (browser) {
        await browser.close();
    }
    process.exit(0);
});
