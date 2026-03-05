const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const RESULTS_DIR = path.join(DATA_DIR, '.tmp');
if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR);
const FRONTEND_DIST = path.join(DATA_DIR, 'frontend', 'dist');
const ENV_JSON_PATH = path.join(DATA_DIR, '.env.json');

// Git repo path — auto-detected from GIT_REPO_PATH env var or defaults
const GIT_REPO_PATH = process.env.GIT_REPO_PATH || '';

// ── Project helpers ──────────────────────────────────────────────────
function loadEnvJson() {
    if (!fs.existsSync(ENV_JSON_PATH)) return {};
    return JSON.parse(fs.readFileSync(ENV_JSON_PATH, 'utf-8'));
}

function saveEnvJson(data) {
    fs.writeFileSync(ENV_JSON_PATH, JSON.stringify(data, null, 4), 'utf-8');
}

/** Return the active project name (or null). */
function getActiveProject() {
    const env = loadEnvJson();
    return env.activeProject || null;
}

/** Return the .tmp directory for the active project, creating it if needed. */
function getProjectDir(projectName) {
    if (!projectName) return RESULTS_DIR; // fallback to root .tmp
    const dir = path.join(RESULTS_DIR, 'projects', projectName);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

/** Resolve project-scoped file paths. */
function getProjectPaths(projectName) {
    const dir = getProjectDir(projectName);
    return {
        dir,
        jsonPath: path.join(dir, 'code-review-result.json'),
        acceptedPath: path.join(dir, 'accepted-fixes.json'),
        diffCachePath: path.join(dir, 'diff-cache.json'),
    };
}

/** Get paths for current active project (or root .tmp fallback). */
function getActivePaths() {
    return getProjectPaths(getActiveProject());
}

/**
 * Compute git diff between parentBranch and branch.
 * Always computes fresh from git, then caches as fallback for when branches are deleted/merged.
 * Returns the unified diff string, empty string (no changes), or null (error).
 */
function computeGitDiff(reviewData, paths) {
    if (!reviewData || reviewData.mode !== 'branch-diff') return null;
    const { branch, parentBranch } = reviewData;
    if (!branch || !parentBranch) return null;

    // Determine repo path: env var, or try active project's solutionPath, or common locations
    let repoPath = GIT_REPO_PATH;
    if (!repoPath) {
        const env = loadEnvJson();
        const proj = env.activeProject && env.projects && env.projects[env.activeProject];
        if (proj && proj.solutionPath && fs.existsSync(path.join(proj.solutionPath, '.git'))) {
            repoPath = proj.solutionPath;
        }
    }
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
            fs.writeFileSync(paths.diffCachePath, JSON.stringify({ branch, parentBranch, diff, cachedAt: new Date().toISOString() }), 'utf-8');
            return diff;
        } catch (err) {
            console.error('Live git diff failed, trying cache:', err.message);
        }
    }

    // Fallback: use cached diff if branches no longer exist
    if (fs.existsSync(paths.diffCachePath)) {
        try {
            const cached = JSON.parse(fs.readFileSync(paths.diffCachePath, 'utf-8'));
            if (cached.branch === branch && cached.parentBranch === parentBranch && typeof cached.diff === 'string') {
                return cached.diff;
            }
        } catch { /* ignore corrupt cache */ }
    }

    return null;
}

function loadJson(paths) {
    if (!fs.existsSync(paths.jsonPath)) return null;
    const raw = fs.readFileSync(paths.jsonPath, 'utf-8');
    return JSON.parse(raw);
}

function loadAcceptedFixes(paths) {
    if (!fs.existsSync(paths.acceptedPath)) return { fixes: [] };
    return JSON.parse(fs.readFileSync(paths.acceptedPath, 'utf-8'));
}

