/**
 * Claude Office AI — Google Sheets Add-on (All-in-One)
 *
 * 直接调用 Anthropic Claude API，不依赖外部 proxy。
 * API Key 由侧边栏客户端通过 localStorage 管理，不依赖 PropertiesService。
 */

// ═══════════════════════════════════════════════════════════════
// 1. 入口 & 菜单
// ═══════════════════════════════════════════════════════════════

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Claude for Sheets')
    .addItem('打开助手面板', 'showSidebar')
    .addSeparator()
    .addItem('🔑 授权/重新授权', 'triggerAuth')
    .addToUi();
}

function triggerAuth() {
  // 先撤销旧 token，强制触发完整重新授权
  ScriptApp.invalidateAuth();
  // 重新获取 token（会触发所有 scope 的授权对话框）
  var token = ScriptApp.getOAuthToken();
  SpreadsheetApp.getActiveSpreadsheet().getName();
  UrlFetchApp.fetch('https://www.google.com', { muteHttpExceptions: true });
  SpreadsheetApp.getUi().alert('✅ 授权完成！\n\n现在请刷新页面，再打开助手面板即可正常使用。');
}

function onInstall(e) { onOpen(e); }

function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('Claude for Sheets')
    .setWidth(420);
  SpreadsheetApp.getUi().showSidebar(html);
}

function navigateToCell(sheetName, cellAddress) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  ss.setActiveSheet(sheet);
  if (cellAddress) {
    sheet.setActiveRange(sheet.getRange(cellAddress));
  }
}

// ═══════════════════════════════════════════════════════════════
// 2. 上下文收集
// ═══════════════════════════════════════════════════════════════

var MAX_SAMPLE_ROWS = 20;
var MAX_SAMPLE_COLS = 30;

function getSpreadsheetContext() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();
  var selection = sheet.getActiveRange();

  var context = {
    platform: 'google-sheets',
    workbookName: ss.getName(),
    sheetNames: ss.getSheets().map(function(s) { return s.getName(); }),
    selection: null,
    usedRange: null
  };

  if (selection) {
    context.selection = buildRangeContext_(selection, sheet);
  }

  var usedRange = getUsedRange_(sheet);
  if (usedRange) {
    context.usedRange = buildRangeContext_(usedRange, sheet);
  }

  return context;
}

function buildRangeContext_(range, sheet) {
  var numRows = range.getNumRows();
  var numCols = range.getNumColumns();
  var sampleRows = Math.min(numRows, MAX_SAMPLE_ROWS);
  var sampleCols = Math.min(numCols, MAX_SAMPLE_COLS);

  var sampleRange = sheet.getRange(
    range.getRow(), range.getColumn(), sampleRows, sampleCols
  );
  var values = sampleRange.getValues();
  var tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();

  var sanitized = values.map(function(row) {
    return row.map(function(cell) {
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
      }
      if (cell === '') return null;
      return cell;
    });
  });

  return {
    address: range.getA1Notation(),
    sheetName: sheet.getName(),
    rowCount: numRows,
    colCount: numCols,
    sampleValues: sanitized,
    hasMoreRows: numRows > MAX_SAMPLE_ROWS
  };
}

function getUsedRange_(sheet) {
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return null;
  return sheet.getRange(1, 1, lastRow, lastCol);
}

function getSheetData(sheetName, maxRows) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { error: 'Sheet "' + sheetName + '" not found' };

  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow === 0 || lastCol === 0) return { data: [], rowCount: 0, colCount: 0 };

  var rows = Math.min(lastRow, maxRows || MAX_SAMPLE_ROWS);
  var values = sheet.getRange(1, 1, rows, lastCol).getValues();
  var tz = ss.getSpreadsheetTimeZone();

  var sanitized = values.map(function(row) {
    return row.map(function(cell) {
      if (cell instanceof Date) {
        return Utilities.formatDate(cell, tz, 'yyyy-MM-dd');
      }
      if (cell === '') return null;
      return cell;
    });
  });

  return {
    data: sanitized,
    rowCount: lastRow,
    colCount: lastCol,
    hasMoreRows: lastRow > rows
  };
}

// ═══════════════════════════════════════════════════════════════
// 3. Claude API 直连
// ═══════════════════════════════════════════════════════════════

var ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
var ANTHROPIC_API_VERSION = '2023-06-01';
var DEFAULT_MODEL = 'claude-sonnet-4-5';
var MAX_TOKENS = 4096;

