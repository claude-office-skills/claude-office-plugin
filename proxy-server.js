/**
 * 本地代理服务器
 *
 * 1) 接收浏览器插件的请求，调用本地已认证的 claude CLI 执行，以 SSE 流式返回响应。
 * 2) WPS 上下文中转：Plugin Host POST 数据，Task Pane GET 读取。
 * 3) 代码执行桥：Task Pane 提交代码 → proxy 存入队列 → Plugin Host 轮询执行 → 结果回传。
 *
 * 运行：node proxy-server.js
 * 端口：3001
 */
import express from "express";
import cors from "cors";
import { spawn, execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const app = express();
const PORT = 3001;

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "50mb" }));

// ── 系统剪贴板读取（macOS pbpaste）───────────────────────────
app.get("/clipboard", (req, res) => {
  try {
    const text = execSync("pbpaste", {
      encoding: "utf-8",
      timeout: 2000,
      maxBuffer: 1024 * 1024,
      env: { ...process.env, LANG: "en_US.UTF-8" },
    });
    res.json({ ok: true, text });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── PDF 文本提取 ──────────────────────────────────────────────
app.post("/extract-pdf", async (req, res) => {
  try {
    const { base64, filePath } = req.body;
    let buffer;

    if (filePath) {
      buffer = readFileSync(filePath);
    } else if (base64) {
      buffer = Buffer.from(base64, "base64");
    } else {
      return res
        .status(400)
        .json({ ok: false, error: "需要 base64 或 filePath" });
    }

    const uint8 = new Uint8Array(buffer);
    const parser = new pdfParse.PDFParse(uint8);
    const data = await parser.getText();
    const text = data.text || "";
    const pages = data.total || data.pages?.length || 0;

    const MAX_CHARS = 100000;
    const truncated = text.length > MAX_CHARS;
    const content = truncated ? text.slice(0, MAX_CHARS) : text;

    res.json({
      ok: true,
      text: content,
      pages,
      totalChars: text.length,
      truncated,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ── 图片临时文件上传 ─────────────────────────────────────────
const TEMP_DIR = join(tmpdir(), "wps-claude-uploads");
try {
  mkdirSync(TEMP_DIR, { recursive: true });
} catch {}

let _tempFileCounter = 0;

app.post("/upload-temp", (req, res) => {
  try {
    const { base64, fileName } = req.body;
    if (!base64 || !fileName) {
      return res
        .status(400)
        .json({ ok: false, error: "需要 base64 和 fileName" });
    }
    const ext = fileName.includes(".")
      ? fileName.slice(fileName.lastIndexOf("."))
      : ".bin";
    const safeName = `upload-${++_tempFileCounter}-${Date.now()}${ext}`;
    const filePath = join(TEMP_DIR, safeName);
    writeFileSync(filePath, Buffer.from(base64, "base64"));
    res.json({ ok: true, filePath, fileName: safeName });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

const todayStr = new Date().toISOString().split("T")[0];
const SYSTEM_PROMPT = `你是 Claude，嵌入在 WPS Office Excel 中的 AI 数据处理助手。你的代码直接运行在 WPS Plugin Host 上下文，可同步访问完整 ET API。
今天的日期是 ${todayStr}。当用户询问"最近/近期"数据时，以今天为基准。

## 全局变量
- Application / app：WPS 应用对象
- ActiveWorkbook：当前工作簿
- ActiveSheet：当前活动工作表
- Selection：当前选区

## 动态单元格访问 — 列号转字母辅助函数（必须使用）
在所有代码顶部定义此函数，用于将列号转为字母：
\`\`\`
function CL(c){var s="";while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);}return s;}
\`\`\`
然后用 ws.Range(CL(col)+row) 访问动态单元格，例如：
- ws.Range(CL(3)+"5").Value2 = 100;   // 等价于 C5
- ws.Range(CL(c)+r).Value2 = data;    // 动态行列

## 核心 API（同步执行，非 Excel.run 模式）

### 读写数据
- ws.Range("A1").Value2 = "文本";
- ws.Range("A1:C3").Value2 = [["a","b","c"],["d","e","f"],["g","h","i"]];
- var vals = ws.Range("A1:C3").Value2;  // 返回 2D 数组
- ws.Range(CL(col)+row).Value2 = 123;  // 动态行列访问

### 格式化（非常重要！生成模板必须使用）
- range.Font.Bold = true;
- range.Font.Size = 14;
- range.Font.Color = 0xFFFFFF;          // RGB 格式：0xBBGGRR（注意是 BGR）
- range.Font.Name = "微软雅黑";
- range.Interior.Color = 0x8B4513;      // 背景色 BGR
- range.HorizontalAlignment = -4108;    // -4108=居中, -4131=左对齐, -4152=右对齐
- range.VerticalAlignment = -4108;      // 垂直居中
- range.WrapText = true;                // 自动换行
- range.NumberFormat = "#,##0.00";       // 数字格式
- range.NumberFormat = "yyyy-mm-dd";     // 日期格式
- range.NumberFormat = "0.00%";          // 百分比格式

### 边框
- range.Borders.LineStyle = 1;           // 1=实线 全边框
- range.Borders.Color = 0xD0D0D0;       // 边框颜色
- range.Borders(7).LineStyle = 1;        // 7=左 8=顶 9=底 10=右 11=内竖 12=内横

### 尺寸与合并
- ws.Range("A:A").ColumnWidth = 15;      // 用 Range 设置列宽
- ws.Range("1:1").RowHeight = 30;
- ws.Range("A1:P1").Merge();             // 合并单元格
- ws.Range("A1:P1").MergeCells = true;

### 行列操作
- ws.Range("5:5").Insert();             // 插入行（用 Range 语法）
- ws.Range("A1:A10").AutoFilter();       // 自动筛选

### 工作表
- wb.Sheets.Item(1).Name                // 获取表名
- wb.Sheets.Add(); var ws = wb.ActiveSheet; ws.Name = "新表";  // ⚠️ Add() 返回 null，必须用 ActiveSheet 获取
- ws.Activate();                        // 新建后必须激活

## ⚠️ 不可用 API（严禁使用，会报错！）
- ❌ ws = wb.Sheets.Add() — **Add() 返回 null！** 必须写成：wb.Sheets.Add(); ws = wb.ActiveSheet;
- ❌ ws.Cells() — **严禁使用！** 必用 ws.Range(CL(col)+row) 代替
- ❌ ws.Rows() — **严禁使用！** 用 ws.Range("5:5") 代替
- ❌ ws.Columns() — 不可用，用 ws.Range("A:A") 代替
- ❌ ws.Columns("A").AutoFit() — 不可用
- ❌ ws.ListObjects — 不可用
- ❌ ws.ChartObjects.Add() — 不可用，必须用 ws.Shapes.AddChart2()
- ❌ .Borders — **严禁使用！** ws.Range(...).Borders 会直接报错崩溃
- ❌ .BorderAround() — 会直接报错崩溃
- ⚠️ WPS 加载项中**不支持任何边框 API**，完全不要尝试设置边框
- 替代方案：用背景色区分区域（如表头深色背景 + 白色文字），不需要边框也能美观
- 如需设置列宽，逐列用 ws.Range("A:A").ColumnWidth = N
- 如需设置行高，用 ws.Range("1:1").RowHeight = N

## 📊 图表创建（WPS JS API）

⚠️ 重要：WPS 加载项中创建图表必须使用 **ws.Shapes.AddChart2()** 方法！
❌ 禁止使用 ws.ChartObjects.Add()（WPS 中不支持此方法）

AddChart2(Style, XlChartType, Left, Top, Width, Height) 参数：
- Style：图表样式编号（-1=默认样式）
- XlChartType：4=xlLine(折线), 65=xlLineMarkers(折线+标记), 51=xlColumnClustered(柱状), 5=xlPie(饼图), 54=xlColumnStacked(堆叠柱状)
- Left/Top/Width/Height：位置和大小（像素）

### ⚠️ 不支持的图表类型（会崩溃或空白）：
- ❌ K线图/蜡烛图/OHLC (88/89/90) — WPS 不支持
- ❌ 股价图 (88/89/90) — WPS 不支持
- 股价数据请改用折线图（收盘价走势）+ 柱状图（成交量），分两个图表展示

### 图表最佳实践：
- 每个图表至少 **560×320 像素**，别太小
- 多个图表之间留 **340px 纵向间距**（不要挤在一起）
- 一个图表只展示一个主题，别把所有数据塞一张图
- 股价走势用折线图（收盘价 vs 日期），成交量用柱状图单独展示

### 🎨 图表颜色和样式（关键！）
创建图表后，必须为每条数据系列单独设置颜色，避免默认灰色：

\`\`\`javascript
// 标准图表创建 + 颜色设置模式
try {
  var dataRange = ws.Range("A1:C20");
  var lastRow = 20;
  var chartTop = (lastRow + 2) * 20;
  var shape = ws.Shapes.AddChart2(-1, 65, 20, chartTop, 560, 320);
  var chart = shape.Chart;
  chart.SetSourceData(dataRange);
  chart.HasTitle = true;
  chart.ChartTitle.Text = "趋势分析";

  // ⭐ 关键：为每条线/柱设置不同颜色（BGR格式）
  try {
    // 系列1: 蓝色
    chart.SeriesCollection(1).Format.Line.ForeColor.RGB = 0xFF4500;  // 鲜明蓝
    chart.SeriesCollection(1).Format.Line.Weight = 2.5;
    // 系列2: 红色（如有）
    chart.SeriesCollection(2).Format.Line.ForeColor.RGB = 0x0000FF;  // 红色
    chart.SeriesCollection(2).Format.Line.Weight = 2.5;
    // 系列3: 绿色（如有）
    chart.SeriesCollection(3).Format.Line.ForeColor.RGB = 0x00AA00;  // 绿色
    chart.SeriesCollection(3).Format.Line.Weight = 2.5;
  } catch(ce) {}

  // 柱状图颜色设置
  try {
    chart.SeriesCollection(1).Format.Fill.ForeColor.RGB = 0xE8A040;  // 金橙色
  } catch(ce) {}
} catch(e) {
  // 降级：趋势符号
  ws.Range("F1").Value2 = "趋势";
  for (var i = 2; i <= lastRow; i++) {
    var cur = ws.Range("B"+i).Value2, prev = ws.Range("B"+(i-1)).Value2;
    ws.Range("F"+i).Value2 = cur > prev ? "▲" : (cur < prev ? "▼" : "→");
  }
}
\`\`\`

### 图表配色方案（BGR 格式）— 每个系列必须用不同颜色：
| 用途 | BGR 颜色值 | 视觉效果 |
|------|-----------|---------|
| 系列1(主线/收盘价) | 0xFF4500 | 鲜明蓝 |
| 系列2(对比线/开盘价) | 0x0000FF | 红色 |
| 系列3(辅助线/均价) | 0x00AA00 | 绿色 |
| 系列4(参考线) | 0x00CCFF | 橙色 |
| 柱状图(成交量) | 0xE8A040 | 金橙色 |
| 涨日柱 | 0x0000FF | 红色 |
| 跌日柱 | 0x00AA00 | 绿色 |

⚠️ 图表代码必须包裹在 try/catch 中。颜色设置也要 try/catch（部分 WPS 版本可能不支持）。

## BGR 常用颜色速查
- 深蓝表头: 0x8B4513 (对应 #13458B)
- 鲜明蓝: 0xFF4500 (图表主色)
- 橙色强调: 0x0055D9 (对应 #D95500)
- 金橙色: 0xE8A040 (柱状图)
- 浅灰背景: 0xF0F0F0
- 浅蓝交替行: 0xFFF0E0 (对应淡蓝)
- 白色: 0xFFFFFF
- 黑色: 0x000000
- 红色(BGR): 0x0000FF (涨/上涨)
- 绿色(BGR): 0x00AA00 (跌/下跌)

## 你的核心任务：生成可直接使用的 SaaS 级管理系统

用户让你创建的不是简单表头，而是**完整可用的管理系统**，类似于稻壳模板商城中那种专业级 Excel 管理系统。
表格就是画布，你生成的系统需要用户能真正用起来。

## 代码生成规则（严格遵守）

⚠️ 最重要的规则：所有操作必须在 **一个** 代码块中完成！

### 🚨 绝对禁止拆分代码！
- 禁止将代码拆成 "Part 1", "Part 2", "Part 3" 等多段
- 禁止写 "先运行这段，再运行下一段"
- 无论任务多复杂（DCF 建模、财务分析、仪表板），都必须在一个 \`\`\`javascript\`\`\` 块中完成
- 如果代码太长（>300行），优先简化设计而非拆分代码

### 代码规范
1. **一个代码块完成所有逻辑**（不可拆分！）
2. 代码顶部必须定义 CL() 辅助函数
3. 禁止使用 ws.Cells()、ws.Rows()、ws.Columns()，全部用 ws.Range() 替代
4. 代码最后一行是返回值字符串
5. 始终用中文回复和注释
6. 列宽用 ws.Range("A:A").ColumnWidth = N
7. 行高用 ws.Range("1:1").RowHeight = N

### ⚠️ 重要：不要覆盖用户已有数据！
- **数据分析/趋势分析/建模任务**：必须新建工作表，不得在现有工作表上执行 Clear() 或覆盖数据
  \`\`\`javascript
  // 创建新工作表（正确模式）
  var wb = Application.ActiveWorkbook;
  var srcWs = Application.ActiveSheet; // 先保存原始数据表引用
  var ws;
  try { ws = wb.Sheets.Item("分析结果"); ws.UsedRange.Clear(); } catch(e) {
    // ⚠️ wb.Sheets.Add() 返回 null！必须用 wb.ActiveSheet 获取新表
    wb.Sheets.Add();
    ws = wb.ActiveSheet;
    ws.Name = "分析结果";
  }
  ws.Activate(); // 必须激活新工作表，否则用户看不到结果！
  // 从 srcWs 读取原始数据，写入 ws 做分析
  \`\`\`
  - ⚠️ **wb.Sheets.Add() 返回 null**，必须用 \`wb.ActiveSheet\` 获取新建的工作表引用
  - ⚠️ **新建工作表后必须调用 ws.Activate()** 让用户能看到结果
- **仅当用户明确说"修改/替换/清除现有数据"时**，才在 ActiveSheet 上操作
- ⚠️ 注意：访问工作表必须用 \`wb.Sheets.Item("名称")\` 或 \`wb.Sheets.Item(1)\`，禁止 \`wb.Sheets("名称")\`

### 管理系统/模板必须包含以下全部内容（缺一不可）：

**结构层**
- ✅ 系统标题行（合并居中、16pt 加粗、品牌色背景白字）
- ✅ 副标题/统计周期行
- ✅ 表头行（粗体、白字、深色背景、居中）

**数据层（最关键！）**
- ✅ **至少 10-15 行真实感测试数据**：使用真实中文姓名（张三、李四、王芳...）、真实日期（2024-01-15）、真实金额、真实手机号格式（138xxxx1234）、真实地址
- ✅ **公式列**：金额=数量×单价，合计=SUM，完成率=已完成/总数
- ✅ **汇总行**：合计/平均值/最大值等统计
- ✅ **状态列**：用不同背景色区分状态（绿=已完成、蓝=进行中、橙=待处理、红=逾期）

**格式层**
- ✅ 交替行背景色（偶数行浅色）
- ✅ 全区域边框（Borders.LineStyle = 1）
- ✅ 合理列宽（按内容设置，用 ws.Range("A:A").ColumnWidth）
- ✅ 数字格式（金额 #,##0.00、日期 yyyy-mm-dd、百分比 0.0%、电话 @）

**功能层（让用户真正能用）**
- ✅ 数据验证/下拉菜单（如状态列：已完成/进行中/待处理）使用 ws.Range().Validation.Add(3,1,1,"选项1,选项2,选项3")
- ✅ 条件格式化状态列：不同状态不同颜色
- ✅ 表头筛选：ws.Range("A行:Z行").AutoFilter()

## 参考代码模式（注意：全部用 Range 而非 Cells）

\`\`\`javascript
// 辅助函数：列号转字母（必须放在代码开头）
function CL(c){var s="";while(c>0){c--;s=String.fromCharCode(65+(c%26))+s;c=Math.floor(c/26);}return s;}

var ws = Application.ActiveSheet;
var wb = Application.ActiveWorkbook;
ws.Name = "订单管理";
ws.Range("A1:P100").Clear();

// 标题
ws.Range("A1:K1").Merge();
ws.Range("A1").Value2 = "销售订单管理系统";
ws.Range("A1").Font.Size = 16;
ws.Range("A1").Font.Bold = true;
ws.Range("A1").Font.Color = 0xFFFFFF;
ws.Range("A1").Interior.Color = 0x8B4513;
ws.Range("A1").HorizontalAlignment = -4108;
ws.Range("1:1").RowHeight = 40;

// 副标题
ws.Range("A2:K2").Merge();
ws.Range("A2").Value2 = "统计周期：2024年1月 — 2024年12月";
ws.Range("A2").HorizontalAlignment = -4108;
ws.Range("A2").Font.Color = 0x999999;
ws.Range("2:2").RowHeight = 24;

// 表头
var h = ["序号","订单编号","客户名称","联系电话","产品名称","数量","单价(元)","金额(元)","下单日期","订单状态","备注"];
ws.Range("A3:K3").Value2 = [h];
ws.Range("A3:K3").Font.Bold = true;
ws.Range("A3:K3").Font.Color = 0xFFFFFF;
ws.Range("A3:K3").Interior.Color = 0x8B4513;
ws.Range("A3:K3").HorizontalAlignment = -4108;
ws.Range("3:3").RowHeight = 30;

// 测试数据（10行）— 用 Range(CL(c)+r) 而非 Cells
var names = ["张三","李四","王芳","赵强","陈丽","刘伟","杨洋","周敏","吴刚","郑华"];
var prods = ["笔记本电脑","无线鼠标","机械键盘","显示器","打印机","投影仪","路由器","音箱","摄像头","耳机"];
var stats = ["已发货","待发货","已完成","已发货","待审核","已完成","待发货","已发货","已完成","待审核"];
for (var i = 0; i < 10; i++) {
  var r = i + 4;
  var qty = Math.floor(Math.random() * 20) + 1;
  var price = [5999,89,399,2499,1299,3999,299,599,199,249][i];
  ws.Range(CL(1)+r).Value2 = i + 1;
  ws.Range(CL(2)+r).Value2 = "ORD" + (20240100 + i + 1);
  ws.Range(CL(3)+r).Value2 = names[i];
  ws.Range(CL(4)+r).Value2 = "138" + String(10001234 + i * 1111).substring(0, 8);
  ws.Range(CL(5)+r).Value2 = prods[i];
  ws.Range(CL(6)+r).Value2 = qty;
  ws.Range(CL(7)+r).Value2 = price;
  ws.Range(CL(8)+r).Formula = "=F" + r + "*G" + r;
  ws.Range(CL(9)+r).Value2 = "2024-" + String(1 + (i % 12)).padStart(2, "0") + "-" + String(10 + i).padStart(2, "0");
  ws.Range(CL(10)+r).Value2 = stats[i];
  // 交替行色
  if (i % 2 === 1) ws.Range("A"+r+":K"+r).Interior.Color = 0xFAF0E6;
  // 状态颜色
  var sc = ws.Range(CL(10)+r);
  if (stats[i] === "已完成") { sc.Font.Color = 0x008000; sc.Interior.Color = 0xE0FFE0; }
  else if (stats[i] === "待审核") { sc.Font.Color = 0x0000CC; sc.Interior.Color = 0xE0E0FF; }
  else if (stats[i] === "已发货") { sc.Font.Color = 0x8B4513; }
}

// 格式
ws.Range("G4:G13").NumberFormat = "#,##0.00";
ws.Range("H4:H13").NumberFormat = "#,##0.00";
ws.Range("I4:I13").NumberFormat = "yyyy-mm-dd";
ws.Range("D4:D13").NumberFormat = "@";

// 汇总行
var sr = 14;
ws.Range("A"+sr+":E"+sr).Merge();
ws.Range("A"+sr).Value2 = "合计";
ws.Range("A"+sr).HorizontalAlignment = -4152;
ws.Range("A"+sr).Font.Bold = true;
ws.Range("A"+sr+":K"+sr).Interior.Color = 0xF0F0F0;
ws.Range(CL(6)+sr).Formula = "=SUM(F4:F13)";
ws.Range(CL(8)+sr).Formula = "=SUM(H4:H13)";
ws.Range(CL(8)+sr).NumberFormat = "#,##0.00";
ws.Range(CL(8)+sr).Font.Bold = true;

// 边框
ws.Range("A3:K"+sr).Borders.LineStyle = 1;
ws.Range("A3:K"+sr).Borders.Color = 0xD0D0D0;

// 列宽
var cw = [5,14,10,14,12,6,10,12,12,8,12];
for (var c = 0; c < cw.length; c++) ws.Range(CL(c+1)+":"+CL(c+1)).ColumnWidth = cw[c];

// 数据验证（状态下拉）
try { ws.Range("J4:J100").Validation.Add(3, 1, 1, "已完成,已发货,待发货,待审核,已取消"); } catch(e){}

// 筛选
try { ws.Range("A3:K3").AutoFilter(); } catch(e){}

"订单管理系统创建完成：11列 × 10条测试数据 + 公式汇总 + 状态下拉 + 筛选";
\`\`\`

❌ 严禁：
- 只生成表头不写数据
- 使用 ws.Cells()、ws.Rows()、ws.Columns()
- 使用 ws.ChartObjects.Add()（必须用 Shapes.AddChart2）
- 使用 .Borders、.BorderAround()（WPS 不支持任何边框 API，会崩溃）
- 用文字描述功能代替实际代码
- 把代码拆成多个代码块（Part 1/2/3 等）
- 生成超过 300 行的代码（优先简化设计）

✅ 图表：用户要求图表时，必须使用 ws.Shapes.AddChart2() 并包裹 try/catch 降级为趋势符号`;

// 健康检查
app.get("/health", (req, res) => {
  res.json({ status: "ok", version: "2.0.0" });
});

// ── WPS 上下文中转 ─────────────────────────────────────────
let _wpsContext = {
  workbookName: "",
  sheetNames: [],
  selection: null,
  usedRange: null,
  timestamp: 0,
};

app.post("/wps-context", (req, res) => {
  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c43a5a",
    },
    body: JSON.stringify({
      sessionId: "c43a5a",
      location: "proxy-server.js:POST /wps-context",
      message: "Plugin Host posted context",
      data: {
        hasBody: !!req.body,
        workbookName: req.body?.workbookName,
        sheetNamesLen: req.body?.sheetNames?.length,
        hasSelection: !!req.body?.selection,
        selAddr: req.body?.selection?.address,
        hasError: !!req.body?.error,
        errorMsg: req.body?.error,
        debugErrors: req.body?._debugErrors,
      },
      timestamp: Date.now(),
      hypothesisId: "B-C-D",
      runId: "post-fix",
    }),
  }).catch(() => {});
  // #endregion
  _wpsContext = { ...req.body, timestamp: Date.now() };
  res.json({ ok: true });
});

app.get("/wps-context", (req, res) => {
  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c43a5a",
    },
    body: JSON.stringify({
      sessionId: "c43a5a",
      location: "proxy-server.js:GET /wps-context",
      message: "Task Pane fetched context",
      data: {
        workbookName: _wpsContext.workbookName,
        sheetNamesLen: _wpsContext.sheetNames?.length,
        hasSelection: !!_wpsContext.selection,
        timestamp: _wpsContext.timestamp,
        hasError: !!_wpsContext.error,
      },
      timestamp: Date.now(),
      hypothesisId: "A-E",
    }),
  }).catch(() => {});
  // #endregion
  res.json(_wpsContext);
});

// ── 代码执行桥 ─────────────────────────────────────────────
let _codeQueue = [];
let _codeResults = {};
let _codeIdCounter = 0;

app.post("/execute-code", (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "code 不能为空" });

  const id = `exec-${++_codeIdCounter}-${Date.now()}`;
  _codeQueue.push({ id, code, submittedAt: Date.now() });
  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c43a5a",
    },
    body: JSON.stringify({
      sessionId: "c43a5a",
      location: "proxy-server.js:execute-code",
      message: "Code submitted for execution",
      data: {
        id,
        codeLength: code.length,
        codePreview: code.substring(0, 500),
        codeHasForLoop: code.includes("for"),
        codeHasCells: code.includes("Cells"),
        codeHasValue2: code.includes("Value2"),
        codeHasInterior: code.includes("Interior"),
        codeHasBorders: code.includes("Borders"),
      },
      timestamp: Date.now(),
      hypothesisId: "code-quality",
    }),
  }).catch(() => {});
  // #endregion
  res.json({ ok: true, id });
});

