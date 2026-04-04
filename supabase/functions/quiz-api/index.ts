// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { FALLBACK_MOVIES } from "../../../server/src/data/fallbackMovies.js";
import {
  GENRES,
  LANGUAGE_LABELS,
  PREFERENCE_TAG_LABELS,
  QUESTIONS
} from "../../../server/src/data/questions.js";

const OPTION_LOOKUP = new Map();
const RESULT_LIMIT = 5;

const GENRE_ID_TO_KEY = Object.fromEntries(
  Object.entries(GENRES).map(([genreKey, genreValue]) => [genreValue.id, genreKey])
);

for (const question of QUESTIONS) {
  for (const option of question.options) {
    OPTION_LOOKUP.set(`${question.id}:${option.id}`, option);
  }
}

function getCorsHeaders(origin) {
  const configuredOrigins = Deno.env.get("CORS_ORIGIN") || "*";

  if (configuredOrigins === "*") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
  }

  const allowList = configuredOrigins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const selectedOrigin =
    origin && allowList.includes(origin) ? origin : allowList[0] || "*";

  return {
    "Access-Control-Allow-Origin": selectedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function jsonResponse(data, status = 200, corsHeaders) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function getPublicQuestions() {
  return QUESTIONS.map((question) => ({
    id: question.id,
    title: question.title,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text
    }))
  }));
}

function createInitialScores() {
  return Object.keys(GENRES).reduce((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function parseAnswers(answers) {
  const scores = createInitialScores();
  const tagCounts = {};

  let languagePreference = "any";
  let runtimePreference = null;
  let eraPreference = null;

  for (const [questionId, optionId] of Object.entries(answers || {})) {
    const option = OPTION_LOOKUP.get(`${questionId}:${optionId}`);
    if (!option || !option.weights) {
      continue;
    }

    for (const [genreKey, weight] of Object.entries(option.weights)) {
      scores[genreKey] = (scores[genreKey] || 0) + Number(weight || 0);
    }

    for (const tag of option.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }

    if (option.language) {
      languagePreference = option.language;
    }

    if (option.runtime) {
      runtimePreference = option.runtime;
    }

    if (option.era) {
      eraPreference = option.era;
    }
  }

  return {
    scores,
    tagCounts,
    languagePreference,
    runtimePreference,
    eraPreference
  };
}

function selectTopGenres(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] <= 0) {
    return ["comedy", "drama"];
  }

  const primaryKey = ranked[0][0];
  const secondaryKey = ranked[1] ? ranked[1][0] : null;

  return [primaryKey, secondaryKey];
}

function getTopPreferenceTags(tagCounts) {
  return Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tag]) => tag);
}

function scoreMovie(movie, context) {
  const movieGenres = Array.isArray(movie.genres) ? movie.genres : [];
  const movieTags = Array.isArray(movie.tags) ? movie.tags : [];

  let score = 0;

  if (movieGenres.includes(context.primaryKey)) {
    score += 8;
  }

  if (context.secondaryKey && movieGenres.includes(context.secondaryKey)) {
    score += 4;
  }

  for (const tag of context.preferredTags) {
    if (movieTags.includes(tag)) {
      score += 3;
    }
  }

  if (
    context.languagePreference !== "any" &&
    movie.language === context.languagePreference
  ) {
    score += 2.5;
  }

  if (context.runtimePreference && movie.runtime === context.runtimePreference) {
    score += 1.2;
  }

  if (context.eraPreference && movie.era === context.eraPreference) {
    score += 1;
  }

  score += Number(movie.rating || 0) / 20;

  return score;
}

function rankMovies(movies, context) {
  const ranked = movies
    .map((movie) => ({
      ...movie,
      __score: scoreMovie(movie, context)
    }))
    .sort((a, b) => b.__score - a.__score || (b.rating || 0) - (a.rating || 0));

  const uniqueMovies = [];
  const seenIds = new Set();

  for (const movie of ranked) {
    if (seenIds.has(movie.id)) {
      continue;
    }

    seenIds.add(movie.id);
    const { __score, ...moviePayload } = movie;
    uniqueMovies.push(moviePayload);

    if (uniqueMovies.length >= RESULT_LIMIT) {
      break;
    }
  }

  return uniqueMovies;
}

