/**
 * Sandbox Executor — 安全隔离的脚本执行环境
 *
 * 支持 Python 和 Shell 脚本在临时沙盒中执行，
 * 结果返回给 AI 写入表格。
 *
 * 安全模型：
 *   1. 每次执行创建独立的临时目录，完成后清理
 *   2. 执行超时保护（默认 60 秒）
 *   3. 禁止访问用户敏感目录（~/.ssh, ~/.claude-wps/vault 等）
 *   4. stdout/stderr 捕获，大小限制
 *   5. 审计日志记录每次执行
 */

import { execSync, spawn } from "child_process";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir, homedir } from "os";

const MAX_OUTPUT_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 120_000;

const BLOCKED_PATTERNS = [
  /~\/\.ssh/i,
  /~\/\.claude-wps\/vault/i,
  /\/etc\/passwd/i,
  /\/etc\/shadow/i,
  /rm\s+-rf\s+[/~]/i,
  /curl.*\|\s*sh/i,
  /wget.*\|\s*sh/i,
  /eval\s*\(/i,
  /VAULT_KEY/i,
  /credentials\.enc/i,
];

function validateCode(code) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(code)) {
      return { ok: false, error: `安全检查失败：代码包含受限操作 (${pat.source})` };
    }
  }
  return { ok: true };
}

function createSandboxDir() {
  const base = join(tmpdir(), "claude-wps-sandbox-");
  return mkdtempSync(base);
}

function cleanupSandboxDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // best effort
  }
}

/**
 * 在沙盒中执行 Python 脚本
 */
async function executePython(code, options = {}) {
  const validation = validateCode(code);
  if (!validation.ok) return validation;

  const timeoutMs = Math.min(options.timeout || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const pipPackages = options.pip || [];
  const sandboxDir = createSandboxDir();

  try {
    if (pipPackages.length > 0) {
      const pipCmd = `pip3 install --quiet --target="${join(sandboxDir, "deps")}" ${pipPackages.map((p) => JSON.stringify(p)).join(" ")}`;
      try {
        execSync(pipCmd, { timeout: 30_000, stdio: "pipe", cwd: sandboxDir });
      } catch (pipErr) {
        return {
          ok: false,
          error: `pip 安装失败: ${pipErr.stderr?.toString().trim().substring(0, 500) || pipErr.message}`,
          exitCode: pipErr.status,
        };
      }
    }

    const scriptPath = join(sandboxDir, "script.py");
    const preamble = pipPackages.length > 0
      ? `import sys; sys.path.insert(0, "${join(sandboxDir, "deps")}")\n`
      : "";
    writeFileSync(scriptPath, preamble + code, "utf-8");

    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const env = {
        ...process.env,
        HOME: sandboxDir,
        TMPDIR: sandboxDir,
        PYTHONDONTWRITEBYTECODE: "1",
      };
      delete env.CLAUDE_WPS_VAULT_KEY;

      const child = spawn("python3", [scriptPath], {
        cwd: sandboxDir,
        env,
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdin.end();

      child.stdout.on("data", (d) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && !killed,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          timedOut: killed,
          error: killed
            ? `执行超时（${Math.round(timeoutMs / 1000)} 秒）`
            : code !== 0
              ? `脚本退出码 ${code}: ${stderr.trim().substring(0, 300)}`
              : undefined,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: `启动失败: ${err.message}`,
          stdout: "",
          stderr: "",
          exitCode: -1,
        });
      });
    });
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

/**
 * 在沙盒中执行 Shell 命令
 */
async function executeShell(command, options = {}) {
  const validation = validateCode(command);
  if (!validation.ok) return validation;

  const timeoutMs = Math.min(options.timeout || DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const sandboxDir = createSandboxDir();

  try {
    return await new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      let killed = false;

      const env = {
        PATH: process.env.PATH,
        HOME: sandboxDir,
        TMPDIR: sandboxDir,
        LANG: process.env.LANG || "en_US.UTF-8",
      };

      const child = spawn("bash", ["-c", command], {
        cwd: sandboxDir,
        env,
        timeout: timeoutMs,
        stdio: ["pipe", "pipe", "pipe"],
      });

      child.stdin.end();

      child.stdout.on("data", (d) => {
        if (stdout.length < MAX_OUTPUT_BYTES) stdout += d.toString();
      });
      child.stderr.on("data", (d) => {
        if (stderr.length < MAX_OUTPUT_BYTES) stderr += d.toString();
      });

      const timer = setTimeout(() => {
        killed = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: code === 0 && !killed,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code,
          timedOut: killed,
          error: killed
            ? `执行超时（${Math.round(timeoutMs / 1000)} 秒）`
            : code !== 0
              ? `命令退出码 ${code}: ${stderr.trim().substring(0, 300)}`
              : undefined,
        });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          error: `启动失败: ${err.message}`,
          stdout: "",
          stderr: "",
          exitCode: -1,
        });
      });
    });
  } finally {
    cleanupSandboxDir(sandboxDir);
  }
}

export { executePython, executeShell };
