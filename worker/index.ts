import {
  MACHINE_LANGS,
  MACHINE_UI_KEYS,
  TRANSLATION_SOURCE_PATH,
  isMachineLang,
  type MachineLang,
  type MachineUiKey,
  type TranslationPayload,
  type TranslationSource,
} from "../src/i18n/machine";

interface Env {
  ASSETS: Fetcher;
  TRANSLATIONS: KVNamespace;
  DEEPL_API_KEY?: string;
  TRANSLATE_LIMITER?: RateLimit;
}

const KV_TTL_SECONDS = 60 * 60 * 24 * 90;
const EDGE_TTL_SECONDS = 60 * 60 * 24;
const QUOTA_SAFETY_RATIO = 0.9;
const DEEPL_CONTEXT =
  "Personal portfolio and résumé (CV) website of a Brazilian software engineer. " +
  "'Curriculum' means curriculum vitae.";

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly headers: HeadersInit = {},
  ) {
    super(code);
  }
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/translate") {
      try {
        return await handleTranslate(request, url, env, ctx);
      } catch (error) {
        if (error instanceof HttpError) {
          return json({ error: error.code }, error.status, {
            "Cache-Control": "no-store",
            ...error.headers,
          });
        }
        console.error("translate: unexpected error", error);
        return json({ error: "internal_error" }, 500, {
          "Cache-Control": "no-store",
        });
      }
    }

    if (url.pathname.startsWith("/api/")) {
      return json({ error: "not_found" }, 404, { "Cache-Control": "no-store" });
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleTranslate(
  request: Request,
  url: URL,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new HttpError(405, "method_not_allowed", { Allow: "GET, HEAD" });
  }

  const lang = url.searchParams.get("lang")?.toLowerCase();
  if (!isMachineLang(lang)) {
    throw new HttpError(400, "unsupported_language");
  }

  const source = await loadSource(env, url);
  // Same hash as the page was built with.
  const browserCache =
    url.searchParams.get("v") === source.hash
      ? "public, max-age=31536000, immutable"
      : "public, max-age=300";

  const kvKey = `tr:${source.hash}:${lang}`;
  const edgeKey = new Request(`${url.origin}/__translate-cache/${kvKey}`);
  const edgeCache = caches.default;

  const edgeHit = await edgeCache.match(edgeKey);
  if (edgeHit) {
    return respond(await edgeHit.text(), browserCache, "edge");
  }

  let body = await env.TRANSLATIONS.get(kvKey);
  let tier = "kv";

  if (body === null) {
    await enforceRateLimit(request, env);
    const payload = await translateWithDeepL(source, lang, env);
    body = JSON.stringify(payload);
    tier = "deepl";
    ctx.waitUntil(
      env.TRANSLATIONS.put(kvKey, body, { expirationTtl: KV_TTL_SECONDS }),
    );
  }

  ctx.waitUntil(
    edgeCache.put(
      edgeKey,
      new Response(body, {
        headers: { "Cache-Control": `public, max-age=${EDGE_TTL_SECONDS}` },
      }),
    ),
  );

  return respond(body, browserCache, tier);
}

async function loadSource(env: Env, url: URL): Promise<TranslationSource> {
  const response = await env.ASSETS.fetch(
    new Request(new URL(TRANSLATION_SOURCE_PATH, url.origin)),
  );
  if (!response.ok) {
    console.error("translate: source asset missing", response.status);
    throw new HttpError(500, "source_unavailable");
  }
  return response.json<TranslationSource>();
}

async function enforceRateLimit(request: Request, env: Env): Promise<void> {
  if (!env.TRANSLATE_LIMITER) return;
  const key = request.headers.get("CF-Connecting-IP") ?? "unknown";
  const { success } = await env.TRANSLATE_LIMITER.limit({ key });
  if (!success) {
    throw new HttpError(429, "rate_limited", { "Retry-After": "60" });
  }
}

