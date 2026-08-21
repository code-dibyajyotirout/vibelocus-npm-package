# VibeLocus

Client-side spatial learning, AI tutor, memory palace indexing, and semantic vector retrieval framework.

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/vibelocus.svg)](https://www.npmjs.com/package/vibelocus)

---

## Overview

VibeLocus is an educational content creation and spatial learning architecture running **100% client-side** in the browser. It parses raw documents (PDF, DOCX, TXT, MD) and topic prompts into structured hierarchical syllabi, anchors subtopics with real-time AI tutoring, and indexes knowledge representations into an in-browser **Memory Palace** database.

Available as both a **reusable NPM library** (hooks, UI components, vector retrieval, and storage utilities) and a **standalone Next.js web application** configured for static hosting (SSG).

---

## Key Features

* **Multi-Provider LLM Orchestration**: Direct client-side integration with Google Gemini, OpenAI, Ollama (localhost), Colab Gradio endpoints, Chrome Built-in AI (`window.ai`), and in-browser WebAssembly models via `@xenova/transformers`.
* **In-Browser Semantic Retrieval**: Vector search powered by local 384-dimensional embeddings (`all-MiniLM-L6-v2`) running via WebAssembly and WebGPU without server roundtrips.
* **Spatial Memory Palace (IndexedDB)**: Client-side storage engine featuring lossless LZString data compression, storage quota telemetry, and organized Wing/Room/Drawer hierarchy.
* **Client-Side Security Safeguards**: AST markdown tokenization (bypassing `dangerouslySetInnerHTML`), XOR key rotation obfuscation for browser credentials, and strict input/filename sanitizers.
* **Compressed State Sharing**: Lossless URL fragment serialization for sharing full learning sessions, chat histories, and syllabi without backend infrastructure.
* **Speech Synthesis Suite**: Configurable browser-native text-to-speech engine with markdown stripping, cadence modulation, and voice auto-selection.
* **Full TypeScript Definitions**: Dual ES Module and CommonJS distribution with complete typings and tree-shaking support.

---

## Installation

Install the package via npm:

```bash
npm install vibelocus
```

Or using yarn or pnpm:

```bash
yarn add vibelocus
# or
pnpm add vibelocus
```

### Peer Dependencies

Ensure your project has React 18+ installed:

```bash
npm install react react-dom
```

---

## Programmatic Usage (Library)

### 1. Multi-Provider AI Tutoring Hook (`useLLM`)

```tsx
import React, { useState } from "react";
import { useLLM } from "vibelocus/hooks";

export function AssistantComponent() {
  const {
    apiProvider,
    setApiProvider,
    apiKey,
    setApiKey,
    queryLLM,
  } = useLLM();

  const [response, setResponse] = useState<string>("");

  const handleQuery = async () => {
    const messages = [
      { role: "user", content: "Explain quantum superposition simply." },
    ];
    const result = await queryLLM(messages, "You are a concise tutor.");
    setResponse(result);
  };

  return (
    <div>
      <button onClick={handleQuery}>Ask Question</button>
      <p>{response}</p>
    </div>
  );
}
```

### 2. Client-Side Memory Palace Storage (`useIndexedDB`)

```tsx
import React, { useEffect } from "react";
import { useIndexedDB } from "vibelocus/hooks";

export function MemoryComponent() {
  const { drawers, stats, quota, addDrawer, refreshStats } = useIndexedDB();

  const saveNote = async () => {
    await addDrawer({
      wing: "Computer Science",
      room: "Algorithms",
      drawer: "Graph Traversal",
      compressedContent: "Breadth-First Search uses a queue...",
      embedding: null,
      rawSize: 120,
      compressedSize: 45,
      createdAt: Date.now(),
    });
  };

  return (
    <div>
      <button onClick={saveNote}>Save to Memory Palace</button>
      <p>Total Drawers: {stats.drawersCount}</p>
      <p>Storage Quota: {quota.usage} / {quota.quota}</p>
    </div>
  );
}
```

### 3. Safe AST Markdown Rendering (`SafeMarkdown`)

```tsx
import React from "react";
import { SafeMarkdown } from "vibelocus/components";

export function ContentViewer({ rawMarkdown }: { rawMarkdown: string }) {
  return (
    <div className="content-container">
      <SafeMarkdown content={rawMarkdown} />
    </div>
  );
}
```

### 4. Security & State Sharing Utilities

```typescript
import {
  obfuscate,
  deobfuscate,
  sanitizeInput,
  encodeShareData,
  decodeShareData,
} from "vibelocus/utils";

// Encrypt credentials before writing to localStorage
const secureKey = obfuscate("user-api-key");
const restoredKey = deobfuscate(secureKey);

// Sanitize user inputs against XSS
const safeText = sanitizeInput("<script>alert('xss')</script>Hello World");

// Compress state into URL fragment
const shareUrlParam = encodeShareData({
  v: 1,
  topic: "Neural Networks",
  syllabus: [
    {
      title: "Backpropagation",
      description: "Gradient descent mechanics.",
      estimated_minutes: 20,
    },
  ],
});
```

---

## Directory Structure

```text
vibelocus/
|-- .github/
|   |-- ISSUE_TEMPLATE/
|   |   |-- bug_report.md
|   |   `-- feature_request.md
|   |-- workflows/
|   |   |-- ci.yml
|   |   `-- publish.yml
|   `-- PULL_REQUEST_TEMPLATE.md
|-- dist/                           # Generated library bundle (CJS, ESM, DTS)
|-- public/
|   |-- _headers
|   |-- favicon.svg
|   `-- og-image.png
|-- src/
|   |-- app/                        # Next.js web application
|   |   |-- api/
|   |   |   `-- gradio/route.ts
|   |   |-- layout.tsx
|   |   `-- page.tsx
|   |-- components/                 # Reusable UI components
|   |   |-- MemoryHub.tsx
|   |   |-- SafeMarkdown.tsx
|   |   |-- SemanticSearch.tsx
|   |   |-- Settings.tsx
|   |   |-- ShareModal.tsx
|   |   |-- Sidebar.tsx
|   |   |-- SyllabusList.tsx
|   |   |-- TutorChat.tsx
|   |   `-- index.ts
|   |-- hooks/                      # React hooks
|   |   |-- useIndexedDB.ts
|   |   |-- useLLM.ts
|   |   |-- useSpeech.ts
|   |   `-- index.ts
|   |-- styles/
|   |   `-- style.css
|   |-- utils/                      # Security & sharing utilities
|   |   |-- llm.worker.ts
|   |   |-- security.ts
|   |   |-- shareLink.ts
|   |   `-- index.ts
|   `-- index.ts                    # Main package entrypoint
|-- tests/                          # Automated unit test suite
|   |-- exports.test.ts
|   |-- safeMarkdown.test.ts
|   |-- security.test.ts
|   `-- shareLink.test.ts
|-- scripts/
|   `-- obfuscate.js
|-- .editorconfig
|-- .gitignore
|-- .npmignore
|-- CHANGELOG.md
|-- CODE_OF_CONDUCT.md
|-- CONTRIBUTING.md
|-- LICENSE
|-- next.config.js
|-- package.json
|-- README.md
|-- SECURITY.md
|-- tsconfig.json
|-- tsup.config.ts
`-- vitest.config.ts
```

---

## Standalone Web Application Development

### 1. Run Local Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` to interact with the local development instance.

### 2. Execute Test Suite

```bash
npm test
```

### 3. Type Checking

```bash
npm run typecheck
```

### 4. Build Package & Web Application

To build the npm distribution library:
```bash
npm run build:lib
```

To build the static web application export:
```bash
npm run build:app
```

To build both:
```bash
npm run build
```

---

## Security Model

VibeLocus enforces strict client-side data isolation:
* **Zero Telemetry**: All IndexedDB records, vector embeddings, and chats remain confined to the user's browser.
* **AST Parsing**: Safe markdown transformation mitigates inline execution vulnerabilities.
* **Obfuscation**: API credentials stored in browser persistence undergo XOR rotation encoding to prevent plain-text discovery.

---

## License

This project is licensed under the **GNU Affero General Public License v3.0 (AGPL-3.0)**. See the [LICENSE](LICENSE) file for complete details.