app.get("/pending-code", (req, res) => {
  if (_codeQueue.length === 0) {
    return res.json({ pending: false });
  }
  const item = _codeQueue.shift();
  res.json({ pending: true, ...item });
});

app.post("/code-result", (req, res) => {
  const { id, result, error } = req.body;
  if (!id) return res.status(400).json({ error: "id 不能为空" });

  // #region agent log
  fetch("http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Debug-Session-Id": "c43a5a",
    },
    body: JSON.stringify({
      sessionId: "c43a5a",
      location: "proxy-server.js:code-result",
      message: "Code execution result",
      data: {
        id,
        hasResult: !!result,
        resultPreview: result ? String(result).substring(0, 200) : null,
        hasError: !!error,
        error: error || null,
      },
      timestamp: Date.now(),
      hypothesisId: "exec-result",
    }),
  }).catch(() => {});
  // #endregion

  _codeResults[id] = {
    result: result ?? null,
    error: error ?? null,
    completedAt: Date.now(),
  };

  setTimeout(() => {
    delete _codeResults[id];
  }, 60000);
  res.json({ ok: true });
});

app.get("/code-result/:id", (req, res) => {
  const entry = _codeResults[req.params.id];
  if (!entry) return res.json({ ready: false });
  res.json({ ready: true, ...entry });
});

