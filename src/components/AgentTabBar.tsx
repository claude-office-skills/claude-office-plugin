import { memo } from "react";
import type { AgentState, AgentStatus } from "../types";
import styles from "./AgentTabBar.module.css";

interface AgentTabBarProps {
  agents: AgentState[];
  activeAgentId: string;
  onSwitch: (agentId: string) => void;
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
  onNew,
  onOpenList,
  visible,
}: AgentTabBarProps) {
  if (!visible) return null;

  return (
    <div className={styles.tabBar}>
      <div className={styles.tabs}>
        {agents
          .filter(
            (a) =>
              a.status !== "done" ||
              a.id === activeAgentId ||
              agents.indexOf(a) < 5,
          )
          .slice(0, 8)
          .map((agent) => {
            const isActive = agent.id === activeAgentId;
            return (
              <button
                key={agent.id}
                className={`${styles.tab} ${isActive ? styles.active : ""}`}
                onClick={() => onSwitch(agent.id)}
                title={agent.name || "新对话"}
              >
                <span
                  className={styles.statusDot}
                  style={{ backgroundColor: STATUS_COLORS[agent.status] }}
                />
                <span className={styles.tabLabel}>{tabLabel(agent)}</span>
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
        <button className={styles.newBtn} onClick={onNew} title="新建 Agent">
          <span>+</span>
        </button>
      </div>
    </div>
  );
}

export default memo(AgentTabBar);
