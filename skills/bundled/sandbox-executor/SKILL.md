---
name: sandbox-executor
type: bundled
description: 沙盒执行器 — 在安全隔离环境中运行 Python/Shell 脚本获取外部数据
platforms: [all]
version: 1.0.0
modes: [agent, plan]
context:
  keywords: [python, pip, 爬虫, 抓取, scrape, crawl, 脚本, script, 下载, 安装, shell, bash, 命令行, terminal, 终端, pandas, numpy, requests, beautifulsoup, selenium, playwright, google play, app store, 评论, reviews, 数据采集, 数据抓取, 网页抓取, api调用, curl, wget]
---

## 沙盒执行器

当任务需要 Python 或 Shell 脚本（如安装第三方库、调用外部 API、网页抓取），使用 `sandboxExec()` 在安全沙盒中执行。

### 核心函数

```javascript
var result = sandboxExec(language, code, options);
```

| 参数 | 类型 | 说明 |
|------|------|------|
| language | string | `"python"` 或 `"shell"` |
| code | string | 要执行的代码 |
| options.pip | string[] | Python 依赖包列表（可选） |
| options.timeout | number | 超时秒数，默认 60，最大 120 |

### 返回值

```json
{
  "ok": true,
  "stdout": "脚本输出内容",
  "stderr": "错误信息（如有）",
  "exitCode": 0,
  "timedOut": false
}
```

### 使用模式

**核心原则：`sandboxExec` 获取数据 → WPS JavaScript 写入表格**

```javascript
// 第一步：在沙盒中用 Python 获取数据
var result = sandboxExec("python", `
import json
from google_play_scraper import reviews, Sort

result, _ = reviews(
    'com.example.app',
    lang='zh',
    country='cn',
    sort=Sort.NEWEST,
    count=50
)
print(json.dumps(result, ensure_ascii=False, default=str))
`, { pip: ["google-play-scraper"], timeout: 90 });

if (!result.ok) return "Python 执行失败: " + result.error;

// 第二步：解析数据并写入表格
var data = JSON.parse(result.stdout);
var ws = Application.ActiveSheet;
ws.Range("A1").Value2 = "用户名";
ws.Range("B1").Value2 = "评分";
ws.Range("C1").Value2 = "评论";
ws.Range("D1").Value2 = "日期";

for (var i = 0; i < data.length; i++) {
  var row = i + 2;
  ws.Range("A" + row).Value2 = data[i].userName || "";
  ws.Range("B" + row).Value2 = data[i].score || 0;
  ws.Range("C" + row).Value2 = (data[i].content || "").substring(0, 200);
  ws.Range("D" + row).Value2 = data[i].at || "";
}
return "已写入 " + data.length + " 条评论数据";
```

### 常见场景

#### 网页数据抓取

```javascript
var result = sandboxExec("python", `
import json, urllib.request
url = "https://api.example.com/data"
resp = urllib.request.urlopen(url)
data = json.loads(resp.read())
print(json.dumps(data))
`, { timeout: 30 });
```

#### 使用第三方 Python 库

```javascript
var result = sandboxExec("python", `
import json, pandas as pd
df = pd.read_csv("https://example.com/data.csv")
print(df.to_json(orient="records", force_ascii=False))
`, { pip: ["pandas"], timeout: 60 });
```

#### Shell 命令

```javascript
var result = sandboxExec("shell", `
curl -s "https://api.exchangerate-api.com/v4/latest/USD" | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(json.dumps(data['rates']))
"
`, { timeout: 30 });
```

### 关键规则

1. **始终在一个 JavaScript 代码块中完成**：`sandboxExec()` 获取数据 + WPS API 写入表格
2. **Python 输出必须是 JSON**：在 Python 脚本末尾用 `print(json.dumps(...))` 输出结构化数据
3. **检查 `result.ok`**：沙盒执行可能失败，必须处理错误
4. **pip 依赖声明在 options 中**：不要在 Python 代码里写 `os.system("pip install ...")`
5. **超时保护**：默认 60 秒，大数据量任务设 90-120 秒
6. **不要在沙盒中操作表格**：沙盒是隔离环境，无法访问 WPS API。数据必须通过 JSON 传回

### 不适用场景

- 简单的 WPS 表格操作（直接用 JavaScript）
- 已有 Data Bridge 连接器的数据源（用 `dataBridgePull`）
- 需要持久化状态的服务（沙盒是一次性的）
