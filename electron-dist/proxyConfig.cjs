var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/proxyConfig.ts
var proxyConfig_exports = {};
__export(proxyConfig_exports, {
  ONE_BROWSER_SESSION_PARTITION: () => ONE_BROWSER_SESSION_PARTITION,
  buildElectronProxyConfig: () => buildElectronProxyConfig,
  sanitizeHostToken: () => sanitizeHostToken,
  toPublicProxyStatus: () => toPublicProxyStatus,
  validateProxyInput: () => validateProxyInput
});
module.exports = __toCommonJS(proxyConfig_exports);
var ONE_BROWSER_SESSION_PARTITION = "persist:one-browser";
var DEFAULT_BYPASS_HOSTS = ["<local>", "localhost", "127.0.0.1", "[::1]", "*.local"];
function sanitizeHostToken(raw) {
  const s = String(raw || "").trim();
  if (!s || s.length > 253) return "";
  if (/[\s,;=/\\<>'"`@?#]/.test(s)) return "";
  if (s.includes("://")) return "";
  return s;
}
function validateProxyInput(input) {
  const mode = input?.mode;
  if (!["direct", "http", "https", "socks5"].includes(mode)) {
    return { ok: false, error: "\u4E0D\u652F\u6301\u7684\u4EE3\u7406\u534F\u8BAE\uFF0C\u8BF7\u9009\u62E9 direct / http / https / socks5\u3002" };
  }
  const extraBypass = Array.isArray(input?.bypassHosts) ? input.bypassHosts.map(sanitizeHostToken).filter(Boolean) : [];
  if (mode === "direct") {
    return {
      ok: true,
      value: {
        mode: "direct",
        bypassHosts: extraBypass,
        label: input?.label ? String(input.label).trim().slice(0, 64) : void 0
      }
    };
  }
  const host = sanitizeHostToken(String(input?.host || ""));
  if (!host) {
    return { ok: false, error: "\u8BF7\u8F93\u5165\u5408\u6CD5\u7684\u4EE3\u7406\u670D\u52A1\u5668\u4E3B\u673A\u540D\u6216 IP \u5730\u5740\uFF08\u4E0D\u542B\u534F\u8BAE\u524D\u7F00\u548C\u8DEF\u5F84\uFF09\u3002" };
  }
  const portNum = Number(input?.port);
  if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
    return { ok: false, error: "\u4EE3\u7406\u7AEF\u53E3\u5FC5\u987B\u4E3A 1\u201365535 \u4E4B\u95F4\u7684\u6574\u6570\u3002" };
  }
  const username = typeof input?.username === "string" && input.username.trim() ? input.username.trim() : void 0;
  const password = typeof input?.password === "string" && input.password.length > 0 ? input.password : void 0;
  const label = typeof input?.label === "string" && input.label.trim() ? input.label.trim().slice(0, 64) : void 0;
  return {
    ok: true,
    value: {
      mode,
      host,
      port: portNum,
      username,
      password,
      bypassHosts: extraBypass,
      label
    }
  };
}
function buildElectronProxyConfig(proxy, oneAppOrigin) {
  if (proxy.mode === "direct" || !proxy.host || !proxy.port) {
    return { mode: "direct" };
  }
  const bypassSet = new Set(DEFAULT_BYPASS_HOSTS);
  for (const h of proxy.bypassHosts || []) {
    if (h) bypassSet.add(h);
  }
  if (oneAppOrigin) {
    try {
      const u = new URL(oneAppOrigin);
      if (u.hostname) bypassSet.add(u.hostname);
    } catch {
    }
  }
  const proxyRules = proxy.mode === "socks5" ? `socks5h://${proxy.host}:${proxy.port}` : proxy.mode === "https" ? `https=${proxy.host}:${proxy.port}` : `http=${proxy.host}:${proxy.port}`;
  return {
    mode: "fixed_servers",
    proxyRules,
    proxyBypassRules: Array.from(bypassSet).join(",")
  };
}
function toPublicProxyStatus(proxy, oneAppOrigin, error) {
  const built = buildElectronProxyConfig(proxy, oneAppOrigin);
  return {
    mode: proxy.mode,
    active: proxy.mode !== "direct" && !!proxy.host && !!proxy.port,
    label: proxy.label,
    host: proxy.host,
    port: proxy.port,
    hasCredentials: !!(proxy.username || proxy.password),
    remoteDns: proxy.mode === "socks5",
    partition: ONE_BROWSER_SESSION_PARTITION,
    bypassRules: built.proxyBypassRules || DEFAULT_BYPASS_HOSTS.join(","),
    isolationNotice: "\u4EC5\u4F5C\u7528\u4E8E ONE \u5185\u7F6E\u6D4F\u89C8\u5668\u4F1A\u8BDD (persist:one-browser)\uFF1B\u4E0D\u6539\u53D8\u7CFB\u7EDF\u7F51\u7EDC\uFF0C\u4E0D\u5F71\u54CD ONE \u901A\u8BDD\u3001\u804A\u5929\u4E0E\u8D26\u53F7\u8BA4\u8BC1\u901A\u9053\u3002",
    updatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    ...error ? { error } : {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ONE_BROWSER_SESSION_PARTITION,
  buildElectronProxyConfig,
  sanitizeHostToken,
  toPublicProxyStatus,
  validateProxyInput
});
