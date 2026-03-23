# Vite 6 → 8 Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Vite from v6 to v8 (Rolldown-based bundler) and bump `@vitejs/plugin-react` from v4 to v6 for latest Vite 8 support.

**Architecture:** Direct upgrade — bump versions in `package.json`, reinstall, verify build and dev server. No config changes needed. Vite 8's compatibility layer handles the esbuild→Rolldown transition transparently for our minimal config.

**Tech Stack:** Vite 8.0.x, @vitejs/plugin-react 6.0.x, @tailwindcss/vite 4.2.x+, Node.js 24.14

---

## File Map

| File | Action | What Changes |
|------|--------|--------------|
| `frontend/package.json` | Modify | Bump `vite` ^6→^8, `@vitejs/plugin-react` ^4→^6 in `devDependencies` |
| `frontend/package-lock.json` | Regenerated | `npm install` regenerates this |
| `frontend/vite.config.ts` | Verify only | No changes expected — `defineConfig`, `react()`, `tailwindcss()`, proxy all stable |
| `frontend/src/vite-env.d.ts` | Verify only | `/// <reference types="vite/client" />` — same in v8 |
| `frontend/tsconfig.json` | Verify only | Project references to app/node configs — no change |
| `frontend/tsconfig.app.json` | Verify only | `"types": ["vite/client"]` — same in v8 |
| `frontend/tsconfig.node.json` | Verify only | `"include": ["vite.config.ts"]` — no change |
| `frontend/src/api/client.ts` | Verify only | `import.meta.env.VITE_API_URL` — stable API across versions |
| `frontend/index.html` | Verify only | Standard Vite entry point — no breaking syntax changes |
| `frontend/eslint.config.js` | Verify only | `reactRefresh.configs.vite` — no version coupling |
| `frontend/Dockerfile` | Verify only | Base image `node:22-alpine` must satisfy `^20.19.0 \|\| >=22.12.0` |

## Research Summary

| Package | Current | Target | Vite 8 Compatible? |
|---------|---------|--------|---------------------|
| `vite` | ^6.0.0 (installed 6.4.1) | ^8.0.0 (latest 8.0.1) | — |
| `@vitejs/plugin-react` | ^4.5.0 | ^6.0.0 (latest 6.0.1) | v4 supports up to Vite 7. v5.2.0 also supports Vite 8, but v6 is preferred as the latest major — it's Vite-8-native and will get the longest support. v6 has optional peer deps on `@rolldown/plugin-babel` and `babel-plugin-react-compiler` (not needed unless using React Compiler). |
| `@tailwindcss/vite` | ^4.0.0 | ^4.0.0 (no change) | Vite 8 support added in v4.2.2+ (`vite: ^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8`). Earlier 4.x versions only support up to Vite 7. Our `^4.0.0` range will resolve to 4.2.x+ on a fresh install, but verify the installed version is >=4.2.2 after `npm install`. |
| `eslint-plugin-react-refresh` | ^0.5.2 | ^0.5.2 (no change) | No Vite peer dep |

**Key Vite 8 changes (that don't affect us):**
- Rolldown replaces esbuild + Rollup under the hood (transparent — our config has no `build.rollupOptions` or esbuild overrides)
- Node.js engine requirement: `^20.19.0 || >=22.12.0` (we're on 24.14 locally, Docker uses node:22-alpine which resolves to 22.22+ — both fine)
- `vite/client` types unchanged — `import.meta.env`, `import.meta.hot` still work identically

---

## Task 1: Bump dependency versions and reinstall

**Files:**
- Modify: `frontend/package.json` — `vite` and `@vitejs/plugin-react` entries in `devDependencies`
- Regenerated: `frontend/package-lock.json`

- [ ] **Step 1: Update vite version**

In `frontend/package.json`, find the `"vite"` entry in `devDependencies` and change:
```json
"vite": "^8.0.0"
```

- [ ] **Step 2: Update @vitejs/plugin-react version**

In `frontend/package.json`, find the `"@vitejs/plugin-react"` entry in `devDependencies` and change:
```json
"@vitejs/plugin-react": "^6.0.0"
```

- [ ] **Step 3: Run npm install**

```bash
cd frontend && npm install
```

Expected: Clean install with no peer dependency errors for vite/plugin-react/tailwindcss.

- [ ] **Step 4: Verify installed versions**

```bash
cd frontend && npx vite --version && npm ls @vitejs/plugin-react @tailwindcss/vite
```

Expected: `vite/8.0.x`, `@vitejs/plugin-react@6.0.x`, `@tailwindcss/vite@4.2.x` or higher (must be >=4.2.2 for Vite 8 support).

- [ ] **Step 5: Commit all dependency changes together**

```bash
cd frontend
git add package.json package-lock.json
git commit -m "chore: bump vite ^6→^8, @vitejs/plugin-react ^4→^6"
```

---

## Task 2: Verify production build

**Files:**
- Verify: `frontend/vite.config.ts`, `frontend/tsconfig.json`, `frontend/tsconfig.app.json`, `frontend/tsconfig.node.json`

- [ ] **Step 1: Run TypeScript check + Vite build**

```bash
cd frontend && npm run build
```

Expected: `tsc -b && vite build` completes with no errors. Output in `frontend/dist/`.

- [ ] **Step 2: Inspect build output**

```bash
ls -la frontend/dist/ && ls frontend/dist/assets/ | head -10
```

Expected: `index.html` + hashed JS/CSS assets in `dist/assets/`.

---

## Task 3: Verify dev server and types

- [ ] **Step 1: Start dev server and check it boots**

```bash
cd frontend && timeout 15 npm run dev 2>&1 | grep -m1 "ready in" || echo "WARN: dev server did not start within 15s"
```

Expected: Output shows `VITE v8.0.x ready in Xms` with local URL.

- [ ] **Step 2: Check that vite/client types still resolve**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: No type errors related to `vite/client`, `import.meta.env`, or the config file.

---

## Task 4: Verify Docker compatibility

- [ ] **Step 1: Check Dockerfile base image Node.js version**

```bash
grep -i "FROM node" frontend/Dockerfile
```

Expected: `node:22-alpine` or similar. Node 22.12+ satisfies Vite 8's engine requirement (`^20.19.0 || >=22.12.0`).

---

## Task 5: Final verification

- [ ] **Step 1: Run production build one final time**

```bash
cd frontend && npm run build
```

Expected: Clean build, zero warnings from Vite.

- [ ] **Step 2: Verify no uncommitted changes remain**

```bash
cd frontend && git status
```

Expected: Clean working tree (or only previously uncommitted files unrelated to Vite).
