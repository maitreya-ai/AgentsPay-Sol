import type { GatewayConfig } from "./config.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ChatRequest {
  model?: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
}

export interface ChatResult {
  content: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
}

const approxTokens = (s: string) => Math.max(1, Math.ceil(s.length / 4));

/** Runs inference inside the trusted boundary. */
export async function runInference(cfg: GatewayConfig, req: ChatRequest, maxTokens: number): Promise<ChatResult> {
  if (cfg.backend === "echo") {
    const last = [...req.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const content = `[attested echo] ${last}`.slice(0, maxTokens * 4);
    const prompt = req.messages.map((m) => m.content).join("\n");
    return {
      content,
      promptTokens: approxTokens(prompt),
      completionTokens: approxTokens(content),
      model: cfg.upstreamModel,
    };
  }

  // Any OpenAI-compatible server reachable only from inside the CVM
  // (vLLM, SGLang, llama.cpp, Ollama ...).
  const res = await fetch(`${cfg.upstreamUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(cfg.upstreamApiKey ? { authorization: `Bearer ${cfg.upstreamApiKey}` } : {}),
    },
    body: JSON.stringify({ ...req, model: cfg.upstreamModel, max_tokens: maxTokens, stream: false }),
  });
  if (!res.ok) throw new Error(`upstream ${res.status}: ${await res.text()}`);
  const body = (await res.json()) as {
    choices: { message: { content: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number };
  };
  const content = body.choices[0]?.message?.content ?? "";
  return {
    content,
    promptTokens: body.usage?.prompt_tokens ?? approxTokens(req.messages.map((m) => m.content).join("\n")),
    completionTokens: body.usage?.completion_tokens ?? approxTokens(content),
    model: cfg.upstreamModel,
  };
}
