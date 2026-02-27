import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * 全局错误边界：捕获子组件未处理的运行时错误，
 * 防止整个界面崩溃，向用户显示可恢复的提示。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#dc2626" }}>
            ⚠ 界面出现异常
          </div>
          <div
            style={{
              fontSize: "12px",
              color: "#6b7280",
              wordBreak: "break-all",
              background: "#f3f4f6",
              padding: "8px",
              borderRadius: "4px",
            }}
          >
            {this.state.error?.message ?? "未知错误"}
          </div>
          <button
            onClick={this.handleReset}
            style={{
              padding: "6px 12px",
              fontSize: "12px",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
              width: "fit-content",
            }}
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
