# Cinema Compass - Movie Recommendation Website

A college project website that asks users preference questions and recommends a movie type with movie cards.

## Tech Stack

- Frontend: React + Vite
- Local backend (development): Node.js + Express
- Cloud backend (deployment): Supabase Edge Function
- Recommendation logic: weighted quiz scoring + TMDB discover API + offline fallback movies

## Features

- Question-based recommendation flow
- Genre scoring from quiz answers
- TMDB movie fetch when API key is available
- Automatic fallback recommendations when TMDB is unavailable
- Responsive UI for desktop and mobile

## Project Structure

- client: React frontend
- server: Express API for local development
- supabase/functions/quiz-api: Supabase Edge Function for cloud deployment
- supabase/config.toml: Supabase function config

## Local Setup

### 1) Install dependencies

From project root:

```bash
npm install
npm run install:all
```

### 2) Configure environment variables

Create server/.env from server/.env.example:

```env
PORT=5000
TMDB_API_KEY=your_tmdb_api_key_here
CORS_ORIGIN=http://localhost:5173
```

Create client/.env from client/.env.example:

```env
VITE_QUESTIONS_API_URL=http://localhost:5000/api/questions
VITE_RECOMMEND_API_URL=http://localhost:5000/api/recommend
```

### 3) Run locally

From project root:

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000

## Deploy to Cloud

### Backend on Supabase Edge Functions

1. Create a Supabase project.
2. Install Supabase CLI.
3. Login and link your project:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

4. Set secrets used by the function:

```bash
npx supabase secrets set TMDB_API_KEY=YOUR_TMDB_KEY
npx supabase secrets set CORS_ORIGIN=https://your-vercel-app.vercel.app
```

5. Deploy function:

```bash
npx supabase functions deploy quiz-api --no-verify-jwt
```

6. Your function base URL will be:

https://YOUR_PROJECT_REF.supabase.co/functions/v1/quiz-api

Use these routes:

- Questions: ?route=questions
- Recommend: ?route=recommend

### Frontend on Vercel

1. Import this repo in Vercel.
2. Set root directory to client.
3. Build command: npm run build
4. Output directory: dist
5. Add environment variables:

```env
VITE_QUESTIONS_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/quiz-api?route=questions
VITE_RECOMMEND_API_URL=https://YOUR_PROJECT_REF.supabase.co/functions/v1/quiz-api?route=recommend
```

6. Deploy.

## Notes

- If TMDB is blocked or key is missing, the project still works using fallback movie data.
- Keep TMDB key only in server .env or Supabase secrets, never in frontend code.

## Viva Quick Explanation

- Each answer adds weighted points to multiple genres.
- The highest score becomes the primary movie type.
- The app fetches movies for top genres from TMDB.
- If TMDB is unavailable, fallback recommendations are returned.
