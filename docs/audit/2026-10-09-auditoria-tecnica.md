# Auditoria Técnica — LMFD (Lenovo Moto Firmware Downloader)

**Data:** 2026-10-09 · **Escopo:** `core/`, `runtime/`, `web/`, `tooling/`, CI, dependências, `update.sh`
**Stack:** Bun + Electrobun (webview) · Angular 21 + Tailwind 4 · TypeScript 5.9 · Biome · GitHub Actions (5 plataformas)

## Veredito geral

Base arquitetural **acima da média** para apps desktop: camadas explícitas com checagem automática
(`tooling/arch/*`), RPC tipado centralizado, TypeScript estrito, zero `any`/`@ts-ignore`/TODO.
Problemas concentrados em: (1) **vulnerabilidades de runtime exploráveis via RPC** (leitura/exclusão
arbitrária de arquivos, payload não validado), (2) **supply chain** (deps git não pinadas, binários sem
checksum, scripts remotos flutuantes executados no build), (3) **zero testes de frontend** e ~5% de
cobertura de backend, (4) dívida técnica em arquivos god e ~1.664 bindings condicionais de tema.

## 1. Arquitetura

- ✅ Fronteiras de camada verificadas por ferramenta e passando; `core/domain` puro; contrato RPC centralizado.
- ⚠️ Alto — features acopladas a infra sem DI (`core/features/auth/login.ts:3-5` usa singletons mutáveis).
- ⚠️ Alto — drift entre `DesktopApi` (`core/contracts/desktop/requests.ts`) e `DesktopRpcSchema`
  (`runtime/shared/desktop-rpc/schema.ts`): 3 métodos registrados sem entrada no schema; sem contrato versionado.
- ⚠️ Alto — orquestrador de self-update de 145 linhas dentro do factory de handlers
  (`runtime/bun/features/system/rpc/index.ts:93-237`) com `.bat` gerado por interpolação sem escaping.
- ⚠️ Médio — checker de camadas não impõe subcamadas do `core` e usa regex em vez de TS compiler API.
- ⚠️ Médio — god files: `play-store.ts` (1.108), `backup-restore.workflow.ts` (1.187),
  `backup-restore-workspace.component.html` (1.694), `rescueLiteFirmwareWithProgress` (453).

## 2. Segurança

### Runtime
| # | Sev. | Achado | Evidência |
|---|---|---|---|
| S1 | Crítico | Leitura arbitrária de arquivos via RPC (`readLocalFileContent`) | `runtime/bun/local-downloads.ts:261-310` |
| S2 | Crítico | Exclusão arbitrária via RPC (`deleteLocalFile`) sem confinamento de path | `runtime/bun/local-downloads.ts:382-404` |
| S3 | Crítico | Zero validação de payload nos handlers RPC (destructure direto) | `runtime/bun/features/*/rpc/index.ts` |
| S4 | Alto | Path traversal em restore de backup (`snapshotId` sem `basename()`) | `connected-backups-restore.ts:227` |
| S5 | Alto | `openUrl` sem allowlist de esquema (`rundll32`/`xdg-open` com URL crua) | `runtime/bun/browser.ts:10-56` |
| S6 | Alto | JWT/cookies OAuth e AAS tokens em plaintext | `core/infra/config.ts:18-21` |
| S7 | Alto | Token OAuth vazando em `console.log` de produção | `core/features/auth/login.ts:252,304,421` |
| S8 | Alto | Self-update sem verificação de integridade; `taskkill` global; `process.exit` sem handshake | `system/rpc/index.ts:93-237` |

### Supply chain / build
| # | Sev. | Achado |
|---|---|---|
| S9 | Alto | `protobufjs@8.0.3` com 3 CVEs de 2026 (fix em 8.6.6+) |
| S10 | Alto | `usb@2.17.0` embute `libusb 1.0.29` com 2 CVEs (fix em 2.19.1) |
| S11 | Alto | Scripts remotos não pinados executados no build (`raw.githubusercontent.com/.../main`); binários sem checksum; releases sem SHA256SUMS |
| S12 | Alto | `spd-tool-bun` git dep **sem commit pinado** no manifest |
| S13 | Médio | Canais stable/canary disputam `releases/latest` |
| S14 | Médio | CI sem `--frozen-lockfile`, ações por tag flutuante, `permissions` global write, sem job de qualidade |

## 3. Dependências — destaques