// ── 模型白名单 ──────────────────────────────────────────────
const ALLOWED_MODELS = new Set([
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "claude-haiku-4-5",
]);

// ── 聊天接口（SSE 流式响应）──────────────────────────────────
app.post("/chat", (req, res) => {
  const { messages, context, model, attachments, webSearch } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages 不能为空" });
  }

  const selectedModel = ALLOWED_MODELS.has(model) ? model : "claude-sonnet-4-6";

  let fullPrompt = `${SYSTEM_PROMPT}\n\n`;

  if (context) {
    fullPrompt += `[当前 Excel 上下文]\n${context}\n\n`;
  }

  if (Array.isArray(attachments) && attachments.length > 0) {
    const textAtts = attachments.filter((a) => a.type !== "image");
    const imageAtts = attachments.filter((a) => a.type === "image");

    if (textAtts.length > 0) {
      fullPrompt += "[用户附件]\n";
      textAtts.forEach((att) => {
        fullPrompt += `--- ${att.name} ---\n${att.content}\n\n`;
      });
    }

    if (imageAtts.length > 0) {
      fullPrompt += `[用户上传了 ${imageAtts.length} 张图片]\n`;
      imageAtts.forEach((att) => {
        if (att.tempPath) {
          try {
            const imgBuf = readFileSync(att.tempPath);
            const ext = att.name?.split(".").pop()?.toLowerCase() || "png";
            const mime =
              {
                jpg: "jpeg",
                jpeg: "jpeg",
                png: "png",
                gif: "gif",
                webp: "webp",
                bmp: "bmp",
                svg: "svg+xml",
              }[ext] || "png";
            const b64 = imgBuf.toString("base64");
            fullPrompt += `图片 ${att.name}: data:image/${mime};base64,${b64.substring(0, 200)}... (${imgBuf.length} bytes, 已作为附件传入)\n`;
          } catch (e) {
            fullPrompt += `图片 ${att.name}: 无法读取 (${e.message})\n`;
          }
        }
      });
      fullPrompt +=
        "请根据图片描述和用户指令来完成任务。如果用户要求参考图片中的表格/界面来创建模板，请尽量还原图片中的布局和字段。\n\n";
    }
  }

  if (messages.length > 1) {
    fullPrompt += "[对话历史]\n";
    messages.slice(0, -1).forEach((m) => {
      const role = m.role === "user" ? "用户" : "助手";
      fullPrompt += `${role}: ${m.content}\n\n`;
    });
  }

  const lastMsg = messages[messages.length - 1];
  fullPrompt += `用户: ${lastMsg.content}`;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // SSE keepalive: prevent browser/WebView timeout during CLI startup
  const keepalive = setInterval(() => {
    if (!res.writableEnded) {
      res.write(`: keepalive ${Date.now()}\n\n`);
    }
  }, 5000);

  const claudePath = process.env.CLAUDE_PATH || "claude";
  const cliArgs = [
    "-p",
    "--verbose",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--max-turns",
    "5",
    "--model",
    selectedModel,
  ];

  if (webSearch) {
    cliArgs.push("--allowedTools", "WebSearch");
  }
  const child = spawn(claudePath, cliArgs, { env: { ...process.env } });

  child.stdin.write(fullPrompt);
  child.stdin.end();

  let resultText = "";
  let responseDone = false;
  let _lineBuf = "";
  let _tokenCount = 0;
  let _thinkingText = "";
  const _streamStartTime = Date.now();
  let _firstTokenTime = 0;
  let _firstThinkTime = 0;

  child.stdout.on("data", (data) => {
    _lineBuf += data.toString();
    const lines = _lineBuf.split("\n");
    _lineBuf = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.trim()) continue;

      try {
        const evt = JSON.parse(line);

        // #region agent log
        if (
          _tokenCount < 3 ||
          (_thinkingText.length === 0 && _tokenCount < 10)
        ) {
          fetch(
            "http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Debug-Session-Id": "fc5e63",
              },
              body: JSON.stringify({
                sessionId: "fc5e63",
                location: "proxy-server.js:parse",
                message: "Parsed event",
                data: {
                  evtType: evt.type,
                  evtKeys: Object.keys(evt),
                  subType: evt.event?.type || evt.subtype || null,
                  deltaType: evt.event?.delta?.type || null,
                  hasThinking: !!evt.event?.delta?.thinking,
                  hasText: !!evt.event?.delta?.text,
                  lineSnippet: line.slice(0, 300),
                },
                timestamp: Date.now(),
                hypothesisId: "H6",
              }),
            },
          ).catch(() => {});
        }
        // #endregion

        if (evt.type === "stream_event") {
          const se = evt.event;

          if (se.type === "content_block_delta") {
            if (se.delta?.type === "text_delta" && se.delta.text) {
              if (!_firstTokenTime) _firstTokenTime = Date.now();
              resultText += se.delta.text;
              _tokenCount++;
              res.write(
                `data: ${JSON.stringify({ type: "token", text: se.delta.text })}\n\n`,
              );
            } else if (
              se.delta?.type === "thinking_delta" &&
              se.delta.thinking
            ) {
              if (!_firstThinkTime) _firstThinkTime = Date.now();
              _thinkingText += se.delta.thinking;
              res.write(
                `data: ${JSON.stringify({ type: "thinking", text: se.delta.thinking })}\n\n`,
              );
            }
          }
        } else if (evt.type === "result" && evt.result) {
          resultText = evt.result;
        }
      } catch {
        // non-JSON line — ignore system/verbose output
      }
    }
  });

  child.stderr.on("data", (data) => {
    console.error("[proxy] stderr:", data.toString().trim());
  });

  child.on("close", (code, signal) => {
    // #region agent log
    fetch("http://127.0.0.1:7244/ingest/63acb95d-6f91-4165-a07a-5bab2abb61eb", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "fc5e63",
      },
      body: JSON.stringify({
        sessionId: "fc5e63",
        location: "proxy-server.js:chat:close",
        message: "CLI closed",
        data: {
          code,
          signal,
          tokenCount: _tokenCount,
          thinkingLen: _thinkingText.length,
          resultLen: resultText.length,
          totalMs: Date.now() - _streamStartTime,
          thinkingMs: _firstTokenTime
            ? _firstTokenTime - _streamStartTime
            : null,
          firstThinkMs: _firstThinkTime
            ? _firstThinkTime - _streamStartTime
            : null,
          firstTokenMs: _firstTokenTime
            ? _firstTokenTime - _streamStartTime
            : null,
        },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {});
    // #endregion
    if (code !== 0 && !resultText) {
      res.write(
        `data: ${JSON.stringify({ type: "error", message: `claude CLI 退出 (code=${code}, signal=${signal})，请确认已登录：运行 claude 命令` })}\n\n`,
      );
    } else {
      res.write(
        `data: ${JSON.stringify({ type: "done", fullText: resultText.trim() })}\n\n`,
      );
    }
    clearInterval(keepalive);
    responseDone = true;
    res.end();
  });

  child.on("error", (err) => {
    console.error("[proxy] spawn error:", err);
    res.write(
      `data: ${JSON.stringify({ type: "error", message: `无法启动 claude CLI: ${err.message}` })}\n\n`,
    );
    clearInterval(keepalive);
    responseDone = true;
    res.end();
  });

  res.on("close", () => {
    clearInterval(keepalive);
    if (!responseDone && !child.killed) child.kill();
  });
});

app.listen(PORT, "127.0.0.1", () => {
  console.log(`\n✅ WPS Claude 代理服务器已启动`);
  console.log(`   地址: http://127.0.0.1:${PORT}`);
  console.log(`   健康检查: http://127.0.0.1:${PORT}/health`);
  console.log(`   代码执行桥: /execute-code, /pending-code, /code-result\n`);
});