function buildReason({
  primaryGenre,
  secondaryGenre,
  languagePreference,
  preferredTags
}) {
  const reasonParts = [`you strongly matched ${primaryGenre.label}`];

  if (secondaryGenre) {
    reasonParts.push(`you also aligned with ${secondaryGenre.label.toLowerCase()}`);
  }

  if (languagePreference && languagePreference !== "any") {
    reasonParts.push(
      `you preferred ${LANGUAGE_LABELS[languagePreference] || languagePreference}`
    );
  }

  if (preferredTags.length) {
    const labels = preferredTags
      .map((tag) => PREFERENCE_TAG_LABELS[tag] || tag)
      .join(", ");
    reasonParts.push(`your interests included ${labels}`);
  }

  return `Recommended because ${reasonParts.join("; ")}.`;
}

function mapTmdbMovie(movie) {
  const mappedGenres = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
        .map((genreId) => GENRE_ID_TO_KEY[genreId])
        .filter(Boolean)
    : [];

  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path,
    releaseDate: movie.release_date,
    rating: movie.vote_average,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    genres: mappedGenres,
    tags: [],
    language: movie.original_language || "unknown"
  };
}

async function fetchMoviesFromTmdb({
  primaryGenreId,
  secondaryGenreId,
  languagePreference
}) {
  const apiKey = Deno.env.get("TMDB_API_KEY");

  if (!apiKey) {
    return { source: "fallback", movies: [] };
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    page: "1",
    vote_count_gte: "120",
    with_genres: [primaryGenreId, secondaryGenreId].filter(Boolean).join(",")
  });

  if (languagePreference && languagePreference !== "any") {
    params.set("with_original_language", languagePreference);
  }

  const response = await fetch(
    `https://api.themoviedb.org/3/discover/movie?${params.toString()}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`);
  }

  const data = await response.json();
  const movies = Array.isArray(data.results)
    ? data.results.slice(0, 18).map(mapTmdbMovie)
    : [];

  return {
    source: "tmdb",
    movies
  };
}

async function recommendFromAnswers(answers) {
  const {
    scores,
    tagCounts,
    languagePreference,
    runtimePreference,
    eraPreference
  } = parseAnswers(answers);

  const [primaryKey, secondaryKey] = selectTopGenres(scores);
  const preferredTags = getTopPreferenceTags(tagCounts);

  const primaryGenre = GENRES[primaryKey];
  const secondaryGenre = secondaryKey ? GENRES[secondaryKey] : null;

  const rankContext = {
    primaryKey,
    secondaryKey,
    preferredTags,
    languagePreference,
    runtimePreference,
    eraPreference
  };

  let movies = [];
  let source = "fallback";

  try {
    const tmdbResponse = await fetchMoviesFromTmdb({
      primaryGenreId: primaryGenre.id,
      secondaryGenreId: secondaryGenre ? secondaryGenre.id : null,
      languagePreference
    });

    source = tmdbResponse.source;
    movies = rankMovies(tmdbResponse.movies, rankContext);
  } catch {
    source = "fallback";
  }

  if (!movies.length) {
    movies = rankMovies(FALLBACK_MOVIES, rankContext);
    source = "fallback";
  }

  return {
    movieType: primaryGenre.label,
    backupType: secondaryGenre ? secondaryGenre.label : null,
    source,
    recommendationReason: buildReason({
      primaryGenre,
      secondaryGenre,
      languagePreference,
      preferredTags
    }),
    appliedPreferences: {
      language: LANGUAGE_LABELS[languagePreference] || LANGUAGE_LABELS.any,
      tags: preferredTags.map((tag) => PREFERENCE_TAG_LABELS[tag] || tag),
      runtime: runtimePreference || "Any",
      era: eraPreference || "Any"
    },
    movies
  };
}

function resolveRoute(requestUrl) {
  const routeFromQuery = requestUrl.searchParams.get("route");
  if (routeFromQuery) {
    return routeFromQuery;
  }

  const parts = requestUrl.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "questions";
}

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const route = resolveRoute(url);

  if (req.method === "GET" && (route === "health" || route === "quiz-api")) {
    return jsonResponse({ status: "ok" }, 200, corsHeaders);
  }

  if (req.method === "GET" && route === "questions") {
    return jsonResponse({ questions: getPublicQuestions() }, 200, corsHeaders);
  }

  if (req.method === "POST" && route === "recommend") {
    try {
      const payload = await req.json();
      const answers = payload?.answers;

      if (!answers || typeof answers !== "object") {
        return jsonResponse(
          { error: "answers must be an object with question ids as keys" },
          400,
          corsHeaders
        );
      }

      const recommendation = await recommendFromAnswers(answers);
      return jsonResponse(recommendation, 200, corsHeaders);
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400, corsHeaders);
    }
  }

  return jsonResponse(
    { error: "Route not found. Use route=questions or route=recommend" },
    404,
    corsHeaders
  );
});
