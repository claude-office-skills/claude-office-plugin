/**
 * WPS 加载项入口文件
 *
 * 响应 ribbon.xml 中定义的按钮操作，
 * 打开侧边栏 TaskPane 加载 Claude AI 界面。
 */

const PLUGIN_URL = "http://localhost:5173";

function OnOpenClaudePanel() {
  try {
    const taskPane = wps.createTaskPane(PLUGIN_URL + "/index.html");
    taskPane.Visible = true;
  } catch (e) {
    alert(
      "打开 Claude 面板失败：" +
        e.message +
        "\n\n请确保开发服务器已启动：\ncd ~/需求讨论/claude-wps-plugin && npm run dev",
    );
  }
}

function OnOpenJSDebugger() {
  try {
    if (
      typeof wps.PluginStorage !== "undefined" &&
      typeof wps.PluginStorage.openDebugger === "function"
    ) {
      wps.PluginStorage.openDebugger();
    } else if (typeof wps.openDevTools === "function") {
      wps.openDevTools();
    } else if (
      typeof Application !== "undefined" &&
      typeof Application.PluginStorage !== "undefined"
    ) {
      Application.PluginStorage.openDebugger();
    } else {
      alert("JS 调试器在当前环境下不可用");
    }
  } catch (e) {
    alert("打开调试器失败：" + e.message);
  }
}

function GetClaudeIcon() {
  return "claude-icon.png";
}

function GetDebugIcon() {
  return "debug-icon.png";
}

function OnAddinLoad(ribbonUI) {
  if (typeof ribbonUI === "object") {
    // ribbon 引用
  }
}

window.ribbon_bindUI = function (bindUI) {
  bindUI({
    OnOpenClaudePanel: OnOpenClaudePanel,
    OnOpenJSDebugger: OnOpenJSDebugger,
    GetClaudeIcon: GetClaudeIcon,
    GetDebugIcon: GetDebugIcon,
  });
};
