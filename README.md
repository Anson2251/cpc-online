# CPC Online IDE

Web IDE for CAIE-style pseudocode, built with Vue 3 + Vite.  
**Note:** This repository contains only the **frontend UI** (editor, file explorer, output panel, debugger UI controls).  
The actual pseudocode interpreter (lexer, parser, runtime, and debugger engine) lives in the [`vibe-cpc` submodule](https://github.com/Anson2251/vibe-cpc) (`src/libs/cpc-core`).

## Overview

This project provides an online coding environment for pseudocode practice with:

- File explorer backed by IndexedDB virtual filesystem
- Multi-tab editor with per-tab history and autosave
- Pseudocode-aware syntax highlighting and autocomplete
- Program output panel and runtime diagnostics
- Workspace archive export and file-level download
- **Debugger UI** that communicates with the interpreter's built‑in debugger API

> [!IMPORTANT]
> **The interpreter core (including `DEBUGGER` support, breakpoints, step controls, and call stack inspection) is not implemented here – it is provided by the `vibe-cpc` submodule.**

## Architecture

```text
┌─────────────────────────────────────────┐
│           Vue Frontend (this repo)      │
│  • Editor UI (CodeMirror)               │
│  • File explorer & workspace            │
│  • Output panel                         │
│  • Debugger controls (buttons, UI)      │
└────────────────┬────────────────────────┘
                 │
                 │ postMessage / worker
                 ▼
┌─────────────────────────────────────────┐
│            Web Worker                   │
│         (interpreter.ts)                │
└────────────────┬────────────────────────┘
                 │
    ┌────────────▼────────────┐
    │  cpc-core (submodule)   │
    │  • Lexer / Parser       │
    │  • Runtime / Executor   │
    │  • Debugger API         │
    │    (breakpoints, step,  │
    │     call stack, etc.)   │
    └─────────────────────────┘
```

The frontend sends pseudocode to the worker, which loads the `vibe-cpc` interpreter, executes the code, and sends back output or pause events. All debugger logic (stepping, breakpoints, variable inspection) is handled inside the submodule.

## Repository Notes

**Important:** This repository uses the `vibe-cpc` submodule. The submodule points to the [vibe-cpc](https://github.com/Anson2251/vibe-cpc) repository (the actual interpreter).

Clone with submodules enabled:

```bash
git clone --recurse-submodules "https://github.com/Anson2251/cpc-online.git"
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

To also work on the interpreter itself, navigate into `cpc-core` and treat it as a separate repository.

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

### Build

```bash
pnpm build
```

### Type check

```bash
pnpm type-check
```

### Lint and format

```bash
pnpm lint
pnpm format
```

## Tech Stack

- Vue 3 + TypeScript
- Vite
- Pinia
- Naive UI
- CodeMirror 6
- IndexedDB (`idb`)

## License

AGPL

## Third-Party Content

The **CPC Guide** and **CPC Insert** documents included in this project are copyrighted by **Cambridge University Press & Assessment**. They are used here for educational reference only. All rights remain with the original copyright holder.

## Contributing

Contributions to the IDE UI (this repository) are always welcome!  
Please open issues or PRs here for:

- Editor features, file explorer, workspace management
- Syntax highlighting, autocomplete, or other UI/UX improvements
- Build, dev server, or deployment related changes

**For issues related to the pseudocode interpreter (language syntax, runtime behavior, debugger core, breakpoint handling, step controls, call stack inspection, or `DEBUGGER` support), please report them to the [`vibe-cpc` repository](https://github.com/Anson2251/vibe-cpc) instead.**  

When in doubt, feel free to open an issue here and we will redirect you if it belongs to the interpreter side.
