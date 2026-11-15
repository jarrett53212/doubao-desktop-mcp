#!/usr/bin/env node
// 零依赖的 MCP stdio 服务：让 Claude Code 等 MCP 客户端调用豆包桌面版。
// 注册: claude mcp add --scope user doubao -- node /绝对路径/scripts/mcp-server.mjs
import { askDoubao, status, startDoubao } from "./doubao.mjs";
import readline from "node:readline";

const SERVER = { name: "doubao-desktop", version: "0.1.0" };

const TOOLS = [
  {
    name: "doubao_ask",
    description:
      "向用户本机的豆包桌面版（DoubaoWork）发送一条消息，等待生成结束后返回豆包的回复文本。" +
      "适合让豆包做翻译、中文写作、联网搜索、总结等。默认在当前对话里继续；new_chat=true 时新建对话。" +
      "注意：豆包工作模式可能具备操作本地电脑的权限，不要让它执行你不确定的操作。",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "发给豆包的消息" },
        new_chat: { type: "boolean", description: "是否新建对话后再发送，默认 false" },
        timeout_sec: { type: "number", description: "等待回复的最长秒数，默认 180" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "doubao_status",
    description: "检查豆包桌面版是否以调试模式运行、聊天页是否可用。",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "doubao_start",
    description:
      "以远程调试端口（仅本机）重启豆包桌面版。会先退出正在运行的豆包，仅在 doubao_status 显示未运行时、且用户同意后使用。",
    inputSchema: { type: "object", properties: {} },
  },
];

const text = (t, isError = false) => ({ content: [{ type: "text", text: t }], isError });

async function callTool(name, args = {}) {
  try {
    if (name === "doubao_ask") {
      const s = await status();
      if (!s.running) return text("豆包没有以调试模式运行。请先调用 doubao_start（会重启豆包），或运行 scripts/start-doubao.sh。", true);
      const r = await askDoubao({ prompt: args.prompt, newChat: !!args.new_chat, timeoutSec: args.timeout_sec || 180 });
      return text(r.complete ? r.reply : `${r.reply}\n\n（注意：等待超时，回复可能不完整）`);
    }
    if (name === "doubao_status") return text(JSON.stringify(await status()));
    if (name === "doubao_start") return text(await startDoubao());
    return text(`未知工具: ${name}`, true);
  } catch (e) {
    return text(`出错: ${e.message}`, true);
  }
}

const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");

async function handle(req) {
  const { id, method, params } = req;
  if (method === "initialize") {
    return send({
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: params?.protocolVersion || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: SERVER,
      },
    });
  }
  if (method === "tools/list") return send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  if (method === "tools/call") return send({ jsonrpc: "2.0", id, result: await callTool(params.name, params.arguments) });
  if (method === "ping") return send({ jsonrpc: "2.0", id, result: {} });
  if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } });
  // 没有 id 的是通知（如 notifications/initialized），忽略
}

const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let req;
  try { req = JSON.parse(line); } catch { return send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }); }
  handle(req).catch((e) => req.id !== undefined && send({ jsonrpc: "2.0", id: req.id, error: { code: -32603, message: e.message } }));
});
