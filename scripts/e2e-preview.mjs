#!/usr/bin/env node
/**
 * Roda o suíte e2e contra o Preview Deployment da branch atual.
 *
 *   npm run test:e2e:preview            # branch atual
 *   npm run test:e2e:preview -- --project=desktop
 *   BASE_URL=https://... npm run test:e2e:preview   # alvo explícito
 *
 * Como acha a URL, nesta ordem:
 *   1. BASE_URL, se informada;
 *   2. Vercel CLI (`vercel ls --format json -m githubCommitRef=<branch>`),
 *      que devolve o deployment mais recente da branch;
 *   3. o alias determinístico da branch
 *      (`<projeto>-git-<branch>-<escopo>.vercel.app`).
 *
 * Proteção: se o projeto estiver com "Vercel Authentication" ligada, o
 * Preview responde com redirecionamento para o SSO da Vercel e nenhum teste
 * roda. Para automatizar sem abrir o Preview ao público, gere o segredo em
 * Vercel → Project → Settings → Deployment Protection → "Protection Bypass
 * for Automation" e exporte em VERCEL_AUTOMATION_BYPASS_SECRET (o
 * playwright.config.ts já manda o cabeçalho quando a variável existe).
 */

import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// O segredo de bypass e o token da Vercel moram no .env.local (nunca no git).
createRequire(import.meta.url)("dotenv").config({ path: ".env.local" });

/** No Windows os executáveis do npm são .cmd; evita depender de shell. */
const bin = (nome) => (process.platform === "win32" ? `${nome}.cmd` : nome);

const PROJETO = "gaveta-erp";
const ESCOPO = "adriano-cardoso-org";

function branchAtual() {
  return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

/** Mesma normalização que a Vercel usa no alias de branch. */
function aliasDaBranch(branch) {
  const slug = branch
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://${PROJETO}-git-${slug}-${ESCOPO}.vercel.app`;
}

function urlPelaCLI(branch) {
  const args = [
    "ls",
    PROJETO,
    "--scope",
    ESCOPO,
    "--meta",
    `githubCommitRef=${branch}`,
    "--status",
    "READY",
    "--format",
    "json",
    "--yes",
    ...(process.env.VERCEL_TOKEN ? ["--token", process.env.VERCEL_TOKEN] : []),
  ];
  // No Windows a CLI é um .cmd: precisa de shell, e com shell os argumentos
  // vão numa string só (passar array com shell gera aviso de depreciação).
  const usaShell = process.platform === "win32";
  const r = usaShell
    ? spawnSync(`${bin("vercel")} ${args.join(" ")}`, {
        encoding: "utf8",
        shell: true,
      })
    : spawnSync("vercel", args, { encoding: "utf8" });
  if (r.status !== 0 || !r.stdout.trim()) {
    const motivo = (r.stderr || "").trim().split("\n").pop();
    console.warn(`· Vercel CLI indisponível (${motivo ?? "erro"}).`);
    return null;
  }
  try {
    const linhas = r.stdout.split("\n").filter((l) => l.trim().startsWith("{") || l.trim().startsWith("["));
    const dados = JSON.parse(linhas.join("\n"));
    const lista = Array.isArray(dados) ? dados : (dados.deployments ?? []);
    const url = lista[0]?.url;
    return url ? (url.startsWith("http") ? url : `https://${url}`) : null;
  } catch {
    const achado = r.stdout.match(/https?:\/\/[a-z0-9.-]+\.vercel\.app/i);
    return achado ? achado[0] : null;
  }
}

async function alvoResponde(url, bypass) {
  const headers = bypass
    ? {
        "x-vercel-protection-bypass": bypass,
        "x-vercel-set-bypass-cookie": "true",
      }
    : {};
  const resposta = await fetch(`${url}/login`, {
    headers,
    redirect: "manual",
  });
  const destino = resposta.headers.get("location") ?? "";
  if (destino.includes("vercel.com/sso-api")) {
    return { ok: false, motivo: "sso" };
  }
  if (resposta.status >= 400) {
    return { ok: false, motivo: `HTTP ${resposta.status}` };
  }
  return { ok: true };
}

const branch = branchAtual();
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim();
const url =
  process.env.BASE_URL?.trim() || urlPelaCLI(branch) || aliasDaBranch(branch);

console.log(`· Branch:  ${branch}`);
console.log(`· Preview: ${url}`);

const teste = await alvoResponde(url, bypass);
if (!teste.ok) {
  if (teste.motivo === "sso") {
    console.error(
      [
        "",
        "✗ O Preview está protegido por Vercel Authentication (SSO) — o navegador",
        "  do teste não passa. Escolha um caminho:",
        "",
        "  a) Vercel → Project → Settings → Deployment Protection →",
        "     'Protection Bypass for Automation' → gerar o segredo e exportar:",
        "       VERCEL_AUTOMATION_BYPASS_SECRET=<segredo> npm run test:e2e:preview",
        "     (mantém o Preview privado — recomendado)",
        "",
        "  b) desligar a proteção dos Previews nas mesmas configurações",
        "     (deixa a URL do Preview acessível a quem tiver o link).",
        "",
      ].join("\n"),
    );
  } else {
    console.error(`\n✗ O Preview não respondeu (${teste.motivo}).\n`);
  }
  process.exit(1);
}

const extras = process.argv.slice(2);
// Chama o CLI do Playwright pelo próprio node: no Windows, spawnar um .cmd
// sem shell falha silenciosamente (Node bloqueia por segurança).
const playwrightCli = createRequire(import.meta.url).resolve(
  "@playwright/test/cli",
);
const execucao = spawnSync(
  process.execPath,
  [playwrightCli, "test", ...extras],
  { stdio: "inherit", env: { ...process.env, BASE_URL: url } },
);
process.exit(execucao.status ?? 1);
