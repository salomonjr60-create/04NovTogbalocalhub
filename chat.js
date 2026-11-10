const SYSTEM = `You are an expert digital marketing assistant. You help with SEO, social media content, ad copy (Google/Meta/TikTok/LinkedIn), email campaigns, content calendars, brand voice, audience personas, funnels, and analytics. Give practical, ready-to-use output, well structured with headings and bullet points. Ask a brief clarifying question only if essential.`;

class ChatError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
  }
}

function normalizeMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ChatError("messages must be a non-empty array", 400);
  }

  return messages.slice(-20).map((message) => {
    if (
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim()
    ) {
      throw new ChatError("Each message needs a valid role and non-empty content", 400);
    }

    return { role: message.role, content: message.content.slice(0, 8000) };
  });
}

async function generateReply(messages) {
  const cleanMessages = normalizeMessages(messages);
  const configuredEndpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim() || "";
  const endpointUrl = configuredEndpoint.match(/https?:\/\/[^\s"'`]+/i)?.[0];
  const endpoint = (endpointUrl || configuredEndpoint)
    .replace(/["'`]+$/, "")
    .replace(/\/+$/, "");
  const model =
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_MODEL?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();

  let endpointProtocol;
  try {
    endpointProtocol = new URL(endpoint).protocol;
  } catch {
    endpointProtocol = "";
  }

  if (!endpoint || !["http:", "https:"].includes(endpointProtocol) || !model || !apiKey) {
    throw new ChatError(
      "The chat service is not configured. Set AZURE_OPENAI_ENDPOINT to a valid URL, AZURE_OPENAI_MODEL (or AZURE_OPENAI_DEPLOYMENT), and AZURE_OPENAI_API_KEY.",
      503
    );
  }

  const url = endpoint.endsWith("/chat/completions")
    ? endpoint
    : `${endpoint}/chat/completions`;

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": apiKey },
      body: JSON.stringify({
        model,
        messages: [{ role: "system", content: SYSTEM }, ...cleanMessages],
      }),
    });
  } catch {
    throw new ChatError("Could not connect to the chat service. Check its endpoint and network access.", 502);
  }

  let data;
  try {
    data = await response.json();
  } catch {
    throw new ChatError("The chat service returned an invalid response.", 502);
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new ChatError(
        "Azure OpenAI resource or model deployment not found. Verify AZURE_OPENAI_ENDPOINT and that AZURE_OPENAI_MODEL (or AZURE_OPENAI_DEPLOYMENT) matches a deployed model.",
        502
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new ChatError(
        "Azure OpenAI rejected the configured API key or endpoint. Verify AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT in the server environment.",
        502
      );
    }
    throw new ChatError(data.error?.message || `Chat service error (${response.status})`, 502);
  }

  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new ChatError("The chat service returned no reply.", 502);
  }
  return reply;
}

module.exports = { ChatError, generateReply };
