# Result UGC Chat

A small full-stack app for the founding engineer task:

- Next.js chat UI
- Express API
- Anthropic-powered natural conversation and product understanding
- PostgreSQL persistence through Prisma
- Anonymous per-browser users via a generated `anonymousUserId`
- MP4 assembly with `ffmpeg-static`

## Run locally

1. Start Postgres:

```bash
docker compose up -d
```

2. Install dependencies and create tables:

```bash
npm install
npm run prisma:generate
npm run prisma:push
```

3. Configure the backend:

```bash
cp backend/.env.example backend/.env
```

Add the Anthropic key to `backend/.env`.

4. Start both apps:

```bash
npm run dev
```

Frontend: http://localhost:3000

Backend: http://localhost:4000

The included Postgres container binds to local port `5433` to avoid clashing with any existing Postgres on `5432`.

## How it works

Type naturally. Greetings and questions get normal chat responses. When a message includes a product URL or asks for a UGC video, the backend fetches page metadata, asks Anthropic for a concise creative brief, chooses a meme-style GIF/audio mood, assembles a short video, persists the result, and returns the final MP4 URL inside the chat.