function deeplBaseUrl(apiKey: string): string {
  return apiKey.endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

async function deeplFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const response = await fetch(`${deeplBaseUrl(apiKey)}${path}`, {
    ...init,
    headers: {
      Authorization: `DeepL-Auth-Key ${apiKey}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });

  if (response.ok) return response;

  console.error(`translate: DeepL ${path} responded ${response.status}`);
  if (response.status === 456) throw new HttpError(503, "quota_exceeded");
  if (response.status === 429) {
    throw new HttpError(503, "upstream_busy", { "Retry-After": "30" });
  }
  throw new HttpError(502, "upstream_error");
}

// DeepL doesn't bill markup when tag_handling=html, so only text counts.
function estimateCharacters(source: TranslationSource): number {
  const text = source.html.replace(/<[^>]*>/g, "");
  return [text, ...Object.values(source.ui)].reduce(
    (total, value) => total + value.length,
    0,
  );
}

async function assertQuota(apiKey: string, needed: number): Promise<void> {
  const response = await deeplFetch(apiKey, "/v2/usage");
  const usage = await response.json<{
    character_count?: number;
    character_limit?: number;
  }>();
  const { character_count: used, character_limit: limit } = usage;
  if (typeof used !== "number" || typeof limit !== "number") return;
  if (used + needed > limit * QUOTA_SAFETY_RATIO) {
    console.warn(`translate: quota guard tripped (${used}/${limit})`);
    throw new HttpError(503, "quota_exceeded");
  }
}

// DeepL merges <br>-separated lines into one sentence (moving bold text across
// them) and ignores splitting_tags for <br>. Block elements always split, so
// each line travels as a <div> and is turned back into <br> afterwards.
function brToBlocks(html: string): string {
  return html.replace(/<p>([\s\S]*?)<\/p>/g, (paragraph, inner: string) =>
    inner.includes("<br>")
      ? `<p><div>${inner.split(/<br>\s*/).join("</div><div>")}</div></p>`
      : paragraph,
  );
}

function blocksToBr(html: string): string {
  return html.replace(/<\/div>\s*<div>/g, "<br>\n").replace(/<\/?div>/g, "");
}

async function translateTexts(
  apiKey: string,
  texts: string[],
  lang: MachineLang,
  html: boolean,
): Promise<string[]> {
  const response = await deeplFetch(apiKey, "/v2/translate", {
    method: "POST",
    body: JSON.stringify({
      text: texts,
      source_lang: "EN",
      target_lang: MACHINE_LANGS[lang],
      context: DEEPL_CONTEXT,
      ...(html ? { tag_handling: "html" } : {}),
    }),
  });
  const data = await response.json<{ translations?: { text?: unknown }[] }>();
  const translated = data.translations?.map((entry) => entry.text);
  if (
    !translated ||
    translated.length !== texts.length ||
    !translated.every((text): text is string => typeof text === "string")
  ) {
    throw new HttpError(502, "upstream_invalid_response");
  }
  return translated;
}

async function translateWithDeepL(
  source: TranslationSource,
  lang: MachineLang,
  env: Env,
): Promise<TranslationPayload> {
  const apiKey = env.DEEPL_API_KEY;
  if (!apiKey) {
    console.error("translate: DEEPL_API_KEY secret is not set");
    throw new HttpError(503, "not_configured");
  }
  await assertQuota(apiKey, estimateCharacters(source));

  const uiKeys = MACHINE_UI_KEYS.filter((key) => source.ui[key]);
  const [[html], uiTexts] = await Promise.all([
    translateTexts(apiKey, [brToBlocks(source.html)], lang, true),
    translateTexts(
      apiKey,
      uiKeys.map((key) => source.ui[key]),
      lang,
      false,
    ),
  ]);

  const ui = Object.fromEntries(
    uiKeys.map((key, index) => [key, uiTexts[index]]),
  ) as Partial<Record<MachineUiKey, string>>;

  return { lang, hash: source.hash, html: blocksToBr(html ?? ""), ui };
}

function respond(body: string, cacheControl: string, tier: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": cacheControl,
      "X-Content-Type-Options": "nosniff",
      "X-Translation-Cache": tier,
    },
  });
}

function json(
  data: unknown,
  status: number,
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}
