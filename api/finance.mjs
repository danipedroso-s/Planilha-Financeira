const SHEET_RANGE = "'Base financeira'!A4:K504";
const CACHE_MS = 60_000;
let tokenCache = { value: "", expiry: 0 };
let dataCache = { rows: null, expiry: 0, updatedAt: "" };

function json(body, status = 200) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function missingConfig() {
  return ["SPREADSHEET_ID", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]
    .filter((name) => !process.env[name] || !process.env[name].trim());
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
  if (!response.ok) {
    let oauthError = "unknown";
    try {
      const errorBody = await response.json();
      oauthError = String(errorBody.error || oauthError).replace(/[^a-z0-9_ -]/gi, "").slice(0, 80);
    } catch {}
    console.error(`[finance-api] OAuth refresh failed (${response.status}): ${oauthError}`);
    throw new Error("OAuth token refresh failed");
  }
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

async function financeRows(forceRefresh) {
  if (!forceRefresh && dataCache.rows && dataCache.expiry > Date.now()) return dataCache.rows;
  const token = await accessToken();
  const sheetId = encodeURIComponent(process.env.SPREADSHEET_ID);
  const range = encodeURIComponent(SHEET_RANGE);
  const endpoint = "https://sheets.googleapis.com/v4/spreadsheets/" + sheetId + "/values/" + range + "?valueRenderOption=UNFORMATTED_VALUE";
  const response = await fetch(endpoint, {
    headers: { Authorization: "Bearer " + token },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) {
        let reason = "unknown";
    try {
      const errorBody = await response.json();
      const candidate = errorBody.error?.errors?.[0]?.reason || errorBody.error?.status || "unknown";
      reason = String(candidate).replace(/[^a-z0-9_ -]/gi, "").slice(0, 80);
    } catch {}
    console.error(`[finance-api] Google Sheets read failed (${response.status}): ${reason}`);
    throw new Error("Google Sheets read failed");
  }
  const result = await response.json();
  const rows = parseRows(result.values || []);
  dataCache = { rows, expiry: Date.now() + CACHE_MS, updatedAt: new Date().toISOString() };
  return rows;
}

export default {
  async fetch(request) {
    if (request.method !== "GET") return json({ error: "Método não permitido." }, 405);
    if (missingConfig().length) return json({ error: "A integração com a planilha ainda não foi configurada." }, 503);
    try {
      const url = new URL(request.url);
      const rows = await financeRows(url.searchParams.get("refresh") === "1");
      return json({ rows, updatedAt: dataCache.updatedAt, source: "google-sheets" });
    } catch {
      return json({ error: "Não foi possível ler a planilha. Confira as variáveis OAuth e o acesso da conta à planilha." }, 502);
    }
  },
};