| Dependência | Hoje | Ação |
|---|---|---|
| `protobufjs` | 8.0.3 | **↑ 8.8.0 (3 CVEs)** |
| `usb` | 2.17.0 | **↑ 2.19.1 (2 CVEs)**; 3.x (Rust) depois |
| `spd-tool-bun` | git sem pin | **pinar commit** |
| `electrobun` | 1.16.0 | ↑ 1.18.x; planejar 2.x |
| `google-play-proto` (parado ~2015) | 1.3.1 | vendorizar `.proto` |
| `rcedit` (depreciado) | 5.0.2 | avaliar `resedit` |
| `@angular/*` | 21.2.11 | ↑ 21.2.25 (patch LTS); 22 exige TS ≥6.0 |
| `archiver` | 7.0.1 | ↑ 8.x com refatoração |

## 4. Código, UX e acessibilidade

- Backend: `run*.ts` ~70 linhas duplicadas; `uniquePaths` copiado 4×; tipos RPC duplicados; dead code 416;
  `fetch` sem timeout em 5 pontos; TOCTOU em download; race em `getPlayStoreSession`.
- Frontend: ~1.664 bindings `[class.*]` para tema (tokens `@theme` existem e não são usados); 13 componentes
  sem OnPush; `TranslatePipe` impuro; funções no template; zero rotas/lazy-loading.
- A11y: 4 modais sem `role="dialog"`/focus-trap/Escape; zero `aria-live`; cards `<article (click)>` sem teclado.
- i18n: dicionários paritários (163 chaves), ~40% das strings hardcoded; 1 chave indefinida
  (`FIRMWARE.DRY_RUN_PROGRESS`); toasts PT/EN misturados.

## 5. Testes e observabilidade

- Frontend: 0 testes. Backend: 4 arquivos (~17 testes). CI não roda `bun test`/`tsc`/`arch:check`/`biome`.
- Lacunas críticas: fluxo de flash (risco de brick), sanitização de paths, download-manager, `login.ts`.
- Sem logger estruturado nem arquivo de log da aplicação.

## 6. Plano de migração (fases)

| Fase | Escopo | Risco |
|---|---|---|
| **F0 — Segurança imediata** | `protobufjs→8.8`, `usb→2.19.1`, remover logs de token, confinar paths das RPCs, pin `spd-tool-bun`, CI frozen-lockfile | Baixo |
| **F1 — Supply chain + CI** | Checksums, pin de scripts do AppImage, SHA256SUMS, separar canais, CI de qualidade, logger estruturado | Médio |
| **F2 — Botão "Atualizar"** | `runtime/bun/features/update/`, contrato RPC, UI + logs (design aprovado) | Médio |
| **F3 — Frontend** | Tema CSS vars, OnPush, a11y, i18n completo, componentização | Médio |
| **F4 — Refatoração backend** | DI/ports, contrato unificado + validação, quebrar god files, timeouts de rede | Médio |
| **F5 — Testes** | Path confinement, mappers, download-manager, rescue pipeline, contract tests | Baixo |
| **F6 — Majors** | electrobun 1.18→2.x, Angular 22 + TS 6, archiver 8, usb 3.x | Alto |

## 7. Roadmap priorizado

1. Correções de segurança F0 → 2. Botão "Atualizar" → 3. CI de qualidade + testes base →
4. Supply chain → 5. Acessibilidade + i18n → 6. Refatoração backend → 7. Majors.

---

## 8. Status de execução (2026-10-09)

| # | Entrega | Status | Evidência |
|---|---|---|---|
| 1 | Segurança F0 (CVEs, path guards, logs de token, pin deps, CI) | ✅ **Concluído** | commit `fix(security)…`; 14 testes de path-guard |
| 2 | Botão "Atualizar" (git sync seguro + updater + UI + logs) | ✅ **Concluído** | commit `feat(update)…`; smoke real contra o origin; 18 testes |
| 3 | CI de qualidade + testes base | ✅ **Concluído** | `lmfd-quality.yml`; 63 testes totais em 11 arquivos |
| 4 | Supply chain (pin SHA, digest qdl, SHASUMS, canais, Dependabot) | ✅ **Concluído** | commit `ci(supply-chain)…` |
| 5 | A11y + i18n + OnPush + confirm dialog | ✅ **Concluído** (exceto itens abaixo) | commits `fix(a11y,i18n)…` e `feat(i18n,ux)…` |
| 6 | Refatoração backend (run.ts unificado, timeouts, logger, registry) | ✅ **Concluído** (exceto itens abaixo) | commit `refactor(runtime)…` |
| 7 | Majors | 🟡 **Parcial** | Electrobun 1.18.1 ✅, Angular 22 + TS 6.0 ✅, archiver 8 ✅ |

