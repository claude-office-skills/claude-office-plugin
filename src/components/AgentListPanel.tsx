import { memo, useState, useMemo } from "react";
import type { AgentState, AgentStatus } from "../types";
import styles from "./AgentListPanel.module.css";

interface AgentListPanelProps {
  agents: AgentState[];
  activeAgentId: string;
  onSwitch: (agentId: string) => void;
  onNew: () => void;
  onClose: () => void;
  onRemove: (agentId: string) => void;
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; color: string; icon: string }
> = {
  idle: { label: "Idle", color: "#888", icon: "○" },
  running: { label: "Running", color: "#D97757", icon: "●" },
  done: { label: "Done", color: "#4ade80", icon: "✓" },
  failed: { label: "Failed", color: "#ef4444", icon: "✗" },
  paused: { label: "Paused", color: "#3b82f6", icon: "⏸" },
};

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function agentSummary(agent: AgentState): string {
  const lastUserMsg = [...agent.messages]
    .reverse()
    .find((m) => m.role === "user");
  if (lastUserMsg) {
    const text = lastUserMsg.content;
    return text.length > 40 ? text.slice(0, 40) + "…" : text;
  }
  return "暂无对话";
}

function AgentListPanel({
  agents,
  activeAgentId,
  onSwitch,
  onNew,
  onClose,
  onRemove,
}: AgentListPanelProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const q = search.toLowerCase();
    return agents.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.messages.some((m) => m.content.toLowerCase().includes(q)),
    );
  }, [agents, search]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.title}>Agents</h2>
        <button className={styles.closeBtn} onClick={onClose} title="关闭">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search Agents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className={styles.newAgentBtn} onClick={onNew}>
          + New Agent
        </button>
      </div>

      <div className={styles.list}>
        {filtered.map((agent) => {
          const isActive = agent.id === activeAgentId;
          const cfg = STATUS_CONFIG[agent.status];

          return (
            <div
              key={agent.id}
              className={`${styles.item} ${isActive ? styles.activeItem : ""}`}
              onClick={() => {
                onSwitch(agent.id);
                onClose();
              }}
            >
              <div
                className={styles.itemIcon}
                style={{ backgroundColor: `${cfg.color}30` }}
              >
                <span style={{ color: cfg.color, fontSize: 14 }}>
                  {cfg.icon}
                </span>
              </div>
              <div className={styles.itemInfo}>
                <div className={styles.itemTop}>
                  <span className={styles.itemName}>
                    {agent.name || "新对话"}
                  </span>
                  <span className={styles.itemTime}>
                    {timeAgo(agent.updatedAt)}
                  </span>
                </div>
                <div className={styles.itemBottom}>
                  <span
                    className={styles.statusBadge}
                    data-running={
                      agent.status === "running" ? "true" : undefined
                    }
                    style={{
                      backgroundColor: `${cfg.color}30`,
                      color: cfg.color,
                    }}
                  >
                    {cfg.icon} {cfg.label}
                  </span>
                  <span className={styles.itemSummary}>
                    {agentSummary(agent)}
                  </span>
                </div>
              </div>
              {agents.length > 1 && (
                <button
                  className={styles.removeBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(agent.id);
                  }}
                  title="删除"
                >
                  ×
                </button>
              )}
            </div>
          );
        })}

        {filtered.length === 0 && (
          <div className={styles.empty}>
            {search ? `没有匹配 "${search}" 的 Agent` : "暂无 Agent"}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(AgentListPanel);
