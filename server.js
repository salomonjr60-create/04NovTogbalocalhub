const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const jobs = new Map();

for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
  if (m) process.env[m[1]] = m[2].trim().replace(/^["']+|["']+$/g, "");
}

const { AZURE_OPENAI_ENDPOINT: ENDPOINT, AZURE_OPENAI_DEPLOYMENT: MODEL, AZURE_OPENAI_API_KEY: KEY } = process.env;
const PORT = process.env.PORT || 3000;

const SYSTEM = `You are an expert digital marketing assistant. You help with SEO, social media content, ad copy (Google/Meta/TikTok/LinkedIn), email campaigns, content calendars, brand voice, audience personas, funnels, and analytics. Give practical, ready-to-use output, well structured with headings and bullet points. Ask a brief clarifying question only if essential.`;

async function chat(messages) {
  const res = await fetch(`${ENDPOINT.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": KEY, Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, ...messages] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Upstream error ${res.status}`);
  return data.choices[0].message.content;
}

http
  .createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }
    if (req.method === "GET" && req.url.startsWith("/api/result/")) {
      const job = jobs.get(req.url.split("/").pop());
      res.setHeader("Content-Type", "application/json");
      if (!job) { res.statusCode = 404; return res.end(JSON.stringify({ error: "Unknown job" })); }
      res.end(JSON.stringify(job));
      if (job.status !== "pending") setTimeout(() => jobs.delete(job.id), 60000);
      return;
    }
    if (req.method === "POST" && req.url === "/api/chat") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        res.setHeader("Content-Type", "application/json");
        try {
          const { messages } = JSON.parse(body);
          if (!Array.isArray(messages)) throw new Error("messages required");
          const clean = messages.slice(-20).map((m) => ({
            role: m.role === "assistant" ? "assistant" : "user",
            content: String(m.content).slice(0, 8000),
          }));
          const id = crypto.randomUUID();
          const job = { id, status: "pending" };
          jobs.set(id, job);
          chat(clean).then(
            (reply) => Object.assign(job, { status: "done", reply }),
            (e) => Object.assign(job, { status: "error", error: e.message })
          );
          res.end(JSON.stringify({ id }));
        } catch (e) {
          res.statusCode = 400;
          res.end(JSON.stringify({ error: e.message }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  })
  .listen(PORT, () => console.log(`Marketing bot running at http://localhost:${PORT}`));