// #region agent log
function debugDiagnose() {
  return { steps: ['pure-function:OK', 'ts:' + Date.now()] };
}

function debugDiagnose2() {
  var steps = [];
  try { SpreadsheetApp.getActiveSpreadsheet().getName(); steps.push('SpreadsheetApp:OK'); } catch(e) { steps.push('SpreadsheetApp:FAIL:' + e.message); }
  steps.push('no-fetch-ref');
  return { steps: steps };
}

function debugDiagnose3() {
  var steps = [];
  try {
    var name = ['Url', 'Fetch', 'App'].join('');
    var fetcher = eval(name);
    fetcher.fetch('https://www.google.com', {muteHttpExceptions:true});
    steps.push('eval-fetch:OK');
  } catch(e) { steps.push('eval-fetch:FAIL:' + e.message); }
  return { steps: steps };
}
// #endregion

function httpPost_(url, payload, headers) {
  var fetcher = globalThis['UrlFetchApp'];
  return fetcher.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: payload,
    muteHttpExceptions: true,
    headers: headers
  });
}

/**
 * @param {string} userMessage
 * @param {Object[]} history
 * @param {string|null} model
 * @param {string} apiKey - 由客户端 localStorage 传入
 */
function chatDirect(userMessage, history, model, apiKey) {
  if (!apiKey) {
    return { error: '未配置 API Key。请点击侧边栏底部 ⚙ 按钮设置。' };
  }

  var context;
  try {
    context = getSpreadsheetContext();
  } catch (e) {
    context = null;
  }
  var systemPrompt = buildSystemPrompt_(context);

  var messages = [];
  if (Array.isArray(history)) {
    history.forEach(function(m) {
      messages.push({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.content
      });
    });
  }
  messages.push({ role: 'user', content: userMessage });

  var requestBody = {
    model: model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages
  };

  var isOAuth = apiKey && (apiKey.startsWith('sk-ant-oat') || !apiKey.startsWith('sk-ant-'));
  var authHeaders = { 'anthropic-version': ANTHROPIC_API_VERSION };
  if (isOAuth) {
    authHeaders['Authorization'] = 'Bearer ' + apiKey;
  } else {
    authHeaders['x-api-key'] = apiKey;
  }

  try {
    var response = httpPost_(ANTHROPIC_API_URL, JSON.stringify(requestBody), authHeaders);
    var code = response.getResponseCode();

    if (code !== 200) {
      var errBody = response.getContentText();
      // #region agent log
      var _dbgFail = { authType: isOAuth ? 'Bearer' : 'x-api-key', keyPrefix: apiKey.substring(0, 12), httpCode: code };
      // #endregion
      try {
        var errJson = JSON.parse(errBody);
        return { error: 'API 错误 (' + code + '): ' + (errJson.error && errJson.error.message ? errJson.error.message : errBody.substring(0, 200)), _dbg: _dbgFail };
      } catch (e) {
        return { error: 'API 错误 (' + code + '): ' + errBody.substring(0, 200), _dbg: _dbgFail };
      }
    }

    var result = JSON.parse(response.getContentText());
    var text = '';
    if (result.content && result.content.length > 0) {
      result.content.forEach(function(block) {
        if (block.type === 'text') {
          text += block.text;
        }
      });
    }

    var codeBlocks = extractCodeBlocks_(text);

    // #region agent log
    var _dbg = { authType: isOAuth ? 'Bearer' : 'x-api-key', keyPrefix: apiKey.substring(0, 12) };
    // #endregion
    return {
      content: text,
      codeBlocks: codeBlocks,
      model: result.model || model || DEFAULT_MODEL,
      usage: {
        input: result.usage ? result.usage.input_tokens || 0 : 0,
        output: result.usage ? result.usage.output_tokens || 0 : 0
      },
      _dbg: _dbg
    };
  } catch (e) {
    // #region agent log
    var _dbgErr = { authType: isOAuth ? 'Bearer' : 'x-api-key', keyPrefix: apiKey.substring(0, 12) };
    // #endregion
    return { error: '网络错误: ' + e.message, _dbg: _dbgErr };
  }
}

/**
 * React sidebar 调用入口 — 接收预构建的 messages JSON + context 字符串
 * @param {string} messagesJson - JSON 数组字符串 [{role,content},...]
 * @param {string} contextStr  - 已格式化的上下文字符串（由 React buildContextString 生成）
 * @param {string|null} model  - 模型名称
 * @param {string} apiKey      - API Key（客户端 localStorage 传入）
 */
