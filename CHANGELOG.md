# Changelog

All notable changes to the VibeLocus project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-21

### Added
- Initial public release of VibeLocus core library and static web application.
- Multi-provider LLM orchestration hook (`useLLM`) supporting Gemini, OpenAI, Ollama, Gradio Colab tunnels, Chrome Built-in AI, and local in-browser Web Workers.
- Client-side IndexedDB memory palace management hook (`useIndexedDB`) with `lz-string` data compression and storage quota calculation.
- Text-to-speech synthesis hook (`useSpeech`) with markdown stripping and automated voice selection.
- In-browser semantic vector retrieval component (`SemanticSearch`) using `@xenova/transformers` (`all-MiniLM-L6-v2`) for local 384D embeddings.
- Safe AST markdown tokenization component (`SafeMarkdown`) preventing XSS script execution without relying on `dangerouslySetInnerHTML`.
- Modular UI components: `Sidebar`, `Settings`, `TutorChat`, `SyllabusList`, `MemoryHub`, and `ShareModal`.
- Client-side security utilities: XOR-based API key obfuscation, XSS sanitization, and filename safety filters.
- State sharing utilities: compressed URL hash fragment encoder and decoder.
- Dual CommonJS and ES Module packaging with comprehensive TypeScript type declarations via `tsup`.
- Automated test suite covering security utilities, state sharing, AST parsing, and top-level exports via Vitest.
- Continuous Integration workflow with GitHub Actions.
