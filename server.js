const http = require("http");
const fs = require("fs");
const path = require("path");
const { ChatError, generateReply } = require("./chat");

const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (match && process.env[match[1]] === undefined) {
      process.env[match[1]] = match[2].trim().replace(/^["']+|["']+$/g, "");
    }
  }
}

const PORT = process.env.PORT || 3000;

http
  .createServer((req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(fs.readFileSync(path.join(__dirname, "index.html")));
    }

    if (req.method === "POST" && req.url === "/api/chat") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
        if (body.length > 200000) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Request body is too large" }));
          req.destroy();
        }
      });
      req.on("end", async () => {
        if (res.writableEnded) return;
        try {
          const { messages } = JSON.parse(body);
          const reply = await generateReply(messages);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ reply }));
        } catch (error) {
          const statusCode = error instanceof ChatError ? error.statusCode : 400;
          res.writeHead(statusCode, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("Not found");
  })
  .listen(PORT, function () {
    console.log(`Marketing bot running at http://localhost:${this.address().port}`);
  });
