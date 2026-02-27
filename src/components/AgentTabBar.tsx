import { memo, useEffect } from "react";
import type { AgentState, AgentStatus } from "../types";
import styles from "./AgentTabBar.module.css";

interface AgentTabBarProps {
  agents: AgentState[];
  activeAgentId: string;
  onSwitch: (agentId: string) => void;
  onClose: (agentId: string) => void;
  onNew: () => void;
  onOpenList: () => void;
  visible: boolean;
}

const STATUS_COLORS: Record<AgentStatus, string> = {
  idle: "#888888",
  running: "#D97757",
  done: "#4ade80",
  failed: "#ef4444",
  paused: "#3b82f6",
};

function tabLabel(agent: AgentState): string {
  if (agent.name) {
    return agent.name.length > 8 ? agent.name.slice(0, 8) + "…" : agent.name;
  }
  return "新对话";
}

function AgentTabBar({
  agents,
  activeAgentId,
  onSwitch,
  onClose,
  onNew,
  onOpenList,
  visible,
}: AgentTabBarProps) {
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key === "t" && e.shiftKey) {
        e.preventDefault();
        onNew();
        return;
      }

      if (e.key === "w") {
        e.preventDefault();
        onClose(activeAgentId);
        return;
      }

      if (e.key === "Tab") {
        e.preventDefault();
        const idx = agents.findIndex((a) => a.id === activeAgentId);
        const next = e.shiftKey
          ? (idx - 1 + agents.length) % agents.length
          : (idx + 1) % agents.length;
        onSwitch(agents[next].id);
        return;
      }

      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= 9 && num <= agents.length) {
        e.preventDefault();
        onSwitch(agents[num - 1].id);
      }
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, agents, activeAgentId, onSwitch, onClose, onNew]);

  if (!visible) return null;

  const visibleAgents = agents.slice(0, 8);

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {visibleAgents.map((agent) => {
          const isActive = agent.id === activeAgentId;
          const isRunning = agent.status === "running";
          return (
            <button
              key={agent.id}
              className={`${styles.tab} ${isActive ? styles.active : ""}`}
              onClick={() => onSwitch(agent.id)}
              title={agent.name || "新对话"}
            >
              <span
                className={`${styles.statusDot} ${isRunning ? styles.pulsing : ""}`}
                style={{ backgroundColor: STATUS_COLORS[agent.status] }}
              />
              <span className={styles.tabLabel}>{tabLabel(agent)}</span>
              {agents.length > 1 && (
                <span
                  className={styles.closeTab}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClose(agent.id);
                  }}
                  title="关闭"
                >
                  ×
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className={styles.actions}>
        <button
          className={styles.listBtn}
          onClick={onOpenList}
          title="所有 Agents"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
        </button>
        <button
          className={styles.newBtn}
          onClick={onNew}
          title="新建 Agent (⌘⇧T)"
        >
          <span>+</span>
        </button>
      </div>
    </div>
  );
}

export default memo(AgentTabBar);
