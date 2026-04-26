const express = require('express');
const fetch = require('node-fetch');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 8000;
const CONFIG_PATH = path.join(__dirname, 'config.json');

// Multer for multipart/form-data (images/edits)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

// Serve frontend
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// ─── Supported models ────────────────────────────────────────────
const SUPPORTED_MODELS = [
    { id: 'gpt-image-2', object: 'model', owned_by: 'openai', type: 'image' },
    { id: 'codex-gpt-image-2', object: 'model', owned_by: 'openai', type: 'image' },
    { id: 'auto', object: 'model', owned_by: 'openai', type: 'image' },
    { id: 'gpt-5', object: 'model', owned_by: 'openai', type: 'chat' },
    { id: 'gpt-5-1', object: 'model', owned_by: 'openai', type: 'chat' },
    { id: 'gpt-5-2', object: 'model', owned_by: 'openai', type: 'chat' },
    { id: 'gpt-5-3', object: 'model', owned_by: 'openai', type: 'chat' },
    { id: 'gpt-5-3-mini', object: 'model', owned_by: 'openai', type: 'chat' },
    { id: 'gpt-5-mini', object: 'model', owned_by: 'openai', type: 'chat' },
];

// ─── Server-side config ──────────────────────────────────────────

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch {}
    return {};
}

