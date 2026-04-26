#!/usr/bin/env node

const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const SUPPORTED_MODELS = [
    'gpt-image-2', 'codex-gpt-image-2', 'auto',
    'gpt-5', 'gpt-5-1', 'gpt-5-2', 'gpt-5-3', 'gpt-5-3-mini', 'gpt-5-mini',
];

// ─── Utils ─────────────────────────────────────────

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch {}
    return {};
}

function saveConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

function parseArgs(argv) {
    const args = { _: [] };
    let i = 0;
    while (i < argv.length) {
        const a = argv[i];
        if (a.startsWith('--')) {
            const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[++i];
            } else {
                args[key] = true;
            }
        } else if (a.startsWith('-') && a.length === 2) {
            const map = { m: 'model', s: 'size', n: 'count', o: 'output', k: 'key', u: 'url', mask: 'mask' };
            const key = map[a[1]] || a[1];
            if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
                args[key] = argv[++i];
            } else {
                args[key] = true;
            }
        } else {
            args._.push(a);
        }
        i++;
    }
    return args;
}

function exit(msg, code = 1) {
    console.error(code ? `\x1b[31m✗\x1b[0m ${msg}` : `\x1b[32m✓\x1b[0m ${msg}`);
    process.exit(code);
}

// ─── Commands ──────────────────────────────────────

function cmdConfig(args) {
    const cfg = loadConfig();

    // 有参数 → 保存
    if (args.url || args.key) {
        if (args.url) cfg.baseUrl = args.url.replace(/\/+$/, '');
        if (args.key) cfg.apiKey = args.key;
        saveConfig(cfg);
        console.log(`\x1b[32m✓\x1b[0m 配置已保存`);
        if (cfg.baseUrl) console.log(`  中转站: ${cfg.baseUrl}`);
        console.log(`  API Key: ${cfg.apiKey ? '已设置' : '未设置'}`);
        return;
    }

    // 无参数 → 显示当前配置
    if (!cfg.baseUrl) {
        console.log('未配置中转站地址');
        console.log('用法: imgapi config --url <地址> --key <API Key>');
        return;
    }
    console.log(`  中转站: ${cfg.baseUrl}`);
    console.log(`  API Key: ${cfg.apiKey ? cfg.apiKey.slice(0, 6) + '••••' : '未设置'}`);
}

function cmdModels() {
    console.log('\n  支持模型列表:\n');
    SUPPORTED_MODELS.forEach((m, i) => {
        const tag = i < 3 ? '\x1b[33m图片\x1b[0m' : '\x1b[36m对话\x1b[0m';
        console.log(`  ${i + 1}. \x1b[1m${m}\x1b[0m  ${tag}`);
    });
    console.log('');
}

async function cmdEdit(args) {
    const imagePath = args._[1];
    const prompt = args._.slice(2).join(' ') || args.prompt;
    if (!imagePath) exit('请指定图片路径，例如: imgapi edit photo.png "加个墨镜"');
    if (!prompt) exit('请输入编辑提示词，例如: imgapi edit photo.png "加个墨镜"');

    const cfg = loadConfig();
    if (!cfg.baseUrl) exit('未配置中转站地址，请先运行: imgapi config --url <地址>');

    const imgPath = path.resolve(imagePath);
    if (!fs.existsSync(imgPath)) exit(`图片不存在: ${imgPath}`);

    const model = args.model || 'gpt-image-2';
    const size = args.size || '1024x1024';
    const n = parseInt(args.count) || 1;
    const outputDir = args.output || '.';
    const maskPath = args.mask ? path.resolve(args.mask) : null;

    if (maskPath && !fs.existsSync(maskPath)) exit(`Mask 图片不存在: ${maskPath}`);

    console.log(`\n  原图: ${imgPath}`);
    if (maskPath) console.log(`  Mask: ${maskPath}`);
    console.log(`  提示词: ${prompt}`);
    console.log(`  模型: ${model} | 数量: ${n}`);
    console.log(`  编辑中...\n`);

    const FormData = (await import('form-data')).default;
    const form = new FormData();
    form.append('model', model);
    form.append('prompt', prompt);
    form.append('n', String(n));
    form.append('size', size);
    form.append('image', fs.createReadStream(imgPath));
    if (maskPath) form.append('mask', fs.createReadStream(maskPath));

    const headers = form.getHeaders();
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

    try {
        const resp = await fetch(`${cfg.baseUrl}/v1/images/edits`, {
            method: 'POST',
            headers,
            body: form,
        });

        const data = await resp.json();

        if (!resp.ok) {
            exit(`API 返回错误: ${data.error?.message || JSON.stringify(data)}`);
        }

        if (!data.data || data.data.length === 0) {
            exit('未返回图片数据');
        }

        if (outputDir !== '.') fs.mkdirSync(outputDir, { recursive: true });

        let saved = 0;
        for (let i = 0; i < data.data.length; i++) {
            const item = data.data[i];
            const filename = `edited-${Date.now()}-${i + 1}.png`;
            const filepath = path.join(outputDir, filename);

            if (item.b64_json) {
                fs.writeFileSync(filepath, Buffer.from(item.b64_json, 'base64'));
            } else if (item.url) {
                console.log(`  下载中... (${i + 1}/${data.data.length})`);
                const imgResp = await fetch(item.url);
                if (!imgResp.ok) {
                    console.log(`  \x1b[31m✗\x1b[0m 第 ${i + 1} 张下载失败`);
                    continue;
                }
                const buf = await imgResp.buffer();
                fs.writeFileSync(filepath, buf);
            } else {
                console.log(`  \x1b[31m✗\x1b[0m 第 ${i + 1} 张无数据`);
                continue;
            }

            saved++;
            console.log(`  \x1b[32m✓\x1b[0m ${filepath}`);
        }

        console.log(`\n  完成！共保存 ${saved} 张图片\n`);
    } catch (e) {
        exit(`请求失败: ${e.message}`);
    }
}