function chatFromReact(messagesJson, contextStr, model, apiKey) {
  if (!apiKey) {
    return { error: '未配置 API Key。请在设置中配置 Console API Key (sk-ant-api03-)。' };
  }

  var messages;
  try {
    messages = JSON.parse(messagesJson);
  } catch (e) {
    return { error: 'messages JSON 解析失败: ' + e.message };
  }

  var today = new Date().toISOString().split('T')[0];
  var systemPrompt = '你是用户的专属 Google Sheets AI 助手。今天是 + today + 。\n\n';
  systemPrompt += '## 代码执行环境\n';
  systemPrompt += '你的代码运行在 Google Apps Script V8 运行时中。\n\n';
  systemPrompt += '## 关键规则\n';
  systemPrompt += '1. 所有操作必须在一个 javascript 代码块中完成\n';
  systemPrompt += '2. 使用批量操作 (getValues/setValues)\n';
  systemPrompt += '3. 代码末尾调用 SpreadsheetApp.flush()\n\n';
  if (contextStr) {
    systemPrompt += '[当前表格上下文]\n' + contextStr + '\n';
  }

  var requestBody = {
    model: model || DEFAULT_MODEL,
    max_tokens: MAX_TOKENS,
    system: systemPrompt,
    messages: messages
  };

  var isOAuth = apiKey && (apiKey.startsWith('sk-ant-oat') || !apiKey.startsWith('sk-ant-'));
  var authHeaders = { 'anthropic-version': ANTHROPIC_API_VERSION };
  if (isOAuth) {
    authHeaders['Authorization'] = 'Bearer ' + apiKey;
  } else {
    authHeaders['x-api-key'] = apiKey;
  }

  try {
    var response = httpPost_(ANTHROPIC_API_URL, JSON.stringify(requestBody), authHeaders);
    var code = response.getResponseCode();
    if (code !== 200) {
      var errBody = response.getContentText();
      try {
        var errJson = JSON.parse(errBody);
        return { error: 'API 错误 (' + code + '): ' + (errJson.error && errJson.error.message ? errJson.error.message : errBody.substring(0, 200)) };
      } catch (e2) {
        return { error: 'API 错误 (' + code + '): ' + errBody.substring(0, 200) };
      }
    }
    var result = JSON.parse(response.getContentText());
    var text = '';
    if (result.content && result.content.length > 0) {
      result.content.forEach(function(block) {
        if (block.type === 'text') text += block.text;
      });
    }
    return { text: text };
  } catch (e) {
    return { error: '网络错误: ' + e.message };
  }
}

function buildSystemPrompt_(context) {
  var today = new Date().toISOString().split('T')[0];

  var prompt = '你是用户的专属 Google Sheets AI 助手。今天是 ' + today + '。\n\n';

  prompt += '## 代码执行环境\n';
  prompt += '你的代码运行在 Google Apps Script V8 运行时中。预注入变量：\n';
  prompt += '- `ss` — SpreadsheetApp.getActiveSpreadsheet()\n';
  prompt += '- `sheet` — ss.getActiveSheet()\n';
  prompt += '- `activeRange` — sheet.getActiveRange()\n\n';

  prompt += '## 关键规则\n';
  prompt += '1. 所有操作必须在一个 javascript 代码块中完成，禁止拆分\n';
  prompt += '2. 分析结果写入新 Sheet，不修改原始数据\n';
  prompt += '3. 使用批量操作 (getValues/setValues) 而非逐单元格\n';
  prompt += '4. 代码末尾调用 SpreadsheetApp.flush() 确保数据持久化\n';
  prompt += '5. 单次执行不超过 6 分钟\n\n';

  prompt += '## 常用 API 示例\n';
  prompt += '```javascript\n';
  prompt += '// 读取数据\nvar data = sheet.getRange("A1:D10").getValues();\n';
  prompt += '// 写入数据\nsheet.getRange("A1:C3").setValues([[1,2,3],[4,5,6],[7,8,9]]);\n';
  prompt += '// 新建 Sheet\nvar newSheet = ss.insertSheet("分析结果");\n';
  prompt += '// 格式化\nsheet.getRange("A1:D1").setFontWeight("bold").setBackground("#e8f0fe");\n';
  prompt += '// 图表\nvar chart = sheet.newChart().setChartType(Charts.ChartType.COLUMN).addRange(sheet.getRange("A1:B10")).setPosition(1,5,0,0).build();\nsheet.insertChart(chart);\n';
  prompt += '```\n\n';

  if (context) {
    prompt += '[当前表格上下文]\n';
    prompt += '工作簿: ' + context.workbookName + '\n';
    prompt += '所有工作表: ' + context.sheetNames.join(', ') + '\n';

    if (context.selection) {
      var sel = context.selection;
      prompt += '\n当前活动工作表: 「' + sel.sheetName + '」\n';
      prompt += '当前选区: ' + sel.address + ' (' + sel.rowCount + '行 × ' + sel.colCount + '列)\n';
      if (sel.sampleValues && sel.sampleValues.length > 0) {
        prompt += '选区样本数据:\n';
        sel.sampleValues.forEach(function(row, i) {
          prompt += '  第' + (i + 1) + '行: ' + JSON.stringify(row) + '\n';
        });
        if (sel.hasMoreRows) {
          prompt += '  ... (更多行省略)\n';
        }
      }
    }

    if (context.usedRange) {
      var ur = context.usedRange;
      prompt += '\n已用范围: ' + ur.address + ' (' + ur.rowCount + '行 × ' + ur.colCount + '列)\n';
    }
  }

  return prompt;
}

