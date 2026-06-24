# Result UGC Chat

Chat-based UGC video generator. Paste a product URL, get a short-form ad video back. The system scrapes the product page, writes a UGC script with GPT-4o, generates scene images with DALL-E, adds voiceover via ElevenLabs, and stitches everything into a vertical MP4 with FFmpeg.

## Tech Stack

**Frontend**

- Next.js 15 (App Router, React 19)
- TypeScript
- Lucide React (icons)

**Backend**

- Node.js + Express 5 (ESM)
- OpenAI SDK (GPT-4o for chat/scripting, DALL-E for scene images)
- ElevenLabs TTS (voiceover)
- Fluent-FFmpeg + @ffmpeg-installer (video assembly)
- Axios + Cheerio (product page scraping)
- Zod (request validation)

**Database**

- PostgreSQL 16
- Prisma ORM

**Infrastructure**

- Docker Compose (Postgres container)
- npm Workspaces (monorepo)

## Prerequisites

- Node.js >= 18
- Docker & Docker Compose
- An OpenAI API key (required for chat, scripting, and image generation)
- An ElevenLabs API key (optional, for voiceover — falls back to silent scenes)

## Project Structure

```
├── backend/
│   ├── prisma/schema.prisma   # database schema
│   ├── src/
│   │   ├── server.js          # express app, routes, SSE streaming
│   │   ├── chat.js            # conversation handling, script generation
│   │   ├── product.js         # URL extraction, page scraping
│   │   ├── videoGenerator.js  # image gen, TTS, FFmpeg pipeline
│   │   └── prisma.js          # prisma client singleton
│   └── storage/               # generated videos + error logs (gitignored)
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── page.tsx       # chat UI
│       │   ├── layout.tsx     # root layout
│       │   └── globals.css    # styles
│       └── lib/
│           ├── api.ts         # backend API client (SSE)
│           └── user.ts        # anonymous user ID (localStorage)
├── docker-compose.yml         # postgres container
└── package.json               # workspace root
```

## Setup

### 1. Start the database

```bash
docker compose up -d
```

This starts Postgres on port `5433` (avoids conflicts with any existing Postgres on `5432`).

### 2. Install dependencies

```bash
npm install
```

### 3. Generate Prisma client and push schema

```bash
npm run prisma:generate
npm run prisma:push
```

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
```

Open `backend/.env` and fill in your API keys:

| Variable              | Required | Description                                              |
| --------------------- | -------- | -------------------------------------------------------- |
| `DATABASE_URL`        | Yes      | Postgres connection string (pre-filled for local Docker) |
| `PORT`                | No       | Backend port, defaults to `4000`                         |
| `PUBLIC_API_URL`      | No       | Public URL for serving video files                       |
| `OPENAI_API_KEY`      | Yes      | OpenAI API key for GPT-4o and DALL-E                     |
| `GPT_MODEL`           | No       | OpenAI model, defaults to `gpt-4o`                       |
| `ELEVENLABS_API_KEY`  | No       | ElevenLabs API key for voiceover                         |
| `ELEVENLABS_VOICE_ID` | No       | ElevenLabs voice ID, has a default                       |

### 5. Run the app

```bash
npm run dev
```

This starts both services concurrently:

- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:4000

## How It Works

1. User sends a message in the chat UI
2. If the message contains a product URL (and looks like a video request), the backend kicks off the pipeline:
   - Scrapes the product page for title, description, images
   - Sends the scraped data to GPT-4o to generate a scene-by-scene UGC script
   - For each scene: generates an AI image (DALL-E), records voiceover (ElevenLabs), composites into a clip
   - Concatenates all scene clips, adds generated background music
   - Saves the final MP4 and returns the URL via SSE
3. If it's just a regular message, GPT-4o replies conversationally

## Available Scripts

| Command                   | Description                                 |
| ------------------------- | ------------------------------------------- |
| `npm run dev`             | Start both frontend and backend in dev mode |
| `npm run build`           | Build both workspaces                       |
| `npm run logs`            | Tail the backend error log                  |
| `npm run prisma:generate` | Regenerate the Prisma client                |
| `npm run prisma:push`     | Push schema changes to the database         |
