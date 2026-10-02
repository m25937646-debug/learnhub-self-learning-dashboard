import { ENV } from "./env";

type GeminiMessage = {
  role: "user" | "assistant";
  content: string;
};

type GeminiReplyOptions = {
  systemPrompt: string;
  messages: GeminiMessage[];
};

const replySchema = {
  type: "OBJECT",
  properties: {
    answer: { type: "STRING" },
    nextStep: { type: "STRING" },
    why: { type: "STRING" },
    question: { type: "STRING" },
    memoryUpdate: { type: "STRING" },
  },
  required: ["answer", "nextStep", "why", "question", "memoryUpdate"],
};

/**
 * Uses Gemini only when the server-side key is configured. The key never
 * reaches the browser; a failed or unconfigured Gemini request returns null
 * so the caller can use the built-in LLM fallback.
 */
export async function generateGeminiReply({ systemPrompt, messages }: GeminiReplyOptions): Promise<string | null> {
  if (!ENV.geminiApiKey) return null;

  const contents = messages
    .filter(message => message.content.trim())
    .map(message => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content }],
    }));

  if (contents.length === 0) return null;

  const model = encodeURIComponent(ENV.geminiModel || "gemini-flash-latest");
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(ENV.geminiApiKey)}`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.65,
          maxOutputTokens: 900,
          responseMimeType: "application/json",
          responseSchema: replySchema,
        },
      }),
    });

    if (!response.ok) {
      console.warn(`[Gemini] Request failed with status ${response.status}`);
      return null;
    }

    const payload = await response.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map(part => part.text || "").join("").trim();
    return text || null;
  } catch (error) {
    console.warn("[Gemini] Request failed; using built-in LLM fallback", error);
    return null;
  }
}
