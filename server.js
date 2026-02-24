const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const RESULTS_DIR = path.join(DATA_DIR, '.tmp');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);
const JSON_PATH = path.join(RESULTS_DIR, 'code-review-result.json');
const ACCEPTED_PATH = path.join(RESULTS_DIR, 'accepted-fixes.json');
const FRONTEND_DIST = path.join(DATA_DIR, 'frontend', 'dist');

// Git repo path — auto-detected from GIT_REPO_PATH env var or defaults
const GIT_REPO_PATH = process.env.GIT_REPO_PATH || '';
const DIFF_CACHE_PATH = path.join(RESULTS_DIR, 'diff-cache.json');

/**
 * Compute git diff between parentBranch and branch.
 * Always computes fresh from git, then caches as fallback for when branches are deleted/merged.
 * Returns the unified diff string, empty string (no changes), or null (error).
 */
function computeGitDiff(reviewData) {
    if (!reviewData || reviewData.mode !== 'branch-diff') return null;
    const { branch, parentBranch } = reviewData;
    if (!branch || !parentBranch) return null;

    // Determine repo path: env var, or try to find .git in common locations
    let repoPath = GIT_REPO_PATH;
    if (!repoPath) {
        const candidates = [
            path.join(DATA_DIR, '..', 'ApplicationSuite'),
            path.join(require('node:os').homedir(), 'git', 'ApplicationSuite'),
        ];
        for (const c of candidates) {
            if (fs.existsSync(path.join(c, '.git'))) { repoPath = c; break; }
        }
    }

    // Try live git diff first (always fresh)
    // Use parentBranch as base; if HEAD is on `branch`, diff against working tree
    // so uncommitted changes are included.
    if (repoPath) {
        try {
            // Check if we're currently on the target branch
            const currentBranch = execSync('git branch --show-current', { cwd: repoPath, encoding: 'utf-8' }).trim();
            let diff;
            if (currentBranch === branch) {
                // Diff base branch against working tree (includes uncommitted changes)
                diff = execSync(
                    `git diff ${parentBranch}`,
                    { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
                );
            } else {
                // Not on target branch — diff committed snapshots only
                diff = execSync(
                    `git diff ${parentBranch}..${branch}`,
                    { cwd: repoPath, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
                );
            }
            // Cache for fallback use (e.g., after branch deletion)
            fs.writeFileSync(DIFF_CACHE_PATH, JSON.stringify({ branch, parentBranch, diff, cachedAt: new Date().toISOString() }), 'utf-8');
            return diff;
        } catch (err) {
            console.error('Live git diff failed, trying cache:', err.message);
        }
    }

    // Fallback: use cached diff if branches no longer exist
    if (fs.existsSync(DIFF_CACHE_PATH)) {
        try {
            const cached = JSON.parse(fs.readFileSync(DIFF_CACHE_PATH, 'utf-8'));
            if (cached.branch === branch && cached.parentBranch === parentBranch && typeof cached.diff === 'string') {
                return cached.diff;
            }
        } catch { /* ignore corrupt cache */ }
    }

    return null;
}

function loadJson() {
    if (!fs.existsSync(JSON_PATH)) return null;
    const raw = fs.readFileSync(JSON_PATH, 'utf-8');
    return JSON.parse(raw);
}

function loadAcceptedFixes() {
    if (!fs.existsSync(ACCEPTED_PATH)) return { fixes: [] };
    return JSON.parse(fs.readFileSync(ACCEPTED_PATH, 'utf-8'));
}

function saveAcceptedFixes(data) {
    fs.writeFileSync(ACCEPTED_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => resolve(body));
        req.on('error', reject);
    });
}

const MIME_TYPES = {
    '.html': 'text/html',
    '.js':   'application/javascript',
    '.css':  'text/css',
    '.json': 'application/json',
    '.png':  'image/png',
    '.svg':  'image/svg+xml',
    '.ico':  'image/x-icon',
};

