import { corsHeaders, isAllowedOrigin } from "../_shared/cors.ts";
import { getAuthenticatedUser } from "../_shared/auth.ts";

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  cors: Headers,
): Response {
  const headers = new Headers(cors);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get("Origin");
  const cors = corsHeaders(origin);

  if (origin && !isAllowedOrigin(origin)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, cors);
  }

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  let user: Awaited<ReturnType<typeof getAuthenticatedUser>>;
  try {
    user = await getAuthenticatedUser(req);
  } catch (error) {
    console.error("Authentication configuration error", error);
    return jsonResponse({ error: "Authentication is unavailable" }, 500, cors);
  }

  if (!user) {
    return jsonResponse({ error: "Authentication required" }, 401, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON" }, 400, cors);
  }

  const question = (body as { question?: unknown } | null)?.question;
  if (typeof question !== "string" || !question.trim()) {
    return jsonResponse({ error: "A non-empty question is required" }, 400, cors);
  }
  if (question.length > 8000) {
    return jsonResponse({ error: "Question is too long" }, 413, cors);
  }

  const openAiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiKey) {
    return jsonResponse({ error: "Embedding service is not configured" }, 500, cors);
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: question.trim(),
      }),
    });

    if (!response.ok) {
      console.error("OpenAI embedding request failed", response.status);
      return jsonResponse({ error: "Could not generate embedding" }, 502, cors);
    }

    const result = await response.json();
    const embedding = result?.data?.[0]?.embedding;
    if (!Array.isArray(embedding)) {
      return jsonResponse({ error: "OpenAI returned an invalid embedding" }, 502, cors);
    }

    return jsonResponse({ embedding }, 200, cors);
  } catch (error) {
    console.error("Embedding request failed", error);
    return jsonResponse({ error: "Could not generate embedding" }, 502, cors);
  }
});