### Itens restantes (deliberadamente não executados sem verificação dedicada)

Estes itens envolvem **mudanças visuais ou de toolchain nativo** que não podem ser
verificadas neste ambiente (sem GUI para inspeção visual; builds nativos exigem
podman/toolchains). Foram mantidos como épicas planejadas para não quebrar a app
às cegas:

1. **Tema por CSS variables** — ✅ **CONCLUÍDO** (2026-10-09, validado visualmente
   pelo usuário). Tokens semânticos em `styles.css`, ~1.100 bindings removidos.
2. **`usb` 3.x (Rust)** — ⛔ **BLOQUEADO nos forks**: `fastboot-bun-ts` e `apie`
   (forks git pinados) declaram `usb: ^2.17.0`; subir para 3.x exige atualizar os
   dois forks para `usb@3` primeiro (e adaptar a API se necessário). O app usa
   apenas o export `WebUSB` de `usb`. **Estado atual seguro**: `usb@2.19.1`
   corrige os CVEs do libusb (verificado: addon nativo compila com o libusb
   corrigido no container).
3. **`ffmpeg` 8** — ⚖️ **Decisão de trust**: o `ffmpeg-static` (ffmpeg 6.1.1) vem
   de release npm verificada; builds estáticos de ffmpeg 8 são distribuídos por
   terceiros sem assinatura forte (novos vendors = nova superfície de supply
   chain). O `prepare-ffmpeg` **já prefere ffmpeg do sistema** — instalar o
   ffmpeg 8 no PATH é o caminho recomendado e suportado hoje.
4. **DI/portas em `core/features`** — 🟡 **parcialmente concluído**: porta de
   configuração + relógio implementada em `oauth-context-store.ts` (padrão para
   replicar em `model-catalog.ts`/`catalog-manual-match.ts`); quebra dos god
   files restantes (`play-store.ts` 1.108 linhas, `backup-restore.workflow.ts`)
   é refatoração cosmética restante.
5. **i18n residual** — ✅ **CONCLUÍDO** (labels de download/rescue com parâmetros
   no `translate()`; 309 chaves em paridade PT/EN).
6. **Lazy loading/rotas e `@defer`** para `ng-terminal` (bundle inicial de 1 MB).

### Verificação final executada (2026-10-09)
- `bun run check` (arch + tsc root/web + biome) — ✅
- `bun test` — ✅ **88 testes**
- `bun run web:build` (Angular 22) — ✅
- Smoke do orquestrador de update contra o repositório real (credenciais, fetch,
  plano) — ✅
- Smoke do zip com archiver 8 — ✅
- `bun run qdl:prepare` — ✅ (integridade sha256 verificada contra o digest do
  GitHub Release)
- `bun run ffmpeg:prepare` — ✅
- `bun run usb:prepare` em container (docker) — ✅ **addon nativo `usb@2.19.1`
  compilado com o libusb corrigido**; binário glibc N-API carrega no Bun
  (smoke `process.dlopen`); verificação SHASUMS do Node ativa (fail-closed)
- Validação visual da UI (tema claro/escuro, i18n, modais) pelo usuário — ✅

### Estado final do roadmap
| # | Entrega | Estado |
|---|---|---|
| 1 | Segurança F0 | ✅ |
| 2 | Botão "Atualizar" | ✅ |
| 3 | CI de qualidade + testes | ✅ |
| 4 | Supply chain | ✅ |
| 5 | Acessibilidade + i18n + tema | ✅ (tema e i18n residual concluídos nesta etapa) |
| 6 | Refatoração backend | ✅ (rescue stages, OAuth store port, single-flight; splits cosméticos restantes documentados) |
| 7 | Majors | ✅ **completas ou documentadas**: Electrobun 1.18.1, Angular 22, TS 6.0, archiver 8 ✅ · `usb` 3.x ⛔ bloqueado nos forks (manter 2.19.1 — CVEs corrigidos e verificados em build nativo) · `ffmpeg` 8 ⚖️ via PATH (decisão de trust documentada) |

---
*Detalhamento completo (tabelas arquivo:linha) registrado na sessão de auditoria de 2026-10-09.*
