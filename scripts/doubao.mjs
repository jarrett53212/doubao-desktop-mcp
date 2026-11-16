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

async function askOnce({ prompt, newChat = false, timeoutSec = 600 }) {
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

    // 完成判定：没有 loading 动画；最后一条回复的操作栏已显示且有「重新生成」；
    // 若有工作模式的计时器，它必须从「已处理 N 秒」变成「共用时 N 秒」。
    const doneCheck = `(() => {
      if (document.querySelector('[data-testid=message_loading]')) return false;
      const all = document.querySelectorAll('[data-testid=receive_message]');
      if (all.length <= ${before}) return false;
      const last = all[all.length - 1];
      const bar = last.querySelector('[data-testid=message_action_bar]');
      if (!bar || bar.className.includes('pointer-events-none')) return false;
      if (!last.querySelector('[data-testid=message_action_regenerate]')) return false;
      const timer = last.querySelector('[data-testid=preamble-elapsed-timer]');
      if (timer && !timer.innerText.startsWith('共用时')) return false;
      return true;
    })()`;
    const deadline = Date.now() + timeoutSec * 1000;
    let done = false;
    while (Date.now() < deadline) {
      await sleep(1500);
      if (await c.evaluate(doneCheck)) {
        await sleep(1000); // 防抖：再确认一次
        if (await c.evaluate(doneCheck)) { done = true; break; }
      }
    }
    // 只取最终回答：排除工作模式前言（计时器、过程说明）里的文本块
    const reply = await c.evaluate(`(() => {
      const all = document.querySelectorAll('[data-testid=receive_message]');
      if (all.length <= ${before}) return null;
      const last = all[all.length - 1];
      const pre = last.querySelector('[data-testid=preamble-elapsed]');
      const blocks = [...last.querySelectorAll('[data-testid=message_text_content]')]
        .filter((b) => !(pre && pre.contains(b)));
      // 链接保留成 Markdown：[文字](网址)，否则 innerText 只剩「链接」两个字
      const text = (el) => {
        const c = el.cloneNode(true);
        c.querySelectorAll('a[href]').forEach((a) => {
          let href = a.href; const t = a.innerText.trim();
          try { const u = new URL(href), tg = u.searchParams.get('target'); if (tg && /wtturl|doubao\\.com\\/link/.test(u.host + u.pathname)) href = tg; } catch {}
          if (/^https?:/.test(href)) a.replaceWith(document.createTextNode(t && t !== href ? '[' + t + '](' + href + ')' : href));
        });
        // cloneNode 脱离了布局，innerText 会丢换行；临时挂到页面外再取
        c.style.cssText = 'position:fixed;left:-99999px;top:0;width:800px';
        document.body.appendChild(c);
        const s = c.innerText.trim(); c.remove(); return s;
      };
      if (blocks.length) return blocks.map(text).join('\\n\\n');
      return text(last.querySelector('[data-testid=message_content]') || last);
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