function saveConfigFile(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// GET /api/config — 读取配置（key 脱敏）
app.get('/api/config', (req, res) => {
    const cfg = loadConfig();
    res.json({
        baseUrl: cfg.baseUrl || '',
        apiKey: cfg.apiKey ? '••••••••' : '',
        hasKey: !!cfg.apiKey,
    });
});

// POST /api/config — 保存配置
app.post('/api/config', (req, res) => {
    const { baseUrl, apiKey } = req.body;
    const cfg = loadConfig();
    if (baseUrl !== undefined) cfg.baseUrl = baseUrl.replace(/\/+$/, '');
    // 如果传入的是脱敏占位符，保留旧 key
    if (apiKey !== undefined && apiKey !== '••••••••') cfg.apiKey = apiKey;
    saveConfigFile(cfg);
    res.json({ ok: true });
});

// ─── Helpers ─────────────────────────────────────────────────────

function getBaseUrl(req) {
    const cfg = loadConfig();
    let base = req.headers['x-base-url'] || cfg.baseUrl || process.env.API_BASE_URL || '';
    return base.replace(/\/+$/, '');
}

function getApiKey(req) {
    const cfg = loadConfig();
    const auth = req.headers['authorization'];
    // 优先用请求自带的 Authorization
    if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
    // 其次用服务端配置的 key
    return cfg.apiKey || process.env.API_KEY || '';
}

function buildHeaders(apiKey, extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    if (apiKey) h['Authorization'] = `Bearer ${apiKey}`;
    return h;
}

// ─── GET /v1/models ──────────────────────────────────────────────

app.get('/v1/models', (req, res) => {
    res.json({
        object: 'list',
        data: SUPPORTED_MODELS.map(m => ({
            id: m.id,
            object: m.object,
            created: 1700000000,
            owned_by: m.owned_by,
        })),
    });
});

// ─── POST /v1/images/generations ─────────────────────────────────

app.post('/v1/images/generations', async (req, res) => {
    const base = getBaseUrl(req);
    if (!base) return res.status(400).json({ error: { message: '缺少 base_url，请先在页面配置中转站地址或设置环境变量 API_BASE_URL' } });

    const apiKey = getApiKey(req);

    try {
        const resp = await fetch(`${base}/v1/images/generations`, {
            method: 'POST',
            headers: buildHeaders(apiKey),
            body: JSON.stringify(req.body),
        });
        const data = await resp.json();
        res.status(resp.status).json(data);
    } catch (e) {
        res.status(502).json({ error: { message: `上游请求失败: ${e.message}` } });
    }
});

// ─── POST /v1/images/edits ───────────────────────────────────────

app.post('/v1/images/edits', upload.any(), async (req, res) => {
    const base = getBaseUrl(req);
    if (!base) return res.status(400).json({ error: { message: '缺少 base_url，请先在页面配置中转站地址' } });

    const apiKey = getApiKey(req);

    const FormData = (await import('form-data')).default;
    const form = new FormData();

    if (req.body.model) form.append('model', req.body.model);
    if (req.body.prompt) form.append('prompt', req.body.prompt);
    if (req.body.n) form.append('n', String(req.body.n));
    if (req.body.size) form.append('size', req.body.size);

    for (const file of req.files || []) {
        form.append(file.fieldname, file.buffer, { filename: file.originalname, contentType: file.mimetype });
    }

    try {
        const resp = await fetch(`${base}/v1/images/edits`, {
            method: 'POST',
            headers: {
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                ...form.getHeaders(),
            },
            body: form,
        });
        const data = await resp.json();
        res.status(resp.status).json(data);
    } catch (e) {
        res.status(502).json({ error: { message: `上游请求失败: ${e.message}` } });
    }
});

// ─── POST /v1/chat/completions ───────────────────────────────────

app.post('/v1/chat/completions', async (req, res) => {
    const base = getBaseUrl(req);
    if (!base) return res.status(400).json({ error: { message: '缺少 base_url' } });

    try {
        const resp = await fetch(`${base}/v1/chat/completions`, {
            method: 'POST',
            headers: buildHeaders(getApiKey(req)),
            body: JSON.stringify(req.body),
        });
        const data = await resp.json();
        res.status(resp.status).json(data);
    } catch (e) {
        res.status(502).json({ error: { message: `上游请求失败: ${e.message}` } });
    }
});

// ─── POST /v1/responses ──────────────────────────────────────────

app.post('/v1/responses', async (req, res) => {
    const base = getBaseUrl(req);
    if (!base) return res.status(400).json({ error: { message: '缺少 base_url' } });

    try {
        const resp = await fetch(`${base}/v1/responses`, {
            method: 'POST',
            headers: buildHeaders(getApiKey(req)),
            body: JSON.stringify(req.body),
        });
        const data = await resp.json();
        res.status(resp.status).json(data);
    } catch (e) {
        res.status(502).json({ error: { message: `上游请求失败: ${e.message}` } });
    }
});

// ─── Catch-all proxy (any /v1/* path) ───────────────────────────

app.all('/v1/*', async (req, res) => {
    const base = getBaseUrl(req);
    if (!base) return res.status(400).json({ error: { message: '缺少 base_url' } });

    const url = `${base}${req.originalUrl}`;

    try {
        const resp = await fetch(url, {
            method: req.method,
            headers: buildHeaders(getApiKey(req)),
            body: ['GET', 'HEAD'].includes(req.method) ? undefined : JSON.stringify(req.body),
        });
        const data = await resp.json();
        res.status(resp.status).json(data);
    } catch (e) {
        res.status(502).json({ error: { message: `上游请求失败: ${e.message}` } });
    }
});

// ─── Start ───────────────────────────────────────────────────────

app.listen(PORT, () => {
    const cfg = loadConfig();
    console.log(`\n  🎨 Image API Proxy running at http://localhost:${PORT}`);
    if (cfg.baseUrl) {
        console.log(`  📡 已配置中转站: ${cfg.baseUrl}`);
        console.log(`  🔑 API Key: ${cfg.apiKey ? '已设置' : '未设置'}`);
    } else {
        console.log(`  ⚠️  请先在 http://localhost:${PORT} 页面配置中转站地址`);
    }
    console.log(`\n  curl 示例:`);
    console.log(`  curl http://localhost:${PORT}/v1/images/generations \\`);
    console.log(`    -H "Content-Type: application/json" \\`);
    console.log(`    -H "Authorization: Bearer <your-key>" \\`);
    console.log(`    -d '{"model":"gpt-image-2","prompt":"A cat","n":1}'\n`);
});
