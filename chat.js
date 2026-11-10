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
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim().replace(/\/+$/, "");
  const model =
    process.env.AZURE_OPENAI_DEPLOYMENT?.trim() ||
    process.env.AZURE_OPENAI_MODEL?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();

  if (!endpoint || !model || !apiKey) {
    throw new ChatError(
      "The chat service is not configured. Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_MODEL (or AZURE_OPENAI_DEPLOYMENT), and AZURE_OPENAI_API_KEY.",
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
    throw new ChatError(data.error?.message || `Chat service error (${response.status})`, 502);
  }

  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply.trim()) {
    throw new ChatError("The chat service returned no reply.", 502);
  }
  return reply;
}

module.exports = { ChatError, generateReply };
