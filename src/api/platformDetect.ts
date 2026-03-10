/**
 * 平台检测 + HostAdapter 工厂
 *
 * 根据运行环境自动选择合适的宿主适配器：
 * - WPS Plugin Host → WpsHostAdapter (本地 proxy)
 * - Office.js → WpsHostAdapter (同样走本地 proxy, office-adapter.js 处理翻译)
 * - Google Apps Script → 未来的 GoogleSheetsAdapter (云端 proxy)
 * - 其他 → WpsHostAdapter (mock 模式)
 */

import type { Platform } from "../types";
import type { HostAdapter } from "./hostAdapter";
import { WpsHostAdapter } from "./wpsAdapter";
import { GoogleSheetsHostAdapter } from "./googleSheetsAdapter";

declare const google: { script?: { run?: unknown } } | undefined;

export function detectPlatform(): Platform {
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const explicit = params.get("platform");
    if (explicit && isValidPlatform(explicit)) {
      return explicit as Platform;
    }
  }

  const buildPlatform = import.meta.env.VITE_PLATFORM;
  if (typeof buildPlatform === "string" && isValidPlatform(buildPlatform)) {
    return buildPlatform as Platform;
  }

  if (typeof google !== "undefined" && google?.script?.run) {
    return "google-sheets";
  }

  return "wps-et";
}

function isValidPlatform(p: string): boolean {
  return [
    "wps-et", "office-excel", "google-sheets",
    "wps-word", "google-docs", "wps-ppt", "google-slides",
  ].includes(p);
}

let _adapter: HostAdapter | null = null;

export function getHostAdapter(): HostAdapter {
  if (_adapter) return _adapter;

  const platform = detectPlatform();

  switch (platform) {
    case "google-sheets":
      _adapter = new GoogleSheetsHostAdapter();
      break;
    default:
      _adapter = new WpsHostAdapter();
      break;
  }

  return _adapter;
}

/** Allow overriding adapter (for testing or manual platform selection) */
export function setHostAdapter(adapter: HostAdapter): void {
  _adapter = adapter;
}
