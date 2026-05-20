/**
 * Fetch-based LLM client (same approach as urlbar-ai).
 * OpenAI-compatible chat completions + Ollama native stream format.
 */

const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

const LLM_LIMITS = {
  RETRY_MAX_ATTEMPTS: 3,
  RETRY_BASE_DELAY_MS: 1000,
  RETRY_MAX_DELAY_MS: 10000,
  RENDER_DEBOUNCE_MS: 50,
};

let markedLib = null;
let DOMPurifyLib = null;

function sleepWithAbort(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    if (signal) {
      const onAbort = () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }
  });
}

/**
 * @param {string} url
 * @param {RequestInit} options
 * @param {AbortSignal|null} signal
 */
export async function fetchWithRetry(url, options = {}, signal = null) {
  const maxAttempts = LLM_LIMITS.RETRY_MAX_ATTEMPTS;
  const baseDelay = LLM_LIMITS.RETRY_BASE_DELAY_MS;
  const maxDelay = LLM_LIMITS.RETRY_MAX_DELAY_MS;
  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await fetch(url, { ...options, signal });
      if (response.ok) return response;

      if (RETRYABLE_STATUSES.includes(response.status) && attempt < maxAttempts - 1) {
        await response.text().catch(() => "");
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
        await sleepWithAbort(delay, signal);
        continue;
      }

      const errorText = await response.text().catch(() => "");
      lastError = new Error(
        `API error: ${response.status} ${response.statusText}${errorText ? ` — ${errorText.slice(0, 200)}` : ""}`
      );
      throw lastError;
    } catch (err) {
      if (err.name === "AbortError") throw err;
      const isRetryable =
        err.name === "TypeError" ||
        (err.message && /network|fetch|failed|timeout|connection|refused/i.test(err.message));
      if (isRetryable && attempt < maxAttempts - 1) {
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
        await sleepWithAbort(delay, signal);
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Request failed after retries");
}

/**
 * Load marked + DOMPurify from vendors/ next to this script.
 */
export function initMarkdownVendors() {
  if (markedLib && DOMPurifyLib) return true;
  try {
    const currentScriptPath = Components.stack.filename;
    const scriptDir = currentScriptPath.substring(0, currentScriptPath.lastIndexOf("/") + 1);
    const vendorsDir = scriptDir + "vendors/";
    Services.scriptloader.loadSubScript(vendorsDir + "marked.min.js");
    Services.scriptloader.loadSubScript(vendorsDir + "purify.min.js");
    markedLib = typeof marked !== "undefined" ? marked : null;
    DOMPurifyLib = typeof DOMPurify !== "undefined" ? DOMPurify : null;
    return !!(markedLib && DOMPurifyLib);
  } catch {
    markedLib = null;
    DOMPurifyLib = null;
    return false;
  }
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdownFallback(text, element) {
  element.textContent = "";
  const html = String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n\n+/g, "</p><p>")
    .replace(/\n/g, "<br>");
  element.innerHTML = `<p>${html}</p>`;
}

/**
 * @param {string} text
 * @param {HTMLElement} element
 */
export function renderMarkdownToElement(text, element) {
  if (!text) {
    element.textContent = "";
    return;
  }
  element.textContent = "";

  if (!markedLib || !DOMPurifyLib) {
    initMarkdownVendors();
  }

  if (markedLib && DOMPurifyLib) {
    try {
      const rawHtml = markedLib.parse(text, { gfm: true, breaks: false });
      const withCitations = rawHtml.replace(
        /\[(\d+)\](?!\()/g,
        '<span class="citation-link" data-citation-id="$1">[$1]</span>'
      );
      const withClasses = withCitations
        .replace(/<table>/g, '<table class="llm-markdown-table">')
        .replace(/<hr>/g, '<hr class="llm-markdown-hr">')
        .replace(/<a href=/g, '<a target="_blank" rel="noopener" href=');
      const sanitized = DOMPurifyLib.sanitize(withClasses.trim(), {
        ALLOWED_URI_REGEXP: /^https?:\/\//i,
        ADD_ATTR: ["target", "rel", "data-citation-id"],
      });
      element.innerHTML = sanitized.trim();
      return;
    } catch {
      /* fallback below */
    }
  }
  renderMarkdownFallback(text, element);
}

/**
 * @param {string} text
 * @returns {string}
 */
export function renderMarkdownHtml(text) {
  const el = document.createElement("div");
  renderMarkdownToElement(text, el);
  return el.innerHTML;
}

/**
 * Provider metadata + pref keys (Browse-Bot prefs).
 */
export const PROVIDER_REGISTRY = {
  mistral: {
    label: "Mistral AI",
    faviconDomain: "mistral.ai",
    apiKeyUrl: "https://console.mistral.ai/api-keys/",
    apiKeyPref: "extension.browse-bot.mistral-api-key",
    modelPref: "extension.browse-bot.mistral-model",
    defaultModel: "mistral-medium-latest",
    baseUrl: "https://api.mistral.ai/v1/chat/completions",
    kind: "openai",
  },
  openai: {
    label: "OpenAI",
    faviconDomain: "chatgpt.com",
    apiKeyUrl: "https://platform.openai.com/api-keys",
    apiKeyPref: "extension.browse-bot.openai-api-key",
    modelPref: "extension.browse-bot.openai-model",
    defaultModel: "gpt-4o",
    baseUrl: "https://api.openai.com/v1/chat/completions",
    kind: "openai",
  },
  gemini: {
    label: "Google Gemini",
    faviconDomain: "gemini.google.com",
    apiKeyUrl: "https://aistudio.google.com/app/apikey",
    apiKeyPref: "extension.browse-bot.gemini-api-key",
    modelPref: "extension.browse-bot.gemini-model",
    defaultModel: "gemini-2.5-flash",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    kind: "gemini",
  },
  ollama: {
    label: "Ollama (local)",
    faviconDomain: "ollama.com",
    apiKeyUrl: "",
    apiKeyPref: null,
    modelPref: "extension.browse-bot.ollama-model",
    defaultModel: "mixtral:8x7b",
    baseUrlPref: "extension.browse-bot.ollama-base-url",
    defaultBaseUrl: "http://localhost:11434/api/chat",
    kind: "ollama",
  },
  claude: {
    label: "Anthropic Claude",
    faviconDomain: "anthropic.com",
    apiKeyUrl: "https://console.anthropic.com/settings/keys",
    apiKeyPref: "extension.browse-bot.claude-api-key",
    modelPref: "extension.browse-bot.claude-model",
    defaultModel: "claude-sonnet-4-5",
    baseUrl: "https://api.anthropic.com/v1/messages",
    kind: "anthropic",
  },
  grok: {
    label: "xAI Grok",
    faviconDomain: "x.ai",
    apiKeyUrl: "https://console.x.ai/",
    apiKeyPref: "extension.browse-bot.grok-api-key",
    modelPref: "extension.browse-bot.grok-model",
    defaultModel: "grok-4",
    baseUrl: "https://api.x.ai/v1/chat/completions",
    kind: "openai",
  },
  perplexity: {
    label: "Perplexity AI",
    faviconDomain: "perplexity.ai",
    apiKeyUrl: "https://www.perplexity.ai/settings/api",
    apiKeyPref: "extension.browse-bot.perplexity-api-key",
    modelPref: "extension.browse-bot.perplexity-model",
    defaultModel: "sonar",
    baseUrl: "https://api.perplexity.ai/chat/completions",
    kind: "openai",
  },
  cerebras: {
    label: "Cerebras AI",
    faviconDomain: "cerebras.ai",
    apiKeyUrl: "https://cloud.cerebras.ai/",
    apiKeyPref: "extension.browse-bot.cerebras-api-key",
    modelPref: "extension.browse-bot.cerebras-model",
    defaultModel: "llama3.1-8b",
    baseUrl: "https://api.cerebras.ai/v1/chat/completions",
    kind: "openai",
  },
};

/**
 * @param {string} key
 * @param {object} prefs - object with getPref/setPref
 */
export function resolveProvider(key, prefs) {
  const def = PROVIDER_REGISTRY[key] || PROVIDER_REGISTRY.gemini;
  let baseUrl = def.baseUrl;
  if (def.kind === "ollama") {
    const raw = prefs.getPref(def.baseUrlPref, def.defaultBaseUrl);
    baseUrl = raw.includes("/chat") ? raw : raw.replace(/\/+$/, "") + "/chat";
  }
  return {
    key,
    name: def.label,
    label: def.label,
    kind: def.kind,
    apiKey: def.apiKeyPref ? prefs.getPref(def.apiKeyPref, "") : null,
    model: prefs.getPref(def.modelPref, def.defaultModel),
    baseUrl,
    faviconUrl: `https://s2.googleusercontent.com/s2/favicons?domain_url=https://${def.faviconDomain}&sz=32`,
    apiKeyUrl: def.apiKeyUrl,
    apiPref: def.apiKeyPref,
    modelPref: def.modelPref,
    needsApiKey: def.apiKeyPref !== null,
  };
}

/**
 * UI-facing provider objects (compatible with existing settings/findbar code).
 * @param {object} prefs
 */
export function createProviderFacades(prefs) {
  const facades = {};
  for (const key of Object.keys(PROVIDER_REGISTRY)) {
    const def = PROVIDER_REGISTRY[key];
    facades[key] = {
      name: key,
      label: def.label,
      faviconUrl: `https://s2.googleusercontent.com/s2/favicons?domain_url=https://${def.faviconDomain}&sz=32`,
      apiKeyUrl: def.apiKeyUrl,
      apiPref: def.apiKeyPref,
      modelPref: def.modelPref,
      AVAILABLE_MODELS: [],
      get apiKey() {
        return def.apiKeyPref ? prefs.getPref(def.apiKeyPref, "") : "not_required";
      },
      set apiKey(v) {
        if (def.apiKeyPref && typeof v === "string") prefs.setPref(def.apiKeyPref, v);
      },
      get model() {
        return prefs.getPref(def.modelPref, def.defaultModel);
      },
      set model(v) {
        if (typeof v === "string") prefs.setPref(def.modelPref, v);
      },
      getModel() {
        return this.model;
      },
    };
  }
  return facades;
}

/**
 * @param {string} systemPrompt
 * @param {Array<{role:string,content:string}>} history
 */
export function buildChatMessages(systemPrompt, history) {
  const messages = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  for (const m of history) {
    if (!m || (m.role !== "user" && m.role !== "assistant")) continue;
    const content =
      typeof m.content === "string"
        ? m.content
        : Array.isArray(m.content)
          ? m.content.map((p) => p.text || "").join("")
          : String(m.content ?? "");
    messages.push({ role: m.role, content });
  }
  return messages;
}

function buildRequestUrl(provider) {
  if (provider.kind === "ollama") {
    return provider.baseUrl;
  }
  if (provider.kind === "gemini" && provider.apiKey) {
    const base = provider.baseUrl.replace(/\/+$/, "");
    const url = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
    return `${url}?key=${encodeURIComponent(provider.apiKey)}`;
  }
  const base = provider.baseUrl.replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

function buildRequestHeaders(provider) {
  const headers = { "Content-Type": "application/json" };
  if (provider.kind === "ollama") return headers;
  if (provider.kind === "anthropic") {
    headers["x-api-key"] = provider.apiKey;
    headers["anthropic-version"] = "2023-06-01";
    return headers;
  }
  if (provider.kind === "gemini") return headers;
  headers.Authorization = `Bearer ${provider.apiKey}`;
  return headers;
}

function buildRequestBody(provider, messages, stream, sampling = {}) {
  const temperature = sampling.temperature ?? 0.7;
  const maxTokens = sampling.maxTokens ?? 2048;

  if (provider.kind === "anthropic") {
    const system = messages.find((m) => m.role === "system")?.content || "";
    const chatMessages = messages.filter((m) => m.role !== "system");
    return {
      model: provider.model,
      max_tokens: maxTokens,
      system,
      messages: chatMessages.map((m) => ({ role: m.role, content: m.content })),
      stream,
    };
  }

  return {
    model: provider.model,
    messages,
    stream,
    temperature,
    max_tokens: maxTokens,
  };
}

/**
 * @param {Error} error
 * @returns {string}
 */
export function formatLlmError(error) {
  const msg = (error?.message || String(error)).toLowerCase();
  const statusMatch = msg.match(/api error:\s*(\d+)/);
  const status = statusMatch ? parseInt(statusMatch[1], 10) : null;
  if (status === 401 || status === 403) return "Invalid API key. Check your settings.";
  if (status === 429) return "Rate limit exceeded. Wait a moment and try again.";
  if (status >= 500) return "Service temporarily unavailable. Try again later.";
  if (/network|fetch|connection|timeout|refused/i.test(msg)) {
    return "Connection error. Check your network or local server.";
  }
  return error?.message || "Something went wrong.";
}

/**
 * Stream chat completion; yields text deltas.
 * @param {object} provider
 * @param {Array} messages
 * @param {AbortSignal} signal
 */
export async function* streamChatText(provider, messages, signal, sampling = {}) {
  if (provider.kind === "anthropic") {
    yield* streamAnthropic(provider, messages, signal, sampling);
    return;
  }

  const url = buildRequestUrl(provider);
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: buildRequestHeaders(provider),
      body: JSON.stringify(buildRequestBody(provider, messages, true, sampling)),
    },
    signal
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const isOllama = provider.kind === "ollama";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("data: ")) {
        const data = trimmed.slice(6);
        if (data === "[DONE]") return;
        try {
          const json = JSON.parse(data);
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield text;
        } catch {
          /* ignore */
        }
      } else if (isOllama) {
        try {
          const json = JSON.parse(trimmed);
          const text = json.message?.content;
          if (text) yield text;
          if (json.done) return;
        } catch {
          /* ignore */
        }
      }
    }
  }
}

async function* streamAnthropic(provider, messages, signal, sampling = {}) {
  const response = await fetchWithRetry(
    provider.baseUrl,
    {
      method: "POST",
      headers: buildRequestHeaders(provider),
      body: JSON.stringify(buildRequestBody(provider, messages, true, sampling)),
    },
    signal
  );

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const json = JSON.parse(line.slice(6));
        if (json.type === "content_block_delta" && json.delta?.text) {
          yield json.delta.text;
        }
      } catch {
        /* ignore */
      }
    }
  }
}

/**
 * Non-streaming completion; returns full assistant text.
 */
export async function completeChatText(provider, messages, signal, sampling = {}) {
  let full = "";
  for await (const chunk of streamChatText(provider, messages, signal, sampling)) {
    full += chunk;
  }
  return full;
}

export { LLM_LIMITS };
