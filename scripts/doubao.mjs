// 豆包桌面版控制的公共逻辑：提问、状态检查、启动。
import { connectChat } from "./cdp.mjs";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PORT = process.env.DOUBAO_CDP_PORT || 9222;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const key = (c, k, code, vk, modifiers = 0, text) =>
  ["keyDown", "keyUp"].reduce(
    (p, type) =>
      p.then(() =>
        c.send("Input.dispatchKeyEvent", {
          type, key: k, code, windowsVirtualKeyCode: vk, modifiers,
          text: type === "keyDown" ? text : undefined,
        }),
      ),
    Promise.resolve(),
  );

// 同一时间只允许一个提问，避免多个请求在同一个输入框里打架
let queue = Promise.resolve();

export function askDoubao(opts) {
  const run = queue.then(() => askOnce(opts));
  queue = run.catch(() => {});
  return run;
}

async function askOnce({ prompt, newChat = false, timeoutSec = 180 }) {
  if (!prompt || !prompt.trim()) throw new Error("prompt 不能为空");
  const c = await connectChat();
  try {
    if (newChat) {
      await key(c, "n", "KeyN", 78, 4 /* Meta */);
      await sleep(1500);
    }
    const countReplies = `document.querySelectorAll('[data-testid=receive_message]').length`;
    const before = await c.evaluate(countReplies);

    const ok = await c.evaluate(
      `(() => { const e = document.querySelector('.tiptap.ProseMirror'); if (!e) return false; e.focus(); return true; })()`,
    );
    if (!ok) throw new Error("找不到豆包输入框（界面可能改版了）");
    await c.send("Input.insertText", { text: prompt });
    await sleep(300);
    await key(c, "Enter", "Enter", 13, 0, "\r");

    const deadline = Date.now() + timeoutSec * 1000;
    let started = false, done = false;
    while (Date.now() < deadline) {
      await sleep(1500);
      const s = await c.evaluate(
        `({ n: ${countReplies}, loading: !!document.querySelector('[data-testid=message_loading]') })`,
      );
      if (s.n > before || s.loading) started = true;
      if (started && s.n > before && !s.loading) {
        await sleep(1500);
        if (!(await c.evaluate(`!!document.querySelector('[data-testid=message_loading]')`))) { done = true; break; }
      }
    }
    const reply = await c.evaluate(`(() => {
      const all = document.querySelectorAll('[data-testid=receive_message]');
      if (all.length <= ${before}) return null;
      const last = all[all.length - 1];
      const body = last.querySelector('[data-testid=message_content]') || last;
      return body.innerText.trim();
    })()`);
    const url = await c.evaluate("location.href");
    if (reply == null) throw new Error(`等了 ${timeoutSec} 秒没有收到回复`);
    return { reply, complete: done, conversation: url };
  } finally {
    c.close();
  }
}

export async function status() {
  try {
    const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`, { signal: AbortSignal.timeout(1500) })).json();
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const chat = list.find((t) => t.type === "page" && t.url.startsWith("doubaowork://doubaowork-chat/chat"));
    return { running: true, browser: v.Browser, chatPage: !!chat };
  } catch {
    return { running: false };
  }
}

export function startDoubao() {
  const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "start-doubao.sh");
  return new Promise((resolve, reject) =>
    execFile("/bin/zsh", [script], { timeout: 60000 }, (err, stdout, stderr) =>
      err ? reject(new Error((stderr || err.message).trim())) : resolve(stdout.trim()),
    ),
  );
}
