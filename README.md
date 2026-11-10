# Digital Marketing Bot

Requires Node.js 18 or later.

## Run locally

Copy `.env.example` to `.env` and set `AZURE_OPENAI_ENDPOINT` to the Azure OpenAI v1 endpoint, `AZURE_OPENAI_MODEL` to the deployment name, and `AZURE_OPENAI_API_KEY` to a key for that resource. `AZURE_OPENAI_DEPLOYMENT` can be used instead of `AZURE_OPENAI_MODEL`. Keep `.env` private.

Run `node server.js` and open <http://localhost:3000>. Set `PORT` in the environment or `.env` to use another port.

## Deploy to Vercel

Set the same Azure environment variables in the Vercel project settings for the intended environment and redeploy. Vercel does not use the local `.env` file.

## Test

Run `node --test` to check the chat logic, Vercel function, and local HTTP server using a mock Azure endpoint.
