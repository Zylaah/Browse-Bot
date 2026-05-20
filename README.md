<h1 align="center">BrowseBot (Findbar Only)</h1>
<div align="center">
    <a href="https://zen-browser.app/">
        <img width="240" alt="zen-badge-dark" src="https://raw.githubusercontent.com/heyitszenithyt/zen-browser-badges/fb14dcd72694b7176d141c774629df76af87514e/light/zen-badge-light.png" />
    </a>
</div>

A **fork** of [Vertex-Mods/Browse-Bot](https://github.com/Vertex-Mods/Browse-Bot) scoped to **Findbar AI only**: a floating, page-aware chat on the native findbar in **Zen Browser**. URL bar AI and agentic browser tools are removed.

## Features

- **Floating chat UI** on the findbar (minimal Arc-style mode + expanded chat)
- **Multi-provider LLM** (Gemini, Mistral, OpenAI, Claude, Grok, Perplexity, Cerebras, Ollama)
- **Page content awareness** — page text is sent in the system prompt for Q&A
- **Optional citations** (structured quotes from the page)
- **Streaming responses** via direct API `fetch` (same pattern as [urlbar-ai](https://github.com/Zylaah/urlbar-ai)), with **marked.js** + **DOMPurify** for markdown
- **Context menu** — Ask AI / summarize with selection templates
- **Zen Command Palette** — Summarize page, expand findbar, open settings
- **Customizable** via Sine settings or `about:config`

## Removed (vs upstream Browse-Bot)

- URL bar AI (`Ctrl+Space` command mode)
- Agentic mode and all browser tool calls (tabs, search, workspaces, etc.)
- YouTube transcript tools (page text only)

## Installation (Sine)

1. Install [Sine](https://github.com/CosmoCreeper/Sine) on Zen Browser.
2. Install this mod from your fork or a Sine catalog entry pointing at `Zylaah/Browse-Bot` (branch `findbar-only`).
3. Restart Zen when prompted.

## Usage

1. Configure an API key (or use Ollama locally) when prompted.
2. `Ctrl+F` — open findbar; **Alt+Enter** or **Ask** sends to AI (minimal mode).
3. `Ctrl+Shift+F` — open findbar directly in AI chat (configurable).
4. Right-click — **Ask AI** / summarize (if enabled).

## Key preferences

| Preference | Default | Description |
| ---------- | ------- | ----------- |
| `extension.browse-bot.findbar-ai.enabled` | `true` | Master toggle |
| `extension.browse-bot.llm-provider` | `gemini` | AI provider |
| `extension.browse-bot.findbar-ai.stream-enabled` | `true` | Stream replies |
| `extension.browse-bot.findbar-ai.citations-enabled` | `false` | Quote-based citations (incompatible with streaming) |
| `extension.browse-bot.findbar-ai.shortcut-findbar` | `ctrl+shift+f` | Open AI findbar |

See Sine settings or upstream README for full provider keys and findbar appearance prefs.

## Privacy

Page text is sent to your chosen LLM provider (except Ollama). Do not use on sensitive pages unless you trust the provider.

## Credits

Based on [Browse-Bot](https://github.com/Vertex-Mods/Browse-Bot) by Bibek Bhusal / Vertex Mods.

## License

MIT — see [LICENSE](./LICENSE).
