const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = __dirname;

const sources = new Map();

const filterProfiles = {
  couriers: {
    label: "Курьеры",
    keywords: ["курьер", "доставка", "доставк", "самокат", "яндекс еда", "delivery", "пеший", "велокурьер"],
  },
  side_jobs: {
    label: "Подработка",
    keywords: ["подработка", "подработк", "ищу работу", "ищу подработку", "смены", "вечер", "выходные", "ежедневная оплата"],
  },
  drivers: {
    label: "Водители",
    keywords: ["водитель", "водител", "такси", "авто", "категория b", "категория c"],
  },
  warehouse: {
    label: "Склад",
    keywords: ["склад", "комплектовщик", "сборщик", "упаковщик", "кладовщик"],
  },
};

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(payload, null, 2));
}

function sendOptions(res) {
  res.writeHead(204, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Accept",
    "Access-Control-Max-Age": "86400",
  });
  res.end();
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error("Слишком большой запрос. Лимит: 2 МБ."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error("Ожидался JSON-запрос."));
      }
    });

    req.on("error", reject);
  });
}

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeUrl(value) {
  const url = normalizeText(value);
  if (!url) return "";

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.toString();
  } catch (error) {
    return "";
  }
}

function detectCity(text, explicitCity) {
  const normalizedCity = normalizeText(explicitCity);
  if (normalizedCity) return normalizedCity;

  const cityMatch = text.match(/\b(?:город|г\.|из|в)\s+([А-ЯЁA-Z][а-яёa-z-]{2,}(?:\s+[А-ЯЁA-Z][а-яёa-z-]{2,})?)/u);
  return cityMatch ? cityMatch[1] : "Не указан";
}

function detectTags(text) {
  const lower = text.toLowerCase();
  const tags = [];

  for (const [key, profile] of Object.entries(filterProfiles)) {
    if (profile.keywords.some((keyword) => lower.includes(keyword))) {
      tags.push(key);
    }
  }

  return tags;
}

function maskPhone(raw) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7) return "[телефон скрыт]";
  return `+${digits.slice(0, 1)} *** *** ${digits.slice(-2)}`;
}

function redactPersonalData(text) {
  const phonePattern = /(?:\+?\d[\s().-]*){7,18}/g;
  const phones = [];
  const redactedText = text.replace(phonePattern, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length < 7 || digits.length > 16) return match;
    const masked = maskPhone(match);
    phones.push(masked);
    return masked;
  });

  return {
    redactedText,
    maskedPhones: [...new Set(phones)],
  };
}

function estimatePersonName(text) {
  const match = text.match(/\b[А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ][а-яё]{2,}(?:\s+[А-ЯЁ][а-яё]{2,})?\b/u);
  return match ? "Обнаружено в тексте, не сохраняется" : "Не обнаружено";
}

function createSource(input) {
  const rawText = normalizeText(input.text);
  if (rawText.length < 12) {
    throw new Error("Добавьте текст объявления или заметки длиной хотя бы 12 символов.");
  }

  const sourceUrl = normalizeUrl(input.sourceUrl);
  const createdAt = new Date().toISOString();
  const id = crypto.randomUUID();
  const redaction = redactPersonalData(rawText);
  const city = detectCity(rawText, input.city);
  const tags = detectTags(rawText);

  return {
    id,
    createdAt,
    updatedAt: createdAt,
    sourceUrl,
    sourceName: normalizeText(input.sourceName) || "Открытый источник",
    city,
    tags,
    redactedText: redaction.redactedText,
    maskedPhones: redaction.maskedPhones,
    personNameStatus: estimatePersonName(rawText),
    note: normalizeText(input.note),
  };
}