function extractCodeBlocks_(text) {
  var blocks = [];
  var re = /```(\w+)?\n([\s\S]*?)```/g;
  var match;
  while ((match = re.exec(text)) !== null) {
    blocks.push({
      language: match[1] || 'javascript',
      code: match[2].trim()
    });
  }
  return blocks;
}

// ═══════════════════════════════════════════════════════════════
// 4. 代码执行引擎
// ═══════════════════════════════════════════════════════════════

function executeGsCode(code) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getActiveSheet();

  var affected = detectAffectedRange_(code, sheet);
  var snapshot = affected ? takeSnapshot_(sheet, affected) : null;

  try {
    var execResult = runInSandbox_(code, ss, sheet);
    SpreadsheetApp.flush();

    var diff = null;
    if (snapshot && affected) {
      diff = computeDiff_(sheet, affected, snapshot);
    }

    return {
      result: execResult || '执行成功',
      diff: diff,
      error: null
    };
  } catch (e) {
    return {
      result: null,
      diff: null,
      error: e.message || String(e)
    };
  }
}

function runInSandbox_(code, ss, sheet) {
  var SpreadsheetApp_ = SpreadsheetApp;
  var ss_ = ss;
  var sheet_ = sheet;
  var activeRange_ = sheet.getActiveRange();

  var BLOCKED_MSG = '⚠️ 该 API 在沙箱中不可用';
  var blockedStub = function() { throw new Error(BLOCKED_MSG); };
  var blockedObj = {
    getOAuthToken: blockedStub, invalidateAuth: blockedStub,
    getService: blockedStub, getProjectTriggers: blockedStub,
    newTrigger: blockedStub, deleteTrigger: blockedStub,
    getScriptId: blockedStub, getInstallationSource: blockedStub,
    getUserProperties: blockedStub, getScriptProperties: blockedStub,
    getDocumentProperties: blockedStub,
    getFiles: blockedStub, getFolders: blockedStub, createFile: blockedStub,
    getRootFolder: blockedStub, getFileById: blockedStub,
    sendEmail: blockedStub, getInboxThreads: blockedStub,
    getActiveUser: blockedStub, getEffectiveUser: blockedStub,
    create: blockedStub, createOutput: blockedStub, createTemplate: blockedStub,
    createTextOutput: blockedStub
  };

  var wrappedCode = [
    'var ss = ss_;',
    'var sheet = sheet_;',
    'var activeRange = activeRange_;',
    'var SpreadsheetApp = SpreadsheetApp_;',
    'var UrlFetchApp = UrlFetchApp_;',
    'var ScriptApp = _blocked_;',
    'var DriveApp = _blocked_;',
    'var GmailApp = _blocked_;',
    'var CalendarApp = _blocked_;',
    'var ContactsApp = _blocked_;',
    'var DocumentApp = _blocked_;',
    'var SlidesApp = _blocked_;',
    'var FormApp = _blocked_;',
    'var PropertiesService = _blocked_;',
    'var Session = _blocked_;',
    'var HtmlService = _blocked_;',
    'var ContentService = _blocked_;',
    'var CacheService = _blocked_;',
    'var LockService = _blocked_;',
    code
  ].join('\n');

  var fn = new Function(
    'ss_', 'sheet_', 'activeRange_', 'SpreadsheetApp_',
    'Logger', 'Utilities', 'UrlFetchApp_',
    'Charts', '_blocked_',
    wrappedCode
  );

  var result = fn(
    ss_, sheet_, activeRange_, SpreadsheetApp_,
    Logger, Utilities, globalThis['UrlFetchApp'],
    Charts, blockedObj
  );

  return result !== undefined ? String(result) : null;
}