function saveAcceptedFixes(paths, data) {
    fs.writeFileSync(paths.acceptedPath, JSON.stringify(data, null, 2), 'utf-8');
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

    // ── Project management APIs ──────────────────────────────────────

    // GET /api/projects — list all projects + active
    if (req.method === 'GET' && url.pathname === '/api/projects') {
        const env = loadEnvJson();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            sourceCodePath: env.sourceCodePath || '',
            activeProject: env.activeProject || null,
            projects: env.projects || {},
        }, null, 2));
        return;
    }

    // PUT /api/projects/active — switch active project { "name": "..." }
    if (req.method === 'PUT' && url.pathname === '/api/projects/active') {
        try {
            const body = await readBody(req);
            const { name } = JSON.parse(body);
            const env = loadEnvJson();
            if (!env.projects || !env.projects[name]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Project "${name}" not found` }));
                return;
            }
            env.activeProject = name;
            // Maintain backward compat: also set top-level solutionPath
            env.solutionPath = env.projects[name].solutionPath;
            saveEnvJson(env);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, activeProject: name }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // POST /api/projects — create a new project { "name": "...", "solutionPath": "...", "description": "..." }
    if (req.method === 'POST' && url.pathname === '/api/projects') {
        try {
            const body = await readBody(req);
            const { name, solutionPath, description } = JSON.parse(body);
            if (!name || !solutionPath) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'name and solutionPath are required' }));
                return;
            }
            // Validate project name (alphanumeric, hyphens, underscores, spaces)
            if (!/^[\w\s-]+$/.test(name)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid project name. Use alphanumeric, hyphens, underscores, or spaces.' }));
                return;
            }
            const env = loadEnvJson();
            if (!env.projects) env.projects = {};
            env.projects[name] = { solutionPath, description: description || '' };
            // If this is the first project, make it active
            if (!env.activeProject) {
                env.activeProject = name;
                env.solutionPath = solutionPath;
            }
            saveEnvJson(env);
            // Create project directory
            getProjectDir(name);
            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, project: env.projects[name] }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // PUT /api/projects/:name — update a project
    if (req.method === 'PUT' && url.pathname.startsWith('/api/projects/') && url.pathname !== '/api/projects/active') {
        try {
            const projName = decodeURIComponent(url.pathname.slice('/api/projects/'.length));
            const body = await readBody(req);
            const { solutionPath, description } = JSON.parse(body);
            const env = loadEnvJson();
            if (!env.projects || !env.projects[projName]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Project "${projName}" not found` }));
                return;
            }
            if (solutionPath) env.projects[projName].solutionPath = solutionPath;
            if (description !== undefined) env.projects[projName].description = description;
            // Keep backward compat if this is the active project
            if (env.activeProject === projName && solutionPath) {
                env.solutionPath = solutionPath;
            }
            saveEnvJson(env);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, project: env.projects[projName] }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // DELETE /api/projects/:name — delete a project
    if (req.method === 'DELETE' && url.pathname.startsWith('/api/projects/') && url.pathname !== '/api/projects/active') {
        try {
            const projName = decodeURIComponent(url.pathname.slice('/api/projects/'.length));
            const env = loadEnvJson();
            if (!env.projects || !env.projects[projName]) {
                res.writeHead(404, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: `Project "${projName}" not found` }));
                return;
            }
            delete env.projects[projName];
            // If deleting the active project, clear it
            if (env.activeProject === projName) {
                const remaining = Object.keys(env.projects);
                env.activeProject = remaining.length > 0 ? remaining[0] : null;
                env.solutionPath = env.activeProject ? env.projects[env.activeProject].solutionPath : '';
            }
            saveEnvJson(env);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // PUT /api/source-code-path — update shared sourceCodePath { "sourceCodePath": "..." }
    if (req.method === 'PUT' && url.pathname === '/api/source-code-path') {
        try {
            const body = await readBody(req);
            const { sourceCodePath } = JSON.parse(body);
            const env = loadEnvJson();
            env.sourceCodePath = sourceCodePath || '';
            saveEnvJson(env);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: true, sourceCodePath: env.sourceCodePath }));
        } catch (err) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
        return;
    }

    // ── Review data APIs (project-scoped) ────────────────────────────
    const activePaths = getActivePaths();

    // API: return raw review JSON
    if (url.pathname === '/api/review') {
        const data = loadJson(activePaths);
        res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(data ? JSON.stringify(data, null, 2) : JSON.stringify({ error: 'No review data found' }));
        return;
    }

    // API: return git diff for branch-diff reviews
    if (url.pathname === '/api/diff') {
        const data = loadJson(activePaths);
        if (!data) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'No review data found' }));
            return;
        }
        const diff = computeGitDiff(data, activePaths);
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
        const accepted = loadAcceptedFixes(activePaths);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(accepted, null, 2));
        return;
    }

    // API: accept a single fix
    if (req.method === 'POST' && url.pathname === '/api/accept-fix') {
        try {
            const body = await readBody(req);
            const fix = JSON.parse(body);
            const accepted = loadAcceptedFixes(activePaths);

            // Avoid duplicates by title+location+file
            const exists = accepted.fixes.some(f => f.title === fix.title && f.location === fix.location && f.file === fix.file);
            if (!exists) {
                fix.acceptedAt = new Date().toISOString();
                fix.applied = false;
                accepted.fixes.push(fix);
                saveAcceptedFixes(activePaths, accepted);
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
            const { titles } = JSON.parse(body);
            const accepted = loadAcceptedFixes(activePaths);
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
            saveAcceptedFixes(activePaths, accepted);
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
        const accepted = loadAcceptedFixes(activePaths);
        const remaining = accepted.fixes.filter(f => !f.applied);
        const removed = accepted.fixes.length - remaining.length;
        saveAcceptedFixes(activePaths, { fixes: remaining });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, removed, remaining: remaining.length }));
        return;
    }

    // API: clear accepted fixes
    if (req.method === 'DELETE' && url.pathname === '/api/accepted-fixes') {
        saveAcceptedFixes(activePaths, { fixes: [] });
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
    const active = getActiveProject();
    const activePaths = getActivePaths();
    console.log(`\n  X++ Code Review Dashboard`);
    console.log(`  ────────────────────────────`);
    console.log(`  Dashboard : http://localhost:${PORT}`);
    console.log(`  API       : http://localhost:${PORT}/api/review`);
    console.log(`  Projects  : http://localhost:${PORT}/api/projects`);
    console.log(`  Active    : ${active || '(none)'}`);
    console.log(`  Data dir  : ${activePaths.dir}`);
    console.log(`\n  Refresh the browser to pick up new review data.\n`);
});
