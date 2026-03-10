---
name: google-sheets-api
description: Google Sheets Apps Script API 核心参考 — SpreadsheetApp、Range 读写、格式化、数据验证
version: 1.0.0
tags: [google-sheets, apps-script, api, range, format, core]
platforms: [google-sheets]
modes: [agent, plan]
context:
  always: true
---

## 运行环境

代码在 Google Apps Script V8 运行时中执行。预注入变量：
- `ss` — 当前 Spreadsheet 对象 (`SpreadsheetApp.getActiveSpreadsheet()`)
- `sheet` — 当前活动 Sheet (`ss.getActiveSheet()`)
- `activeRange` — 当前选区 (`sheet.getActiveRange()`)

## 核心 API

### 读取数据

```javascript
// 获取单元格值
var value = sheet.getRange('A1').getValue();

// 获取范围数据（二维数组）
var data = sheet.getRange('A1:D10').getValues();

// 获取公式
var formula = sheet.getRange('A1').getFormula();
var formulas = sheet.getRange('A1:D10').getFormulas();

// 获取显示值（格式化后的字符串）
var display = sheet.getRange('A1').getDisplayValue();
```

### 写入数据

```javascript
// 写入单个值
sheet.getRange('A1').setValue('Hello');

// 批量写入（必须与范围大小匹配）
sheet.getRange('A1:C3').setValues([
  ['Name', 'Age', 'City'],
  ['Alice', 30, 'Beijing'],
  ['Bob', 25, 'Shanghai']
]);

// 写入公式
sheet.getRange('D2').setFormula('=SUM(B2:B10)');
sheet.getRange('D2:D10').setFormulas([['=A2&B2'], ['=A3&B3']]);
```

### 格式化

```javascript
var range = sheet.getRange('A1:D1');

// 字体
range.setFontWeight('bold');
range.setFontSize(12);
range.setFontColor('#1a73e8');

// 背景色
range.setBackground('#e8f0fe');

// 数字格式
sheet.getRange('B2:B10').setNumberFormat('#,##0.00');
sheet.getRange('C2:C10').setNumberFormat('0.0%');
sheet.getRange('D2:D10').setNumberFormat('yyyy-mm-dd');

// 对齐
range.setHorizontalAlignment('center');
range.setVerticalAlignment('middle');

// 边框
range.setBorder(true, true, true, true, true, true);

// 合并单元格
sheet.getRange('A1:D1').merge();

// 自动调整列宽
sheet.autoResizeColumns(1, 4);
```

### 工作表操作

```javascript
// 新建 Sheet
var newSheet = ss.insertSheet('分析结果');

// 切换到指定 Sheet
var target = ss.getSheetByName('Sheet1');
ss.setActiveSheet(target);

// 获取所有 Sheet 名称
var names = ss.getSheets().map(function(s) { return s.getName(); });

// 删除 Sheet（谨慎！）
// ss.deleteSheet(sheet);

// 复制 Sheet
sheet.copyTo(ss).setName('备份_' + new Date().toISOString().split('T')[0]);
```

### 数据操作

```javascript
// 排序（按第2列降序）
sheet.getRange('A1:D10').sort({ column: 2, ascending: false });

// 去重
sheet.getRange('A1:A10').removeDuplicates();

// 查找替换
var finder = sheet.createTextFinder('old text');
finder.replaceAllWith('new text');

// 插入/删除行列
sheet.insertRowAfter(5);
sheet.deleteRow(3);
sheet.insertColumnAfter(4);
```

### 条件格式

```javascript
var rule = SpreadsheetApp.newConditionalFormatRule()
  .whenNumberGreaterThan(100)
  .setBackground('#34a853')
  .setFontColor('#ffffff')
  .setRanges([sheet.getRange('B2:B100')])
  .build();

var rules = sheet.getConditionalFormatRules();
rules.push(rule);
sheet.setConditionalFormatRules(rules);
```

### 数据验证

```javascript
var rule = SpreadsheetApp.newDataValidation()
  .requireValueInList(['是', '否'], true)
  .setAllowInvalid(false)
  .build();
sheet.getRange('E2:E100').setDataValidation(rule);
```

### 图表

```javascript
var chart = sheet.newChart()
  .setChartType(Charts.ChartType.COLUMN)
  .addRange(sheet.getRange('A1:B10'))
  .setPosition(1, 5, 0, 0)
  .setOption('title', '销售趋势')
  .setOption('legend', { position: 'bottom' })
  .build();
sheet.insertChart(chart);
```

## 关键规则

1. **单代码块原则**：所有操作必须在一个代码块中完成，禁止拆分
2. **数据保护**：分析结果写入新 Sheet，不修改原始数据
3. **性能优化**：批量读写 (`getValues/setValues`) 优于逐单元格操作
4. **刷新**：写入后调用 `SpreadsheetApp.flush()` 确保数据持久化
5. **时间限制**：单次执行不超过 6 分钟，大数据处理需分批
6. **新建 Sheet 命名**：使用中文描述性名称，如 `分析结果_销售趋势`

## 禁止使用的 API

- `SpreadsheetApp.openById()` — 不可访问其他工作簿
- `UrlFetchApp` — 代码执行环境中不可用
- `DriveApp` — 不在授权范围内
- `HtmlService` — 仅限 Add-on 入口使用
