# Jewelry AI Workstation

这是一个基于 Gemini 3.1 Flash Image 模型的珠宝 AI 自动化工作站，支持主图生成、细节资产生成、视频资产生成、SKU Product Library 归档管理、规格/石头/尺寸备注自动调比例、多分辨率（1080P/2K/4K）与比例（1:1/9:16/16:9）选择等功能。

详细的架构说明与API规范请参见：[DEVELOPMENT_DOCS.md](./DEVELOPMENT_DOCS.md)

## 代码打包与下载指南

您可以选择以下方式打包下载本项目完整源码：

### 1. 从 AI Studio 菜单直接下载 ZIP 包 (推荐)
1. 点击 AI Studio 界面右上角的 **Settings (齿轮图标)**。
2. 选择 **"Download ZIP"** 即可将包含最新代码和 `DEVELOPMENT_DOCS.md` 开发文档的项目完整打包下载至本地。
3. 或者选择 **"Export to GitHub"** 将项目导出到您的 GitHub 仓库。

---

## 本地运行指南

要解压后在本地电脑上运行此应用，请按照以下步骤操作：

### 1. 环境准备

确保您的电脑上已安装 [Node.js](https://nodejs.org/) (建议版本 18 或更高)。

### 2. 安装依赖

在解压后的项目根目录下打开终端，运行：

```bash
npm install
```

### 3. 配置 API Key

您可以选择以下两种方式之一配置 Gemini API Key：

#### 方式 A：使用环境变量（推荐）

1. 在项目根目录下创建一个 `.env` 文件。
2. 添加以下内容（替换为您的 API Key）：
   ```env
   API_KEY=您的_GEMINI_API_KEY
   ```

#### 方式 B：在应用界面中设置

1. 启动应用后，点击左下角的 **"Connect Paid Key"**。
2. 在弹出的对话框中输入您的 API Key。此 Key 将保存在浏览器的 `localStorage` 中。

### 4. 启动开发服务器

运行以下命令启动应用：

```bash
npm run dev
```

应用通常会在 `http://localhost:3000` 运行。


## 修复 Bug 与版本替换

如果您在本地修复了 Bug 并希望更新版本：

1. **在 AI Studio 中更新**：您可以直接在 AI Studio 的代码编辑器中修改代码。
2. **重新部署**：如果您已经将应用部署到 Cloud Run，每次在 AI Studio 中保存更改后，系统会自动处理（或您可以手动触发重新部署）。
3. **本地同步**：如果您在本地进行了大量修改，建议将代码推送到 GitHub，然后在 AI Studio 中通过 GitHub 同步功能拉取最新代码。

## 注意事项

- 本应用使用了 Gemini 3.1 系列模型，需要使用付费版 API Key 或在 AI Studio 环境中使用。
- 生成图片和视频可能需要一定时间，请耐心等待。
- 所有的标准（Standards）和项目数据都保存在浏览器的 `localStorage` 中，清除浏览器缓存可能会导致数据丢失，建议定期使用 **Export Standards** 功能备份。
