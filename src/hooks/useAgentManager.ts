import { useState, useCallback, useRef } from "react";
import { nanoid } from "nanoid";
import type {
  AgentState,
  AgentStatus,
  ChatMessage,
  InteractionMode,
} from "../types";

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "你好！我是 Claude，你的 WPS Excel AI 助手。\n\n我可以帮你：\n- **清洗数据**（去重、删除空白、统一格式）\n- **转换格式**（日期、数字、文本类型）\n- **批量操作**（填充、替换、计算）\n\n请先**选中一个区域**，然后告诉我你想做什么。",
  timestamp: Date.now(),
};

function createAgent(overrides?: Partial<AgentState>): AgentState {
  const now = Date.now();
  return {
    id: nanoid(),
    name: "",
    status: "idle",
    messages: [
      { ...WELCOME_MESSAGE, id: `welcome-${nanoid(6)}`, timestamp: now },
    ],
    mode:
      (localStorage.getItem("wps-claude-mode") as InteractionMode) || "agent",
    model: "claude-sonnet-4-6",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export interface AgentManagerActions {
  createNewAgent: () => string;
  switchAgent: (agentId: string) => void;
  removeAgent: (agentId: string) => void;
  updateActiveMessages: (
    updater: (prev: ChatMessage[]) => ChatMessage[],
  ) => void;
  setActiveStatus: (status: AgentStatus, error?: string) => void;
  setActiveName: (name: string) => void;
  setActiveMode: (mode: InteractionMode) => void;
  setActiveModel: (model: string) => void;
  getAgent: (agentId: string) => AgentState | undefined;
  loadAgentsFromSessions: (
    sessions: Array<{
      id: string;
      title: string;
      messages: ChatMessage[];
      model?: string;
      mode?: string;
      updatedAt?: number;
      createdAt?: number;
    }>,
  ) => void;
}

export interface AgentManagerState {
  agents: AgentState[];
  activeAgentId: string;
  activeAgent: AgentState;
}

export function useAgentManager(): AgentManagerState & AgentManagerActions {
  const [agents, setAgents] = useState<AgentState[]>(() => [createAgent()]);
  const [activeAgentId, setActiveAgentId] = useState<string>(
    () => agents[0]?.id ?? "",
  );

  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  const activeAgent = agents.find((a) => a.id === activeAgentId) ?? agents[0];

  const createNewAgent = useCallback((): string => {
    const agent = createAgent();
    setAgents((prev) => [agent, ...prev]);
    setActiveAgentId(agent.id);
    return agent.id;
  }, []);

  const switchAgent = useCallback((agentId: string) => {
    const exists = agentsRef.current.some((a) => a.id === agentId);
    if (exists) {
      setActiveAgentId(agentId);
    }
  }, []);

  const removeAgent = useCallback((agentId: string) => {
    setAgents((prev) => {
      const filtered = prev.filter((a) => a.id !== agentId);
      if (filtered.length === 0) {
        const fresh = createAgent();
        return [fresh];
      }
      return filtered;
    });
    setActiveAgentId((prevId) => {
      if (prevId === agentId) {
        const remaining = agentsRef.current.filter((a) => a.id !== agentId);
        return remaining[0]?.id ?? "";
      }
      return prevId;
    });
  }, []);

  const updateAgent = useCallback(
    (agentId: string, patch: Partial<AgentState>) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId ? { ...a, ...patch, updatedAt: Date.now() } : a,
        ),
      );
    },
    [],
  );

  const updateActiveMessages = useCallback(
    (updater: (prev: ChatMessage[]) => ChatMessage[]) => {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === activeAgentId
            ? { ...a, messages: updater(a.messages), updatedAt: Date.now() }
            : a,
        ),
      );
    },
    [activeAgentId],
  );

  const setActiveStatus = useCallback(
    (status: AgentStatus, error?: string) => {
      updateAgent(activeAgentId, { status, error });
    },
    [activeAgentId, updateAgent],
  );

  const setActiveName = useCallback(
    (name: string) => {
      updateAgent(activeAgentId, { name });
    },
    [activeAgentId, updateAgent],
  );

  const setActiveMode = useCallback(
    (mode: InteractionMode) => {
      updateAgent(activeAgentId, { mode });
      localStorage.setItem("wps-claude-mode", mode);
    },
    [activeAgentId, updateAgent],
  );

  const setActiveModel = useCallback(
    (model: string) => {
      updateAgent(activeAgentId, { model });
    },
    [activeAgentId, updateAgent],
  );

  const getAgent = useCallback(
    (agentId: string) => agentsRef.current.find((a) => a.id === agentId),
    [],
  );

  const loadAgentsFromSessions = useCallback(
    (
      sessions: Array<{
        id: string;
        title: string;
        messages: ChatMessage[];
        model?: string;
        mode?: string;
        updatedAt?: number;
        createdAt?: number;
      }>,
    ) => {
      if (sessions.length === 0) return;

      const loaded: AgentState[] = sessions.map((s) => ({
        id: s.id,
        name: s.title || "",
        status: "done" as AgentStatus,
        messages: s.messages,
        mode: (s.mode as InteractionMode) || "agent",
        model: s.model || "claude-sonnet-4-6",
        createdAt: s.createdAt || Date.now(),
        updatedAt: s.updatedAt || Date.now(),
      }));

      setAgents(loaded);
      setActiveAgentId(loaded[0].id);
    },
    [],
  );

  return {
    agents,
    activeAgentId,
    activeAgent,
    createNewAgent,
    switchAgent,
    removeAgent,
    updateActiveMessages,
    setActiveStatus,
    setActiveName,
    setActiveMode,
    setActiveModel,
    getAgent,
    loadAgentsFromSessions,
  };
}