function applyFilters(items, query) {
  const tag = query.get("tag") || "all";
  const city = (query.get("city") || "").toLowerCase();
  const search = (query.get("q") || "").toLowerCase();
  const days = Number(query.get("days") || 0);
  const since = days > 0 ? Date.now() - days * 24 * 60 * 60 * 1000 : 0;

  return items.filter((item) => {
    if (tag !== "all" && !item.tags.includes(tag)) return false;
    if (city && !item.city.toLowerCase().includes(city)) return false;
    if (search) {
      const haystack = `${item.redactedText} ${item.sourceName} ${item.city}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    if (since && new Date(item.createdAt).getTime() < since) return false;
    return true;
  });
}

function stats(items) {
  return {
    total: items.length,
    withMaskedPhones: items.filter((item) => item.maskedPhones.length > 0).length,
    byTag: Object.fromEntries(
      Object.keys(filterProfiles).map((tag) => [tag, items.filter((item) => item.tags.includes(tag)).length]),
    ),
    byCity: items.reduce((acc, item) => {
      acc[item.city] = (acc[item.city] || 0) + 1;
      return acc;
    }, {}),
  };
}

function csvEscape(value) {
  return `"${String(value || "").replace(/"/g, '""')}"`;
}

function toCsv(items) {
  const headers = ["date", "city", "tags", "source_name", "source_url", "text_redacted", "masked_phone_count"];
  const rows = items.map((item) =>
    [
      item.createdAt,
      item.city,
      item.tags.map((tag) => filterProfiles[tag]?.label || tag).join("; "),
      item.sourceName,
      item.sourceUrl,
      item.redactedText,
      item.maskedPhones.length,
    ]
      .map(csvEscape)
      .join(","),
  );

  return [headers.join(","), ...rows].join("\n");
}

function publicSource(item) {
  return {
    ...item,
    tagLabels: item.tags.map((tag) => filterProfiles[tag]?.label || tag),
  };
}

async function route(req, res) {
  if (req.method === "OPTIONS") {
    sendOptions(res);
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);

  try {
    if (url.pathname === "/api/health") {
      json(res, 200, { ok: true, profiles: filterProfiles });
      return;
    }

    if (url.pathname === "/api/sources" && req.method === "GET") {
      const items = applyFilters([...sources.values()], url.searchParams).sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      json(res, 200, { items: items.map(publicSource), stats: stats(items), profiles: filterProfiles });
      return;
    }

    if (url.pathname === "/api/sources" && req.method === "POST") {
      const body = await parseBody(req);
      const item = createSource(body);
      sources.set(item.id, item);
      json(res, 201, publicSource(item));
      return;
    }

    if (url.pathname === "/api/sources/import" && req.method === "POST") {
      const body = await parseBody(req);
      const rows = Array.isArray(body.items) ? body.items : [];
      const created = rows.map(createSource);
      for (const item of created) sources.set(item.id, item);
      json(res, 201, { created: created.map(publicSource), count: created.length });
      return;
    }

    if (url.pathname === "/api/sources/export.csv" && req.method === "GET") {
      const items = applyFilters([...sources.values()], url.searchParams);
      res.writeHead(200, {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=osint-redacted-sources.csv",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(`\ufeff${toCsv(items)}`);
      return;
    }

    if (url.pathname.startsWith("/api/sources/") && req.method === "DELETE") {
      const id = decodeURIComponent(url.pathname.replace("/api/sources/", ""));
      sources.delete(id);
      json(res, 200, { ok: true });
      return;
    }

    const filePath = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const safePath = path.normalize(filePath).replace(/^(\.\.[/\\])+/, "");
    const absolutePath = path.join(PUBLIC_DIR, safePath);
    const content = await fs.readFile(absolutePath);
    const ext = path.extname(absolutePath).toLowerCase();
    const contentTypes = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    };
    res.writeHead(200, { "Content-Type": contentTypes[ext] || "application/octet-stream" });
    res.end(content);
  } catch (error) {
    if (error.code === "ENOENT") {
      json(res, 404, { error: "Не найдено." });
      return;
    }
    json(res, 400, { error: error.message });
  }
}

http.createServer(route).listen(PORT, "127.0.0.1", () => {
  console.log(`Courier landing: http://localhost:${PORT}`);
});