function detectAffectedRange_(code, sheet) {
  var rangePattern = /getRange\s*\(\s*['"]([A-Z]+\d+(?::[A-Z]+\d+)?)['"]\s*\)/g;
  var match;
  var minRow = Infinity, minCol = Infinity, maxRow = 0, maxCol = 0;
  var found = false;

  while ((match = rangePattern.exec(code)) !== null) {
    found = true;
    try {
      var range = sheet.getRange(match[1]);
      minRow = Math.min(minRow, range.getRow());
      minCol = Math.min(minCol, range.getColumn());
      maxRow = Math.max(maxRow, range.getLastRow());
      maxCol = Math.max(maxCol, range.getLastColumn());
    } catch (e) { /* skip */ }
  }

  var setValuesPattern = /setValues?\s*\(/;
  if (!found && setValuesPattern.test(code)) {
    var lastRow = Math.max(sheet.getLastRow(), 1);
    var lastCol = Math.max(sheet.getLastColumn(), 1);
    return { startRow: 1, startCol: 1, numRows: lastRow + 50, numCols: lastCol + 10 };
  }

  if (!found) return null;

  var padding = 5;
  return {
    startRow: Math.max(1, minRow - padding),
    startCol: Math.max(1, minCol),
    numRows: Math.min(maxRow - minRow + 1 + padding * 2, 500),
    numCols: Math.min(maxCol - minCol + 1 + padding, 50)
  };
}

function takeSnapshot_(sheet, area) {
  try {
    var range = sheet.getRange(area.startRow, area.startCol, area.numRows, area.numCols);
    return { values: range.getValues(), startRow: area.startRow, startCol: area.startCol };
  } catch (e) {
    return null;
  }
}

function computeDiff_(sheet, area, snapshot) {
  if (!snapshot) return null;

  try {
    var range = sheet.getRange(area.startRow, area.startCol, area.numRows, area.numCols);
    var after = range.getValues();
    var before = snapshot.values;
    var changes = [];
    var MAX_CHANGES = 200;

    for (var r = 0; r < Math.min(before.length, after.length); r++) {
      for (var c = 0; c < Math.min(before[r].length, after[r].length); c++) {
        var bv = before[r][c];
        var av = after[r][c];
        if (bv instanceof Date) bv = bv.getTime();
        if (av instanceof Date) av = av.getTime();

        if (String(bv) !== String(av)) {
          var absRow = snapshot.startRow + r;
          var absCol = snapshot.startCol + c;
          changes.push({
            cell: columnToLetter_(absCol) + absRow,
            row: absRow, col: absCol,
            before: before[r][c], after: after[r][c]
          });
          if (changes.length >= MAX_CHANGES) break;
        }
      }
      if (changes.length >= MAX_CHANGES) break;
    }

    return {
      sheetName: sheet.getName(),
      changeCount: changes.length,
      changes: changes,
      hasMore: changes.length >= MAX_CHANGES
    };
  } catch (e) {
    return null;
  }
}

function columnToLetter_(col) {
  var letter = '';
  while (col > 0) {
    var mod = (col - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    col = Math.floor((col - mod - 1) / 26);
  }
  return letter;
}

function revertChanges(diff) {
  if (!diff || !diff.changes || diff.changes.length === 0) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = diff.sheetName ? ss.getSheetByName(diff.sheetName) : ss.getActiveSheet();
  if (!sheet) return;

  for (var i = 0; i < diff.changes.length; i++) {
    var ch = diff.changes[i];
    var cell = sheet.getRange(ch.cell);
    if (ch.before === null || ch.before === '') {
      cell.clearContent();
    } else {
      cell.setValue(ch.before);
    }
  }
  SpreadsheetApp.flush();
}

// ═══════════════════════════════════════════════════════════════
// 授权触发函数（仅用于首次授权，从编辑器运行一次即可）
// ═══════════════════════════════════════════════════════════════

function authorizeAll() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  Logger.log('SpreadsheetApp: ' + ss.getName());
  var fetcher = globalThis['UrlFetchApp'];
  var resp = fetcher.fetch('https://www.google.com', { muteHttpExceptions: true });
  Logger.log('UrlFetchApp: ' + resp.getResponseCode());
  Logger.log('授权完成，可以关闭此窗口，回到 Sheets 刷新页面。');
}
