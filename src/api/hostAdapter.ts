/**
 * HostAdapter — 平台无关的宿主适配器接口
 *
 * WPS / Office.js / Google Sheets 各自实现此接口，
 * 上层（App.tsx、claudeClient 等）通过统一接口交互，
 * 不直接依赖任何特定平台 API。
 */

import type { SpreadsheetContext, Platform, DiffResult, AddToChatPayload } from "../types";

export interface ExecuteResult {
  result: string;
  diff: DiffResult | null;
}

export interface HostAdapter {
  readonly platform: Platform;

  /** 获取当前表格上下文（工作簿名、Sheet 列表、选区等） */
  getContext(): Promise<SpreadsheetContext>;

  /** 执行平台原生代码（JS for WPS, Apps Script for Google Sheets 等） */
  executeCode(code: string, agentId?: string, force?: boolean): Promise<ExecuteResult>;

  /** 执行 Python 代码（通过 proxy 服务端） */
  executePython(code: string): Promise<ExecuteResult>;

  /** 执行 Shell 命令（通过 proxy 服务端） */
  executeShell(command: string): Promise<ExecuteResult>;

  /** 预览 HTML（通过 proxy 服务端） */
  previewHtml(html: string, title?: string): Promise<ExecuteResult>;

  /** 导航到指定单元格 */
  navigateToCell(sheetName: string, cellAddress?: string): Promise<void>;

  /** 根据 diff 回滚变更 */
  revertDiff(diff: DiffResult): Promise<void>;

  /** 监听选区变化，返回取消订阅函数 */
  onSelectionChange(callback: (ctx: SpreadsheetContext) => void): () => void;

  /** 轮询 Add-to-Chat 数据 */
  pollAddToChat(): Promise<AddToChatPayload | null>;

  /** 宿主是否可用（非 mock 模式） */
  isAvailable(): boolean;
}
