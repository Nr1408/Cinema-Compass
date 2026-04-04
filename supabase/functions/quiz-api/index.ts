// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { FALLBACK_MOVIES } from "../../../server/src/data/fallbackMovies.js";
import { GENRES, QUESTIONS } from "../../../server/src/data/questions.js";
import {
  buildRankContext,
  buildReason,
  formatAppliedPreferences,
  inferTagsFromText,
  parseAnswers,
  rankMovies
} from "../../../server/src/services/recommendationCore.js";

const GENRE_ID_TO_KEY = Object.fromEntries(
  Object.entries(GENRES).map(([genreKey, genreValue]) => [genreValue.id, genreKey])
);

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

function inferEraFromDate(releaseDate) {
  const year = Number(String(releaseDate || "").slice(0, 4));

  if (!year || Number.isNaN(year)) {
    return null;
  }

  if (year >= 2020) {
    return "latest";
  }

  if (year >= 2005) {
    return "modern";
  }

  return "classic";
}

function pickFocusQuery(focusTags = []) {
  const tagSet = new Set(focusTags);

  if (tagSet.has("motorsport") || tagSet.has("cars")) {
    return "racing";
  }

  if (tagSet.has("sports")) {
    return "sports";
  }

  if (tagSet.has("superhero")) {
    return "superhero";
  }

  if (tagSet.has("detective")) {
    return "detective";
  }

  if (tagSet.has("anime")) {
    return "anime";
  }

  if (tagSet.has("dark")) {
    return "horror";
  }

  if (tagSet.has("trueStory") || tagSet.has("inspiring")) {
    return "biography";
  }

  return null;
}

function buildPagedUrls(baseUrl, params, startPage, endPage) {
  const urls = [];

  for (let page = startPage; page <= endPage; page += 1) {
    const nextParams = new URLSearchParams(params);
    nextParams.set("page", String(page));
    urls.push(`${baseUrl}?${nextParams.toString()}`);
  }

  return urls;
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
    voteCount: movie.vote_count,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`,
    genres: mappedGenres,
    tags: inferTagsFromText(movie.title || "", movie.overview || ""),
    language: movie.original_language || "unknown",
    runtime: null,
    era: inferEraFromDate(movie.release_date)
  };
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`);
  }

  return response.json();
}

async function fetchMoviesFromTmdb({
  primaryGenreId,
  secondaryGenreId,
  languagePreference,
  focusTags
}) {
  const apiKey = Deno.env.get("TMDB_API_KEY");

  if (!apiKey) {
    return { source: "fallback", movies: [] };
  }

  const strictParams = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    vote_count_gte: "120",
    with_genres: [primaryGenreId, secondaryGenreId].filter(Boolean).join(",")
  });

  const broadParams = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    vote_count_gte: "80",
    with_genres: String(primaryGenreId)
  });

  if (languagePreference && languagePreference !== "any") {
    strictParams.set("with_original_language", languagePreference);
    broadParams.set("with_original_language", languagePreference);
  }

  const urls = [
    ...buildPagedUrls("https://api.themoviedb.org/3/discover/movie", strictParams, 1, 3)
  ];

  if (secondaryGenreId) {
    urls.push(
      ...buildPagedUrls("https://api.themoviedb.org/3/discover/movie", broadParams, 1, 2)
    );
  }

  const focusQuery = pickFocusQuery(focusTags);
  if (focusQuery) {
    const searchParams = new URLSearchParams({
      api_key: apiKey,
      include_adult: "false",
      language: "en-US",
      page: "1",
      query: focusQuery
    });

    urls.push(`https://api.themoviedb.org/3/search/movie?${searchParams.toString()}`);
  }

  const responses = await Promise.all(urls.map((url) => fetchJson(url)));
  const rawMovies = responses.flatMap((payload) =>
    Array.isArray(payload.results) ? payload.results : []
  );

  const uniqueRawMovies = [];
  const seenIds = new Set();

  for (const movie of rawMovies) {
    if (seenIds.has(movie.id)) {
      continue;
    }

    seenIds.add(movie.id);
    uniqueRawMovies.push(movie);
  }

  const mappedMovies = uniqueRawMovies.map(mapTmdbMovie);

  const languageFilteredMovies =
    languagePreference && languagePreference !== "any"
      ? mappedMovies.filter((movie) => movie.language === languagePreference)
      : mappedMovies;

  return {
    source: "tmdb",
    movies: (languageFilteredMovies.length ? languageFilteredMovies : mappedMovies).slice(
      0,
      72
    )
  };
}

async function recommendFromAnswers(answers) {
  const profile = parseAnswers(answers);
  const rankContext = buildRankContext(profile);

  const { primaryKey, secondaryKey } = rankContext;
  const primaryGenre = GENRES[primaryKey];
  const secondaryGenre = secondaryKey ? GENRES[secondaryKey] : null;

  let movies = [];
  let source = "fallback";

  try {
    const tmdbResponse = await fetchMoviesFromTmdb({
      primaryGenreId: primaryGenre.id,
      secondaryGenreId: secondaryGenre ? secondaryGenre.id : null,
      languagePreference: rankContext.languagePreference,
      focusTags: rankContext.focusTags
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
      languagePreference: rankContext.languagePreference,
      preferredTags: rankContext.preferredTags,
      focusLabel: rankContext.focusLabel
    }),
    appliedPreferences: formatAppliedPreferences(rankContext),
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
