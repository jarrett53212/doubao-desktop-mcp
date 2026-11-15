// Minimal CDP client for the Doubao desktop app (DoubaoWork) via its remote-debugging port.
// Usage: node scripts/cdp.mjs eval '<js expression>'
const PORT = process.env.DOUBAO_CDP_PORT || 9222;
const CHAT_URL_PREFIX = "doubaowork://doubaowork-chat/chat";

export async function connectChat() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const t = targets.find((x) => x.type === "page" && x.url.startsWith(CHAT_URL_PREFIX));
  if (!t) throw new Error("找不到豆包聊天页面，确认豆包已用调试端口启动（scripts/start-doubao.sh）");
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  return { send, evaluate, close: () => ws.close() };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, arg] = process.argv.slice(2);
  const c = await connectChat();
  try {
    if (cmd === "eval") console.log(JSON.stringify(await c.evaluate(arg), null, 2));
    else console.log("usage: node scripts/cdp.mjs eval '<js>'");
  } finally {
    c.close();
  }
}
