const { test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { generateReply } = require("../chat");
const handler = require("../api/chat");

const root = path.join(__dirname, "..");

function response() {
  return {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

test("chat handler validates requests and uses the configured Azure endpoint", async () => {
  const savedFetch = global.fetch;
  const names = ["AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_MODEL", "AZURE_OPENAI_DEPLOYMENT", "AZURE_OPENAI_API_KEY"];
  const savedEnv = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  process.env.AZURE_OPENAI_ENDPOINT = 'endpoint = "https://example.test/openai/v1"';
  process.env.AZURE_OPENAI_MODEL = "deployment";
  delete process.env.AZURE_OPENAI_DEPLOYMENT;
  process.env.AZURE_OPENAI_API_KEY = "test-key";
  global.fetch = async (url, options) => {
    assert.equal(url, "https://example.test/openai/v1/chat/completions");
    assert.equal(options.headers["api-key"], "test-key");
    const body = JSON.parse(options.body);
    assert.equal(body.model, "deployment");
    assert.equal(body.messages[0].role, "system");
    assert.equal(body.messages[1].content, "Hello");
    return { ok: true, json: async () => ({ choices: [{ message: { content: "Hi" } }] }) };
  };

  try {
    await assert.rejects(generateReply([]), /non-empty array/);
    await assert.rejects(generateReply([{ role: "system", content: "Hello" }]), /valid role/);
    assert.equal(await generateReply([{ role: "user", content: "Hello" }]), "Hi");
    const ok = response();
    await handler({ method: "POST", body: { messages: [{ role: "user", content: "Hello" }] } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body, { reply: "Hi" });
    const wrongMethod = response();
    await handler({ method: "GET" }, wrongMethod);
    assert.equal(wrongMethod.statusCode, 405);
    assert.equal(wrongMethod.headers.Allow, "POST");
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "Unauthorized" } }) });
    await assert.rejects(generateReply([{ role: "user", content: "Hello" }]), /rejected the configured API key or endpoint/);
  } finally {
    global.fetch = savedFetch;
    for (const name of names) {
      if (savedEnv[name] === undefined) delete process.env[name];
      else process.env[name] = savedEnv[name];
    }
  }
});

test("local server serves the page and handles chat requests", async () => {
  const upstream = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      const request = JSON.parse(body);
      assert.equal(req.url, "/openai/v1/chat/completions");
      assert.equal(req.headers["api-key"], "test-key");
      assert.equal(request.model, "test-model");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: "Test response" } }] }));
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const app = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: "0",
      AZURE_OPENAI_ENDPOINT: `http://127.0.0.1:${upstream.address().port}/openai/v1`,
      AZURE_OPENAI_MODEL: "test-model",
      AZURE_OPENAI_DEPLOYMENT: "",
      AZURE_OPENAI_API_KEY: "test-key",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const port = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error("Local server did not start")), 5000);
      app.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/localhost:(\d+)/);
        if (match) { clearTimeout(timer); resolve(match[1]); }
      });
      app.once("error", (error) => { clearTimeout(timer); reject(error); });
      app.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Local server exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const page = await fetch(base);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Digital Marketing Bot/);
    const chat = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "Hello" }] }),
    });
    assert.equal(chat.status, 200);
    assert.deepEqual(await chat.json(), { reply: "Test response" });
    const invalid = await fetch(`${base}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [] }),
    });
    assert.equal(invalid.status, 400);
  } finally {
    app.kill();
    await new Promise((resolve) => upstream.close(resolve));
  }
});
