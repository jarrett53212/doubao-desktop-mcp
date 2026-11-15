<img src="assets/icon.svg" width="64" height="64" alt="">

# doubao-desktop-mcp

让 Claude Code（或任何 MCP 客户端）直接调用你电脑上的**豆包桌面版**：发消息、等它生成完、把回复拿回来。零依赖，一个 Node 脚本。

> Let Claude Code talk to the Doubao desktop app on macOS. Zero dependencies — just Node 22+ and the Chrome DevTools Protocol.

```
你 → Claude Code → doubao_ask("把这段话润色一下…") → 豆包桌面版 → 回复 → Claude Code 接着干活
```

## 原理

豆包桌面版（DoubaoWork）的 `DoubaoWork.app` 只是一个启动壳，真正的界面跑在内置的 Chromium（`DoubaoWork Browser.app`）里。带上 `--remote-debugging-port` 启动后，它的聊天页就能通过 CDP 操作：

1. 找到 `doubaowork://doubaowork-chat/chat` 页面
2. 往 tiptap 输入框里插入文本，模拟回车
3. 轮询 `[data-testid=message_loading]`，等生成结束
4. 读最后一条 `[data-testid=receive_message]` 的正文

不截图、不点坐标、不需要辅助功能权限；用的是你已经登录的豆包账号。

## 要求

- macOS，已安装并登录豆包桌面版（豆包工作 / DoubaoWork）
- Node.js 22+

## 快速开始

```bash
git clone https://github.com/<you>/doubao-desktop-mcp
cd doubao-desktop-mcp

# 1. 以调试模式（重新）启动豆包，端口 9222，只监听 127.0.0.1
./scripts/start-doubao.sh

# 2. 命令行直接问
node scripts/ask.mjs "用五个字形容秋天"
node scripts/ask.mjs --new --timeout 300 "新建对话再问"
```

## 接入 Claude Code

```bash
claude mcp add --scope user doubao -- node /绝对路径/doubao-desktop-mcp/scripts/mcp-server.mjs
```

其他 MCP 客户端（Claude Desktop、Cursor 等）：

```json
{
  "mcpServers": {
    "doubao": {
      "command": "node",
      "args": ["/绝对路径/doubao-desktop-mcp/scripts/mcp-server.mjs"]
    }
  }
}
```

提供的工具：

| 工具 | 作用 |
|---|---|
| `doubao_ask` | 发消息并返回回复。参数：`prompt`、`new_chat`、`timeout_sec` |
| `doubao_status` | 检查豆包是否以调试模式运行 |
| `doubao_start` | 以调试模式重启豆包（会先退出当前豆包） |

## 注意事项

- **安全**：调试端口开着时，本机任何程序都能操作你已登录的豆包。豆包工作模式还可能有「本地电脑 / 全部允许」权限。不用时正常退出豆包再打开，端口就关了。
- 豆包正常重启后不带调试端口，需要重新运行 `start-doubao.sh`。
- 依赖豆包界面的 `data-testid` 和编辑器结构，豆包改版可能导致失效，欢迎 PR。
- 同一时间只处理一个提问（内部排队）。
- 适合个人日常使用，请不要拿来高频批量调用。需要稳定、大量调用，请用火山方舟官方 API。

## 免责声明

非官方项目，与字节跳动 / 豆包无关。使用时请遵守豆包的用户协议，风险自负。

## License

MIT