async function cmdGenerate(args) {
    const prompt = args._.slice(1).join(' ') || args.prompt;
    if (!prompt) exit('请输入提示词，例如: imgapi generate "一只猫"');

    const cfg = loadConfig();
    if (!cfg.baseUrl) exit('未配置中转站地址，请先运行: imgapi config --url <地址>');

    const model = args.model || 'gpt-image-2';
    const size = args.size || '1024x1024';
    const n = parseInt(args.count) || 1;
    const outputDir = args.output || '.';

    if (!SUPPORTED_MODELS.includes(model)) {
        exit(`不支持的模型: ${model}，运行 imgapi models 查看可用模型`);
    }

    console.log(`\n  提示词: ${prompt}`);
    console.log(`  模型: ${model} | 尺寸: ${size} | 数量: ${n}`);
    console.log(`  生成中...\n`);

    const headers = { 'Content-Type': 'application/json' };
    if (cfg.apiKey) headers['Authorization'] = `Bearer ${cfg.apiKey}`;

    try {
        const resp = await fetch(`${cfg.baseUrl}/v1/images/generations`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, prompt, n, size }),
        });

        const data = await resp.json();

        if (!resp.ok) {
            exit(`API 返回错误: ${data.error?.message || JSON.stringify(data)}`);
        }

        if (!data.data || data.data.length === 0) {
            exit('未返回图片数据');
        }

        // 确保输出目录存在
        if (outputDir !== '.') fs.mkdirSync(outputDir, { recursive: true });

        let saved = 0;
        for (let i = 0; i < data.data.length; i++) {
            const item = data.data[i];
            const filename = `image-${Date.now()}-${i + 1}.png`;
            const filepath = path.join(outputDir, filename);

            if (item.b64_json) {
                fs.writeFileSync(filepath, Buffer.from(item.b64_json, 'base64'));
            } else if (item.url) {
                console.log(`  下载中... (${i + 1}/${data.data.length})`);
                const imgResp = await fetch(item.url);
                if (!imgResp.ok) {
                    console.log(`  \x1b[31m✗\x1b[0m 第 ${i + 1} 张下载失败: HTTP ${imgResp.status}`);
                    continue;
                }
                const buf = await imgResp.buffer();
                fs.writeFileSync(filepath, buf);
            } else {
                console.log(`  \x1b[31m✗\x1b[0m 第 ${i + 1} 张无数据`);
                continue;
            }

            saved++;
            console.log(`  \x1b[32m✓\x1b[0m ${filepath}`);
        }

        console.log(`\n  完成！共保存 ${saved} 张图片\n`);
    } catch (e) {
        exit(`请求失败: ${e.message}`);
    }
}

// ─── Main ──────────────────────────────────────────

function main() {
    const args = parseArgs(process.argv.slice(2));
    const cmd = args._[0];

    if (!cmd || cmd === 'help' || args.help) {
        console.log(`
  \x1b[1mimgapi\x1b[0m — 图片生成 & 编辑 CLI

  \x1b[1m用法:\x1b[0m
    imgapi config --url <地址> --key <Key>   配置中转站
    imgapi config                            查看当前配置
    imgapi generate "提示词"                  生成图片
    imgapi edit <图片路径> "提示词"            编辑图片
    imgapi models                            查看支持模型

  \x1b[1m生成/编辑选项:\x1b[0m
    -m, --model   模型名称 (默认: gpt-image-2)
    -s, --size    图片尺寸 (默认: 1024x1024)
    -n, --count   生成数量 (默认: 1)
    -o, --output  保存目录 (默认: 当前目录)

  \x1b[1m编辑额外选项:\x1b[0m
    --mask <路径>  Mask 图片 (仅编辑遮罩区域)

  \x1b[1m示例:\x1b[0m
    imgapi config --url https://api.example.com --key sk-xxx
    imgapi generate "一只戴着墨镜的猫" -m gpt-image-2 -n 2
    imgapi edit photo.png "加个太阳镜" -o ./output
    imgapi edit photo.png "修改背景" --mask mask.png
`);
        return;
    }

    switch (cmd) {
        case 'config': cmdConfig(args); break;
        case 'models': cmdModels(); break;
        case 'generate': cmdGenerate(args); break;
        case 'edit': cmdEdit(args); break;
        default: exit(`未知命令: ${cmd}，运行 imgapi help 查看帮助`);
    }
}

main();
