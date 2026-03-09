---
name: connector-manager
type: connector
description: 数据源连接器管理 — Agent 自动帮用户查询、配置、创建和测试数据连接器
version: 1.0.0
modes: [agent, plan, ask]
context:
  keywords: [数据源, 连接器, 数据连接, 接入, 对接, API, 凭证, API Key, token, 添加数据源, 配置数据源, 连接数据, 数据接口, REST API, 第三方数据, 外部数据, connector, data source, webhook, 接口对接, 新增数据源, 管理数据源, 删除数据源, 启用, 禁用]
---

## 数据源连接器管理

你可以帮用户通过对话完成数据源的查询、配置、创建和测试。以下是可用的管理函数。

### 可用函数

#### 1. 查看所有连接器

```javascript
var list = dataBridgeList();
// 返回数组: [{id, name, description, enabled, hasCredentials, actions:[...]}]
```

#### 2. 查看凭证状态（不返回实际值）

```javascript
var status = dataBridgeCredentialStatus("similarweb");
// 返回: {configured: true/false, fields: ["api_key"], ...}
```

#### 3. 配置凭证

```javascript
var result = dataBridgeSetCredentials("similarweb", { api_key: "用户提供的key" });
// 返回: {ok: true} 或 {ok: false, error: "..."}
```

#### 4. 启用/禁用连接器

```javascript
var result = dataBridgeToggle("yahoo-finance", true);  // true=启用, false=禁用
```

#### 5. 创建自定义 REST API 连接器

```javascript
var result = dataBridgeCreateConnector({
  id: "my-api",
  name: "我的API",
  baseUrl: "https://api.example.com",
  authType: "bearer",     // "bearer" | "header" | "query"
  authKey: "Authorization", // header 名或 query 参数名
  credentialKey: "token",
  endpoints: [
    { action: "get_data", path: "/v1/data", method: "GET" }
  ]
});
```

#### 6. 拉取数据（配置完成后测试）

```javascript
var resp = dataBridgePull("similarweb", "traffic_engagement", { domain: "google.com" });
```

### 对话流程指南

**场景 A：用户想连接已有的内置数据源**

1. 用 `dataBridgeList()` 查看可用连接器
2. 用 `dataBridgeCredentialStatus(id)` 检查是否已配置
3. 如果未配置，向用户要凭证（说明去哪里获取）
4. 用 `dataBridgeSetCredentials(id, {...})` 配置
5. 用 `dataBridgePull(id, action, params)` 测试拉取并写入表格
6. 告知用户结果

**场景 B：用户想接入新的第三方 API**

1. 询问 API 基本信息：名称、基础 URL、认证方式
2. 用 `dataBridgeCreateConnector({...})` 创建连接器
3. 配置凭证并测试

**场景 C：用户提到某个数据平台但不确定是否支持**

1. 用 `dataBridgeList()` 查看
2. 若已有，引导配置
3. 若没有，提议创建自定义连接器或告知暂不支持

### 内置连接器参考

| 连接器 ID | 名称 | 需要凭证 | 获取地址 |
|-----------|------|---------|---------|
| yahoo-finance | Yahoo Finance | 无需（免费） | — |
| similarweb | SimilarWeb | api_key | similarweb.com/api |
| sensortower | SensorTower | auth_token | app.sensortower.com → 设置 → API |

### 安全规则（必须遵守）

- **绝不在对话文本中重复用户的凭证值**。收到后立即调用配置函数，不要回显。
- 配置代码中使用凭证后，在返回信息中只说"已配置"，不显示具体值。
- 如果用户在对话中发送了 API Key，回复时用 `***` 代替实际值。
- 凭证存储在用户本地加密保险库中（AES-256-GCM），仅当前用户可访问。

### 示例对话

**用户**: 帮我连接 SimilarWeb
**Agent 应生成代码**:
```javascript
var list = dataBridgeList();
var sw = null;
for (var i = 0; i < list.length; i++) {
  if (list[i].id === "similarweb") { sw = list[i]; break; }
}
if (!sw) return "SimilarWeb 连接器未找到";
var status = dataBridgeCredentialStatus("similarweb");
if (status.configured) {
  return "SimilarWeb 已配置，可以直接使用。需要拉取什么数据？";
} else {
  return "SimilarWeb 需要 API Key 才能使用。\n\n获取方式：登录 similarweb.com → API → 复制你的 API Key\n\n请把 API Key 发给我，我帮你配置。";
}
```

**用户**: 我的 key 是 sk-abc123xyz
**Agent 应生成代码**:
```javascript
var result = dataBridgeSetCredentials("similarweb", { api_key: "sk-abc123xyz" });
if (!result.ok) return "配置失败: " + result.error;
var test = dataBridgePull("similarweb", "traffic_engagement", { domain: "google.com" });
if (test.ok) {
  return "✅ SimilarWeb 已连接成功！测试拉取 google.com 流量数据正常。\n可以开始使用了，告诉我你想分析哪些网站？";
} else {
  return "⚠️ 凭证已保存，但测试拉取失败: " + test.error + "\n请检查 API Key 是否正确。";
}
```
