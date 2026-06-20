# EternityMusic

跨平台音乐播放器。

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | [Tauri v2](https://v2.tauri.app) |
| 前端 | Vanilla TypeScript + [Tailwind CSS v4](https://tailwindcss.com) |
| 后端 | Rust |
| 音频解码 | Rust 端读取文件，base64 编码后通过 data URL 交由 WebKit 解码播放 |
| 元数据 | `audiotags`（标题/艺术家）、`mp3-duration`（时长） |
| 歌词 | 标准 LRC 格式，存放在歌曲同级的 `歌词/` 目录下 |
| 构建 | Vite 6 |

## 使用方式

```bash
# 开发
npm run dev

# 构建可执行文件
npm run tauri build
```

可执行文件位于 `src-tauri/target/release/eternitymusic`。

首次启动会自动读取 `/home/eternity/Music/`。可通过底部歌单面板的「选择目录」按钮切换。

### 快捷键

| 按键 | 功能 |
|------|------|
| `Space` | 暂停/播放 |
| `↑` / `↓` | 音量 ±5% |
| `←` / `→` | 后退/快进 5 秒 |

### 歌词

歌曲同目录下的 `歌词/` 文件夹中放置 `.txt` 文件（文件名与歌曲相同），格式为 LRC：

```
[00:12.00]歌词内容
```
### 依赖(ArchLinux)
aac解码器: gst-plugins-bad gst-libav


## 开源协议

MIT
