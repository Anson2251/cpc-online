# CPC Online IDE

Web IDE for CAIE-style pseudocode, built with Vue 3 + Vite. It uses the `cpc-core` interpreter as a Git submodule and runs programs directly in the browser worker.

## Overview

This project provides an online coding environment for pseudocode practice with:

- File explorer backed by IndexedDB virtual filesystem
- Multi-tab editor with per-tab history and autosave
- Pseudocode-aware syntax highlighting and autocomplete
- Program output panel and runtime diagnostics
- Workspace archive export and file-level download

## Architecture

```text
┌───────────────────────────┐
│        Vue Frontend       │
│  (IDE shell + components) │
└────────────┬──────────────┘
             │
     ┌───────▼────────┐
     │  Web Worker    │
     │ interpreter.ts │
     └───────┬────────┘
             │
  ┌──────────▼───────────┐
  │  cpc-core submodule  │
  │ lexer/parser/runtime │
  └──────────────────────┘
```

## Repository Notes

Clone with submodules enabled:

```bash
git clone --recurse-submodules "https://github.com/Anson2251/cpc-online.git"
```

If you already cloned without submodules:

```bash
git submodule update --init --recursive
```

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

This project is licensed under GPL-3.0.
