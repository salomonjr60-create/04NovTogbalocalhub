const { ChatError, generateReply } = require("../chat");

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const reply = await generateReply(req.body?.messages);
    return res.status(200).json({ reply });
  } catch (error) {
    const statusCode = error instanceof ChatError ? error.statusCode : 500;
    return res
      .status(statusCode)
      .json({ error: error.message || "An unexpected server error occurred." });
  }
};
