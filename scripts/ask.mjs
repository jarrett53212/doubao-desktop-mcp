// 向豆包桌面版发送一条消息并输出回复。
// 用法: node scripts/ask.mjs [--new] [--timeout 秒] "你的问题"
import { askDoubao } from "./doubao.mjs";

const args = process.argv.slice(2);
let newChat = false, timeoutSec = 180;
const rest = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--new") newChat = true;
  else if (args[i] === "--timeout") timeoutSec = Number(args[++i]);
  else rest.push(args[i]);
}
const prompt = rest.join(" ").trim();
if (!prompt) { console.error('用法: node scripts/ask.mjs [--new] "问题"'); process.exit(2); }

const { reply, complete } = await askDoubao({ prompt, newChat, timeoutSec });
console.log(reply);
if (!complete) console.error("（提示：回复可能还没生成完，已超时）");
