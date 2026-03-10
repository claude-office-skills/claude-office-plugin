/**
 * Google Sheets HostAdapter
 *
 * 双通道架构：
 * 1. google.script.run — Apps Script 后端（上下文获取、代码执行、导航）
 * 2. 本地代理 127.0.0.1:3001 — Python/Shell/HTML 执行（可选，自动检测）
 *
 * 在 Google Sheets 侧边栏（HtmlService）中运行。
 */

import type { SpreadsheetContext, Platform, DiffResult, AddToChatPayload } from "../types";
import type { HostAdapter, ExecuteResult } from "./hostAdapter";

declare const google: {
  script: {
    run: {
      withSuccessHandler<T>(fn: (result: T) => void): {
        withFailureHandler(fn: (err: Error) => void): {
          [key: string]: (...args: unknown[]) => void;
        };
      };
    };
  };
};

function callGas<T>(fnName: string, ...args: unknown[]): Promise<T> {
  return new Promise((resolve, reject) => {
    const runner = google.script.run
      .withSuccessHandler<T>((result) => resolve(result))
      .withFailureHandler((err) => reject(err));

    const fn = runner[fnName] as (...a: unknown[]) => void;
    if (typeof fn !== "function") {
      reject(new Error(`Apps Script function "${fnName}" not found`));
      return;
    }
    fn(...args);
  });
}

const PROXY_URL = "http://127.0.0.1:3001";
let _available = false;
let _proxyOk: boolean | null = null;
let _lastCtxJson = "";

const PROXY_CACHE_TTL = 10_000;
let _proxyCacheTimer: ReturnType<typeof setTimeout> | null = null;

async function checkLocalProxy(): Promise<boolean> {
  if (_proxyOk !== null) return _proxyOk;
  try {
    const resp = await fetch(`${PROXY_URL}/health`, { signal: AbortSignal.timeout(2000) });
    _proxyOk = resp.ok;
  } catch {
    _proxyOk = false;
  }
  if (!_proxyOk) {
    if (_proxyCacheTimer) clearTimeout(_proxyCacheTimer);
    _proxyCacheTimer = setTimeout(() => { _proxyOk = null; _proxyCacheTimer = null; }, PROXY_CACHE_TTL);
  }
  return _proxyOk;
}

async function execViaProxy(endpoint: string, body: Record<string, unknown>): Promise<ExecuteResult> {
  const resp = await fetch(`${PROXY_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });

  let data: Record<string, unknown>;
  try {
    data = await resp.json();
  } catch {
    throw new Error(`代理返回非 JSON 响应 (HTTP ${resp.status})`);
  }

  if (!resp.ok) {
    throw new Error(String(data?.error ?? `代理错误 HTTP ${resp.status}`));
  }
  if (data.error) throw new Error(String(data.error));
  return { result: String(data.result || "执行成功"), diff: null };
}

export class GoogleSheetsHostAdapter implements HostAdapter {
  readonly platform: Platform = "google-sheets";

  async getContext(): Promise<SpreadsheetContext> {
    try {
      const ctx = await callGas<SpreadsheetContext>("getSpreadsheetContext");
      _available = true;
      return { ...ctx, platform: "google-sheets" };
    } catch {
      _available = false;
      return {
        platform: "google-sheets",
        workbookName: "",
        sheetNames: [],
        selection: null,
      };
    }
  }

  async executeCode(code: string, _agentId?: string, _force?: boolean): Promise<ExecuteResult> {
    const result = await callGas<{ result: string; diff: DiffResult | null; error: string | null }>(
      "executeGsCode",
      code
    );
    if (result.error) {
      throw new Error(result.error);
    }
    return {
      result: result.result || "执行成功",
      diff: result.diff,
    };
  }

  async executePython(code: string): Promise<ExecuteResult> {
    if (await checkLocalProxy()) {
      return execViaProxy("/execute-python", { code });
    }
    throw new Error("Python 执行需要本地代理服务器。请运行 node proxy-server.js 后重试。");
  }

  async executeShell(command: string): Promise<ExecuteResult> {
    if (await checkLocalProxy()) {
      return execViaProxy("/execute-shell", { command });
    }
    throw new Error("Shell 命令执行需要本地代理服务器。请运行 node proxy-server.js 后重试。");
  }

  async previewHtml(html: string, title?: string): Promise<ExecuteResult> {
    if (await checkLocalProxy()) {
      return execViaProxy("/preview-html", { html, title });
    }
    throw new Error("HTML 预览需要本地代理服务器。请运行 node proxy-server.js 后重试。");
  }

  async navigateToCell(sheetName: string, cellAddress?: string): Promise<void> {
    await callGas<void>("navigateToCell", sheetName, cellAddress);
  }

  async revertDiff(diff: DiffResult): Promise<void> {
    await callGas<void>("revertChanges", diff);
  }

  onSelectionChange(callback: (ctx: SpreadsheetContext) => void): () => void {
    let active = true;
    const POLL_INTERVAL = 3000;

    const poll = async () => {
      if (!active) return;
      try {
        const ctx = await this.getContext();
        const json = JSON.stringify({
          workbookName: ctx.workbookName,
          sheetNames: ctx.sheetNames,
          selAddr: ctx.selection?.address,
          selSheet: ctx.selection?.sheetName,
        });
        if (json !== _lastCtxJson) {
          _lastCtxJson = json;
          callback(ctx);
        }
      } catch {
        // ignore
      }
      if (active) setTimeout(poll, POLL_INTERVAL);
    };

    setTimeout(poll, POLL_INTERVAL);
    return () => { active = false; };
  }

  async pollAddToChat(): Promise<AddToChatPayload | null> {
    return null;
  }

  isAvailable(): boolean {
    return _available;
  }
}

export const googleSheetsHostAdapter = new GoogleSheetsHostAdapter();
