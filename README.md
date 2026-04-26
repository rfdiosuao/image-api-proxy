# Image API Proxy

OpenAI Images API 兼容代理 + CLI 命令行工具，填入中转站地址即可生成和编辑图片。

## 功能

- Web 界面：填入地址和提示词，生成图片点击下载
- CLI 命令行：终端直接生成/编辑图片
- 兼容 OpenAI Images API 接口
- 支持多张生成（n 参数）

## 兼容接口

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/v1/images/generations` | 图片生成 |
| POST | `/v1/images/edits` | 图片编辑 |
| POST | `/v1/chat/completions` | 对话式图片生成 |
| POST | `/v1/responses` | Responses 式图片生成 |
| GET | `/v1/models` | 模型列表 |

## 支持模型

`gpt-image-2` `codex-gpt-image-2` `auto` `gpt-5` `gpt-5-1` `gpt-5-2` `gpt-5-3` `gpt-5-3-mini` `gpt-5-mini`

## 快速开始

### 安装

```bash
git clone https://github.com/rfdiosuao/image-api-proxy.git
cd image-api-proxy
npm install
```

### 启动 Web 服务

```bash
npm start
```

打开 `http://localhost:8000`，在页面填入中转站地址和 API Key 即可使用。

## CLI 使用

### 配置中转站（只需一次）

```bash
node cli.js config --url https://你的中转站地址 --key sk-xxx
```

### 查看当前配置

```bash
node cli.js config
```

### 生成图片

```bash
# 基本用法
node cli.js generate "一只戴着墨镜的猫"

# 指定模型、数量、尺寸
node cli.js generate "sunset beach" -m gpt-image-2 -n 2 -s 1536x1024

# 指定保存目录
node cli.js generate "一只猫" -o ./pics
```

### 编辑图片

```bash
# 基本用法
node cli.js edit photo.png "给猫加个帽子"

# 带 mask 局部编辑
node cli.js edit photo.png "修改背景" --mask mask.png

# 指定输出目录和数量
node cli.js edit photo.png "改成水彩风格" -n 2 -o ./output
```

### 查看支持模型

```bash
node cli.js models
```

### 帮助

```bash
node cli.js help
```

## CLI 选项

| 选项 | 缩写 | 说明 | 默认值 |
|------|------|------|--------|
| `--model` | `-m` | 模型名称 | gpt-image-2 |
| `--size` | `-s` | 图片尺寸 | 1024x1024 |
| `--count` | `-n` | 生成数量 | 1 |
| `--output` | `-o` | 保存目录 | 当前目录 |
| `--mask` | | Mask 图片路径（仅 edit） | |

## 环境变量

也可以通过环境变量配置，无需使用 Web 页面：

```bash
API_BASE_URL=https://你的中转站地址 API_KEY=sk-xxx npm start
```

## API 调用示例

配置好中转站后，可直接 curl 调用：

```bash
curl http://localhost:8000/v1/images/generations \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-image-2","prompt":"A cute cat","n":1}'

curl http://localhost:8000/v1/models
```

## License

MIT
