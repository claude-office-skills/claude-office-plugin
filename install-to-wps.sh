#!/bin/bash
# 安装 Claude 插件到 WPS（通过 WPS 本地服务 58890 端口注入）

echo "==================================="
echo " Claude for WPS 插件安装脚本"
echo "==================================="

# 1. 启动代理服务器
echo ""
echo "▶ [1/4] 启动代理服务器..."
pkill -f "node proxy-server" 2>/dev/null
cd "$(dirname "$0")"
node proxy-server.js &
PROXY_PID=$!
sleep 2

# 2. 启动 Vite 前端
echo "▶ [2/4] 启动前端服务器..."
pkill -f "vite" 2>/dev/null
npm run dev &
VITE_PID=$!
sleep 4

# 3. 打开 WPS（如果没有运行）
echo "▶ [3/4] 启动 WPS Office..."
open -a "/Applications/wpsoffice.app"

echo "   等待 WPS 完全启动（15秒）..."
sleep 15

# 4. 通过 58890 API 注入插件
echo "▶ [4/4] 通过 WPS 本地服务注入插件..."

ADDON_DATA='{
  "cmd": "enable",
  "name": "claude-wps-plugin",
  "url": "http://127.0.0.1:5173/",
  "addonType": "et",
  "online": "true",
  "version": "1.0.0",
  "customDomain": ""
}'

# 尝试 58890
RESULT=$(curl -s -X POST "http://127.0.0.1:58890/deployaddons/runParams" \
  -H "Content-Type: application/json" \
  --max-time 5 \
  -d "$ADDON_DATA" 2>/dev/null)

if [ "$RESULT" = "OK" ] || [ -z "$RESULT" ]; then
  echo ""
  echo "==================================="
  echo " ✅ 插件安装成功！"
  echo " 请在 WPS 的「开发工具 → WPS 加载项」"
  echo " 中找到 claude-wps-plugin 并启用。"
  echo "==================================="
else
  echo "   58890 响应: $RESULT"
  # 尝试 58891 (HTTPS 端口)
  RESULT2=$(curl -sk -X POST "https://127.0.0.1:58891/deployaddons/runParams" \
    -H "Content-Type: application/json" \
    --max-time 5 \
    -d "$ADDON_DATA" 2>/dev/null)
  echo "   58891 响应: $RESULT2"
  
  echo ""
  echo "==================================="
  echo " ⚠ 自动注入未确认成功"
  echo " 请手动打开 WPS → 开发工具 → WPS 加载项"
  echo " 查看 claude-wps-plugin 是否已出现"
  echo "==================================="
fi

echo ""
echo " 前端地址: http://localhost:5173"
echo " 代理地址: http://localhost:3001"
echo ""
echo " 按 Ctrl+C 停止所有服务"

trap "kill $PROXY_PID $VITE_PID 2>/dev/null; exit" INT TERM
wait
