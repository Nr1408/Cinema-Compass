# Supabase Function Deployment

This folder contains the cloud backend used in deployment.

## Function

- Name: quiz-api
- File: supabase/functions/quiz-api/index.ts

## Deploy Commands

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase secrets set TMDB_API_KEY=YOUR_TMDB_KEY
npx supabase secrets set CORS_ORIGIN=https://your-vercel-app.vercel.app
npx supabase functions deploy quiz-api --no-verify-jwt
```

## Endpoint Routes

- Questions: https://YOUR_PROJECT_REF.supabase.co/functions/v1/quiz-api?route=questions
- Recommend: https://YOUR_PROJECT_REF.supabase.co/functions/v1/quiz-api?route=recommend
