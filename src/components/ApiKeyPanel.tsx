import { useState, useCallback, useEffect, memo } from "react";

const STORAGE_KEY = "claude-office-api-key";

interface Props {
  visible: boolean;
  onClose: () => void;
}

function ApiKeyPanel({ visible, onClose }: Props) {
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"proxy" | "apikey">("proxy");

  useEffect(() => {
    if (visible) {
      try { setKey(localStorage.getItem(STORAGE_KEY) || ""); }
      catch { setKey(""); }
      setSaved(false);
    }
  }, [visible]);

  const handleSave = useCallback(() => {
    const trimmed = key.trim();
    if (!trimmed) return;
    try {
      localStorage.setItem(STORAGE_KEY, trimmed);
      setSaved(true);
      setTimeout(() => { setSaved(false); onClose(); }, 800);
    } catch { /* localStorage unavailable */ }
  }, [key, onClose]);

  const handleClear = useCallback(() => {
    try { localStorage.removeItem(STORAGE_KEY); }
    catch { /* ignore */ }
    setKey("");
  }, []);

  if (!visible) return null;

  const hasKey = key.trim().length > 10;
  const isApiKey = key.startsWith("sk-ant-api");
  const keyTypeLabel = isApiKey ? "Console API Key" : key.length > 20 ? "Token" : "";

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={panelStyle}>
        <h3 style={{ margin: "0 0 4px", fontSize: 16 }}>连接 Claude AI</h3>
        <p style={{ fontSize: 12, color: "var(--text-muted, #999)", margin: "0 0 16px" }}>
          选择一种方式连接你的 Claude 账号
        </p>

        <div style={tabBarStyle}>
          <button
            style={{ ...tabStyle, ...(tab === "proxy" ? tabActiveStyle : {}) }}
            onClick={() => setTab("proxy")}
          >
            本地代理 (推荐)
          </button>
          <button
            style={{ ...tabStyle, ...(tab === "apikey" ? tabActiveStyle : {}) }}
            onClick={() => setTab("apikey")}
          >
            API Key
          </button>
        </div>

        {tab === "proxy" && (
          <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-primary, #e0e0e0)" }}>
            <p style={{ margin: "0 0 8px" }}>
              如果你有 Claude Pro/Max 订阅，推荐使用本地代理（免费、流式）：
            </p>
            <ol style={{ paddingLeft: 20, margin: "0 0 12px" }}>
              <li style={stepStyle}>
                安装 Claude CLI: <code style={codeInlineStyle}>npm i -g @anthropic-ai/claude-code</code>
              </li>
              <li style={stepStyle}>
                登录: <code style={codeInlineStyle}>claude login</code>
              </li>
              <li style={stepStyle}>
                启动代理: <code style={codeInlineStyle}>node proxy-server.js</code>
              </li>
            </ol>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted, #999)" }}>
              侧边栏会自动检测 127.0.0.1:3001 的代理服务器，支持 SSE 流式响应。
            </p>
          </div>
        )}

        {tab === "apikey" && (
          <div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: "var(--text-primary, #e0e0e0)", marginBottom: 12 }}>
              <ol style={{ paddingLeft: 20, margin: 0 }}>
                <li style={stepStyle}>
                  打开{" "}
                  <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                    style={{ color: "var(--accent, #c67b4a)" }}>
                    Anthropic Console
                  </a>
                </li>
                <li style={stepStyle}>
                  创建 API Key（<code style={codeInlineStyle}>sk-ant-api03-...</code>）
                </li>
                <li style={stepStyle}>粘贴到下方，点击保存</li>
              </ol>
            </div>

            <label style={{ fontSize: 12, color: "var(--text-muted, #999)", display: "block", marginBottom: 4 }}>
              API Key {keyTypeLabel && <span style={{ color: "var(--accent, #c67b4a)" }}>({keyTypeLabel})</span>}
            </label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-api03-..."
              style={inputStyle}
              autoComplete="off"
            />

            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
              {hasKey && (
                <button onClick={handleClear} style={btnSecondaryStyle}>
                  清除
                </button>
              )}
              <button onClick={onClose} style={btnSecondaryStyle}>
                取消
              </button>
              <button onClick={handleSave} disabled={!hasKey} style={hasKey ? btnPrimaryStyle : btnDisabledStyle}>
                {saved ? "✓ 已保存" : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
  background: "rgba(0,0,0,0.6)", zIndex: 1000,
  display: "flex", justifyContent: "center", alignItems: "center",
  backdropFilter: "blur(2px)",
};

const panelStyle: React.CSSProperties = {
  background: "var(--bg-surface, #1e1e1e)", borderRadius: 12, padding: 24,
  width: "92%", maxWidth: 380, boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  color: "var(--text-primary, #e0e0e0)", border: "1px solid var(--border-primary, #333)",
};

const tabBarStyle: React.CSSProperties = {
  display: "flex", gap: 0, marginBottom: 16,
  border: "1px solid var(--border-primary, #444)", borderRadius: 6, overflow: "hidden",
};

const tabStyle: React.CSSProperties = {
  flex: 1, padding: "8px 4px", fontSize: 12, border: "none",
  background: "var(--bg-secondary, #2a2a2a)", color: "var(--text-muted, #999)",
  cursor: "pointer", transition: "all 0.15s",
};

const tabActiveStyle: React.CSSProperties = {
  background: "var(--accent, #c67b4a)", color: "#fff", fontWeight: 500,
};

const stepStyle: React.CSSProperties = { marginBottom: 4 };

const codeInlineStyle: React.CSSProperties = {
  background: "var(--bg-secondary, #2a2a2a)", padding: "1px 5px", borderRadius: 3,
  fontSize: 11, fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
  color: "var(--text-primary, #ddd)",
};

const inputStyle: React.CSSProperties = {
  width: "100%", border: "1px solid var(--border-primary, #444)", borderRadius: 6,
  padding: "10px 12px", fontSize: 13, outline: "none",
  fontFamily: "'SF Mono', 'JetBrains Mono', Menlo, monospace",
  background: "var(--bg-primary, #151515)", color: "var(--text-primary, #e0e0e0)",
  boxSizing: "border-box",
};

const btnPrimaryStyle: React.CSSProperties = {
  background: "var(--accent, #c67b4a)", color: "#fff", border: "none",
  borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer",
};

const btnSecondaryStyle: React.CSSProperties = {
  background: "var(--bg-secondary, #2a2a2a)", color: "var(--text-muted, #999)", border: "none",
  borderRadius: 6, padding: "8px 20px", fontSize: 13, cursor: "pointer",
};

const btnDisabledStyle: React.CSSProperties = {
  ...btnPrimaryStyle, opacity: 0.5, cursor: "not-allowed",
};

export default memo(ApiKeyPanel);
