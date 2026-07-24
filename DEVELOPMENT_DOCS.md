# Jewelry AI Workstation - 完整开发文档 (Development Documentation)

本文档包含了 **Jewelry AI Workstation (珠宝 AI 工作站)** 的完整项目架构、功能模块设计、数据流逻辑、API 规范以及源代码打包导出与运行部署指南。

---

## 1. 项目概览 (Project Overview)

**Jewelry AI Workstation** 是专为珠宝设计与营销团队打造的 AI 自动化工作流系统。系统能够从 3D CAD 图纸/透图快速生成符合电商与营销标准的高清主图、模特佩戴图、场景生活照、细节资产及 360° 展示视频。

### 核心技术栈 (Tech Stack)

- **前端 (Frontend)**: React 19, TypeScript, Vite, Tailwind CSS v4, Motion (动画库), Lucide React (图标库)
- **后端 (Backend Server)**: Express 5, Node.js, Socket.io (实现实时 Agent 指令通信)
- **AI 模型与 SDK (AI Integration)**: `@google/genai` (Gemini 3.1 Flash Image 模型)
- **数据持久化 (Storage)**: Browser `localStorage` (规格标准、资产库与项目归档数据) + 静态文件夹模拟

---

## 2. 核心功能与逻辑架构 (Core Features & Logic)

### 2.1 3D 规格解析与智能属性识别
- **自动解析 (3D Spec Parsing)**: 上传 3D 视图后，可通过 AI 智能识别或手动输入获取 **SKU Name**、珠宝品类 (Category)、主/辅石资料 (Stone Data)、尺寸属性 (Dimensions/Sizes) 和备注信息 (Notes/Remarks)。
- **尺寸/石头备注保存**: 解析得到的尺寸、石头材质等规格会自动归档存入资料备注中，后续在生成模特戴图 (Model Shots) 和场景生活照 (Scene Shots) 时，作为 Prompt 上下文自动传入，用于控制珠宝在人体/场景中的真实比例与质感表现。

### 2.2 SKU 产品库与文件夹管理 (Product Library & SKU Folder Structure)
- **按 SKU 命名文件夹**: 生成主图后，系统以 **SKU Name** (如 `VNE250243`) 自动创建独立产品文件夹。
- **资产分类保存**: 文件夹内集中归档：
  - 3D 原始渲染视图/图纸
  - 生成的高清主图 (Main Images, 多材质变体如 Silver, Gold Vermeil, 14k Gold)
  - 细节与场景资产 (Detail & Lifestyle Assets)
  - 3D Preview 获得的尺寸规格与石头资料备注

### 2.3 多分辨率与比例选择 (Resolution & Aspect Ratio)
- **图片分辨率选择**:
  - **1080P** (Standard High Definition)
  - **2K** (QHD, 2048×2048 / 2K 级别)
  - **4K** (UHD, 3840×3840 / 4K 级别)
- **画面比例选择**:
  - **1:1** (默认，适用于电商正方形主图)
  - **9:16** (适用于 TikTok / Instagram Reels / Mobile 竖屏场景)
  - **16:9** (适用于 Desktop 宽屏 Banner / 横屏展示)

### 2.4 Agent 外部控制接口 (Agent Command API & Socket.io)
- **接口位置**: `/api/agent/command`
- **Plugin Manifest**: `/api/agent/manifest`
- **逻辑流程**: 外部 Agent (如 LobeChat、龙虾/LobeHub Agent) 向 `/api/agent/command` 发送 POST 请求，Express 服务接收后通过 Socket.io 将指令 (`generate_main_image`, `switch_workflow` 等) 实时广播至前端工作站并自动执行渲染。

---

## 3. 项目目录结构 (Directory Structure)

```
/
├── server.ts                 # Express 服务端入口 & Socket.io & Agent API
├── index.html                # 前端 HTML 入口
├── package.json              # 项目依赖与运行脚本
├── vite.config.ts            # Vite 配置文件
├── tsconfig.json             # TypeScript 配置
├── .env.example              # 环境变量示例文件
├── README.md                 # 快速入门与运行说明
├── DEVELOPMENT_DOCS.md       # 本完整开发文档
└── src/
    ├── main.tsx              # React 挂载入口
    ├── App.tsx               # 核心系统 UI 与工作流主逻辑 (4000+ 行模块化代码)
    └── index.css             # Tailwind CSS 全局样式
```

---

## 4. 源码打包与导出指南 (Packaging & Export Guide)

您可以选择以下任意一种方式将本项目完整的源代码打包导出到本地或远程仓库：

### 方式一：在 AI Studio 界面一键导出 (推荐)
1. 在 AI Studio 编辑器界面右上角，点击 **Settings (齿轮图标)**。
2. 选择 **"Download ZIP"**，系统将打包生成完整项目源码的 ZIP 压缩包并自动下载。
3. 或者选择 **"Export to GitHub"**，可直接将项目代码推送至您的 GitHub 个人或团队仓库。

### 方式二：在终端使用命令行打包 ZIP 包
如果您在本地或 Shell 容器环境，可以在项目根目录运行以下命令打包项目（自动排除 `node_modules` 和 `dist` 构建产物）：

```bash
zip -r jewelry-ai-workstation.zip . -x "node_modules/*" -x "dist/*" -x ".git/*"
```

---

## 5. 本地部署与运行指南 (Local Run Guide)

### 步骤 1：准备环境
确保本地环境已安装 **Node.js** (建议 v18 及以上版本)。

### 步骤 2：解压与安装依赖
在解压后的项目根目录下打开终端，执行：
```bash
npm install
```

### 步骤 3：配置 Gemini API Key
创建 `.env` 文件并写入您的 Gemini API 密钥：
```env
API_KEY=your_gemini_api_key_here
```
*(注：也可以在应用启动后，点击界面左下角 "Connect Paid Key" 填入密钥，密钥将保存在浏览器本地。)*

### 步骤 4：启动本地开发服务
```bash
npm run dev
```
启动成功后，在浏览器访问 `http://localhost:3000` 即可使用。

---

## 6. 构建与生产部署 (Production Build)

构建项目静态资产与服务端 bundle：
```bash
npm run build
```
运行生产服务：
```bash
npm start
```

---

## 7. 常见问题与维护提示

1. **缓存与数据恢复**: 本系统的标准库与 SKU 资产数据默认保存在浏览器的 `localStorage` 中。建议定期在 **Standards** 界面中使用 **Export Standards** 导出一份 json 备份。
2. **生成画质调整**: 生成主图/模特图时，可在设置面板中灵活选择 **1080P / 2K / 4K** 分辨率以及 **1:1 / 9:16 / 16:9** 比例。