function serveStaticFile(res, filePath) {
    if (!fs.existsSync(filePath)) return false;
    const ext = path.extname(filePath);
    const mime = MIME_TYPES[ext] || 'application/octet-stream';
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': `${mime}; charset=utf-8` });
    res.end(content);
    return true;
}

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

    // API: return raw review JSON
    if (url.pathname === '/api/review') {
        const data = loadJson();
        res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(data ? JSON.stringify(data, null, 2) : JSON.stringify({ error: 'No review data found' }));
        return;
    }

    // API: return git diff for branch-diff reviews
    if (url.pathname === '/api/diff') {
        const data = loadJson();
        if (!data) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No review data found' }));
            return;
        }
        const diff = computeGitDiff(data);
        if (diff === null) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Diff not available. Set GIT_REPO_PATH env var or ensure the git repo is accessible.' }));
            return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            branch: data.branch,
            parentBranch: data.parentBranch,
            diff,
        }));
        return;
    }

    // API: get accepted fixes
    if (req.method === 'GET' && url.pathname === '/api/accepted-fixes') {
        const accepted = loadAcceptedFixes();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(accepted, null, 2));
        return;
    }

    // API: accept a single fix
    if (req.method === 'POST' && url.pathname === '/api/accept-fix') {
        try {
            const body = await readBody(req);
            const fix = JSON.parse(body);
            const accepted = loadAcceptedFixes();

            // Avoid duplicates by title+location+file
            const exists = accepted.fixes.some(f => f.title === fix.title && f.location === fix.location && f.file === fix.file);
            if (!exists) {
                fix.acceptedAt = new Date().toISOString();
                fix.applied = false;
                accepted.fixes.push(fix);
                saveAcceptedFixes(accepted);
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, total: accepted.fixes.length }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: mark fixes as applied
    if (req.method === 'PATCH' && url.pathname === '/api/accepted-fixes/mark-applied') {
        try {
            const body = await readBody(req);
            const { titles } = JSON.parse(body); // array of {file, title, location}
            const accepted = loadAcceptedFixes();
            let marked = 0;
            if (titles && Array.isArray(titles)) {
                titles.forEach(t => {
                    const fix = accepted.fixes.find(f => f.title === t.title && f.file === t.file && (f.location || '') === (t.location || ''));
                    if (fix && !fix.applied) {
                        fix.applied = true;
                        fix.appliedAt = new Date().toISOString();
                        marked++;
                    }
                });
            }
            saveAcceptedFixes(accepted);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, marked }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // API: clean up applied fixes (remove all where applied === true)
    if (req.method === 'DELETE' && url.pathname === '/api/accepted-fixes/applied') {
        const accepted = loadAcceptedFixes();
        const remaining = accepted.fixes.filter(f => !f.applied);
        const removed = accepted.fixes.length - remaining.length;
        saveAcceptedFixes({ fixes: remaining });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, removed, remaining: remaining.length }));
        return;
    }

    // API: clear accepted fixes
    if (req.method === 'DELETE' && url.pathname === '/api/accepted-fixes') {
        saveAcceptedFixes({ fixes: [] });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
        return;
    }

    // Dashboard — serve React build
    // Try static files from frontend/dist first, then fall back to index.html (SPA)
    if (url.pathname === '/' || url.pathname === '/dashboard') {
        const indexPath = path.join(FRONTEND_DIST, 'index.html');
        if (fs.existsSync(indexPath)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(fs.readFileSync(indexPath));
        } else {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('React app not built. Run "cd frontend && npm run build" first.');
        }
        return;
    }

    // Serve static assets from frontend/dist (JS, CSS, etc.)
    const staticPath = path.join(FRONTEND_DIST, url.pathname);
    if (serveStaticFile(res, staticPath)) return;

    // 404
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
});

server.listen(PORT, () => {
    console.log(`\n  X++ Code Review Dashboard`);
    console.log(`  ────────────────────────────`);
    console.log(`  Dashboard : http://localhost:${PORT}`);
    console.log(`  API       : http://localhost:${PORT}/api/review`);
    console.log(`  Accepted  : http://localhost:${PORT}/api/accepted-fixes`);
    console.log(`  Data file : ${JSON_PATH}`);
    console.log(`\n  Refresh the browser to pick up new review data.\n`);
});
