#!/bin/zsh
# 以远程调试端口重启豆包桌面版（DoubaoWork），供 scripts/ask.mjs 控制。
# 用法: scripts/start-doubao.sh
PORT=${DOUBAO_CDP_PORT:-9222}
BROWSER="/Applications/DoubaoWork.app/Contents/Helpers/DoubaoWork Browser.app"

if curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null; then
  echo "豆包已在调试模式运行 (端口 $PORT)"; exit 0
fi

# 优雅退出正在运行的豆包
pkill -TERM -f "/Applications/DoubaoWork.app/Contents/MacOS/DoubaoWork" 2>/dev/null
pkill -TERM -f "DoubaoWork Browser.app/Contents/MacOS/DoubaoWork Browser" 2>/dev/null
for i in {1..20}; do pgrep -f "DoubaoWork Browser.app/Contents/MacOS" >/dev/null || break; sleep 0.5; done

# 只监听本机回环地址
open -a "$BROWSER" --args --remote-debugging-port=$PORT --remote-debugging-address=127.0.0.1
for i in {1..30}; do
  curl -s -m 1 "http://127.0.0.1:$PORT/json/version" >/dev/null && { echo "豆包已启动，调试端口 $PORT"; exit 0; }
  sleep 1
done
echo "启动超时：调试端口没有响应" >&2; exit 1
