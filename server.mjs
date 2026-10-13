import http from "node:http";
import { readFile } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(ROOT, "public");
const SHEET_RANGE = "'Base financeira'!A4:K504";
const CACHE_MS = 60_000;
let tokenCache = { value: "", expiry: 0 };
let dataCache = { rows: null, expiry: 0, updatedAt: "" };
await loadEnv();

async function loadEnv() {
  try {
    const text = await readFile(resolve(ROOT, ".env"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || match[1] in process.env) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function missingConfig() {
  return ["DASHBOARD_USER", "DASHBOARD_PASSWORD", "SPREADSHEET_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    .filter((name) => !process.env[name] || !process.env[name].trim());
}

function safeEqual(actual, expected) {
  const a = createHash("sha256").update(actual).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorized(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  if (colon < 0) return false;
  return safeEqual(decoded.slice(0, colon), process.env.DASHBOARD_USER || "") &&
    safeEqual(decoded.slice(colon + 1), process.env.DASHBOARD_PASSWORD || "");
}

function headers(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  response.setHeader("Cache-Control", "no-store");
}

function reply(response, status, body, type) {
  headers(response);
  response.writeHead(status, { "Content-Type": type || "text/plain; charset=utf-8" });
  response.end(body);
}

async function accessToken() {
  if (tokenCache.value && tokenCache.expiry > Date.now() + 60_000) return tokenCache.value;
  const body = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error("OAuth token refresh failed");
  const result = await response.json();
  if (!result.access_token) throw new Error("OAuth response did not contain an access token");
  tokenCache = { value: result.access_token, expiry: Date.now() + Number(result.expires_in || 3600) * 1000 };
  return tokenCache.value;
}

function dateValue(value) {
  if (value === "" || value == null) return "";
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const match = String(value).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? match[3] + "-" + match[2].padStart(2, "0") + "-" + match[1].padStart(2, "0") : String(value);
}

function parseRows(values) {
  const header = (values[0] || []).map((value) => String(value || "").trim().toLocaleLowerCase("pt-BR"));
  const fallback = ["ano", "mês", "natureza", "descrição", "categoria", "valor planejado", "vencimento", "pagar com salário", "pago/recebido em", "fonte de renda", "situação"];
  const columns = header.length >= 11 ? header : fallback;
  const at = (name) => columns.indexOf(name);
  return values.slice(1).filter((row) => row && row.some((value) => value !== "" && value != null)).map((row) => ({
    year: Number(row[at("ano")] || 0),
    month: String(row[at("mês")] || ""),
    nature: String(row[at("natureza")] || ""),
    description: String(row[at("descrição")] || ""),
    category: String(row[at("categoria")] || ""),
    plannedValue: Number(row[at("valor planejado")] || 0),
    dueDate: dateValue(row[at("vencimento")]),
    paycheckDay: String(row[at("pagar com salário")] || ""),
    paidDate: dateValue(row[at("pago/recebido em")]),
    incomeSource: String(row[at("fonte de renda")] || ""),
    status: String(row[at("situação")] || ""),
  })).filter((row) => row.description && row.year);
}

async function financeRows(forceRefresh = false) {
  if (!forceRefresh && dataCache.rows && dataCache.expiry > Date.now()) return dataCache.rows;
  const token = await accessToken();
  const sheetId = encodeURIComponent(process.env.SPREADSHEET_ID);
  const range = encodeURIComponent(SHEET_RANGE);
  const endpoint = "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/" + range + "?valueRenderOption=UNFORMATTED_VALUE";
  const response = await fetch(endpoint, { headers: { Authorization: "Bearer " + token }, signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error("Google Sheets read failed");
  const result = await response.json();
  const rows = parseRows(result.values || []);
  dataCache = { rows, expiry: Date.now() + CACHE_MS, updatedAt: new Date().toISOString() };
  return rows;
}

const files = new Map([["/", "index.html"], ["/app.js", "app.js"], ["/styles.css", "styles.css"]]);
const contentTypes = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const server = http.createServer(async (request, response) => {
  headers(response);
  if (missingConfig().length) {
    reply(response, 503, "Configure as variáveis no .env local ou nos secrets do provedor antes de iniciar o dashboard.");
    return;
  }
  if (!isAuthorized(request)) {
    response.setHeader("WWW-Authenticate", 'Basic realm="Dashboard financeiro", charset="UTF-8"');
    reply(response, 401, "Autenticação necessária.");
    return;
  }
  const requestUrl = new URL(request.url, "http://localhost");
  const pathname = requestUrl.pathname;
  if (request.method === "GET" && pathname === "/api/finance") {
    try {
      const rows = await financeRows(requestUrl.searchParams.get("refresh") === "1");
      reply(response, 200, JSON.stringify({ rows, updatedAt: dataCache.updatedAt, source: "google-sheets" }), "application/json; charset=utf-8");
    } catch {
      reply(response, 502, JSON.stringify({ error: "Não foi possível ler a planilha. Confira OAuth e a permissão de leitura da conta configurada." }), "application/json; charset=utf-8");
    }
    return;
  }
  const fileName = files.get(pathname);
  if (request.method !== "GET" || !fileName) {
    reply(response, 404, "Não encontrado.");
    return;
  }
  try {
    const body = await readFile(resolve(PUBLIC, fileName));
    reply(response, 200, body, contentTypes[extname(fileName)] || "application/octet-stream");
  } catch {
    reply(response, 500, "Não foi possível carregar o dashboard.");
  }
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => console.log("Dashboard disponível na porta " + port + "."));
