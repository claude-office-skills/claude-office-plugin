#!/bin/bash
cd "$(dirname "$0")"

echo "==================================="
echo " WPS Claude 插件启动器"
echo "==================================="

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "📦 正在安装依赖..."
  npm install
fi

# 检查 claude CLI
if ! command -v claude &> /dev/null; then
  echo "❌ 未找到 claude CLI，请先安装 Claude Code"
  read -p "按任意键退出..." k
  exit 1
fi

# 停止已有实例（避免端口占用）
echo "🛑 清理旧进程..."
lsof -ti:3001 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true
sleep 1

echo ""
echo "▶ 启动代理服务器 (端口 3001)..."
node proxy-server.js > /tmp/proxy-server.log 2>&1 &
PROXY_PID=$!
sleep 2

if curl -s http://127.0.0.1:3001/health > /dev/null 2>&1; then
  echo "   ✅ 代理服务器启动成功"
else
  echo "   ❌ 代理服务器启动失败"
  cat /tmp/proxy-server.log
fi

echo "▶ 启动前端开发服务器 (端口 5173)..."
npm run dev > /tmp/vite-dev.log 2>&1 &
VITE_PID=$!

# 等待 Vite 准备好（最多 15 秒）
echo "   等待 Vite 就绪..."
for i in $(seq 1 15); do
  sleep 1
  if curl -s http://127.0.0.1:5173/ > /dev/null 2>&1; then
    echo "   ✅ 前端服务器就绪 (${i}s)"
    break
  fi
  echo -n "."
done

# 重要：确认两个服务都正常后，再启动 WPS
# WPS 启动时会尝试加载插件，必须先确保 5173 和 3001 端口可用
echo ""
echo "▶ 重启 WPS Office（确保插件正常加载）..."
osascript -e 'tell application "wpsoffice" to quit' 2>/dev/null || true
sleep 2
open -a "wpsoffice"
sleep 3

echo ""
echo "==================================="
echo " ✅ 全部服务已启动！"
echo ""
echo " 前端: http://127.0.0.1:5173"
echo " 代理: http://127.0.0.1:3001/health"
echo ""
echo " WPS 正在启动，请等待几秒..."
echo " 然后点击顶部 [Claude AI] → [打开 Claude]"
echo ""
echo " ⚠️  关闭此窗口将停止所有服务！"
echo "==================================="

trap "echo ''; echo '关闭服务...'; kill $PROXY_PID $VITE_PID 2>/dev/null; exit" INT TERM
wait
