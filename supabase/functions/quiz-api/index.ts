// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.5";
// Initialize Supabase client using environment variables
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

import { FALLBACK_MOVIES } from "../../../server/src/data/fallbackMovies.js";
import { GENRES, QUESTIONS } from "../../../server/src/data/questions.js";
import {
  buildMovieIdentityKey,
  buildConstraintNotice,
  buildRankContext,
  buildReason,
  formatAppliedPreferences,
  inferTagsFromText,
  parseAnswers,
  rankMoviesDetailed
} from "../../../server/src/services/recommendationCore.js";

const MOVIE_GENRE_ID_TO_KEY = Object.fromEntries(
  Object.entries(GENRES).map(([genreKey, genreValue]) => [genreValue.id, genreKey])
);

const TV_GENRE_FILTER_ID_BY_KEY = {
  action: 10759,
  adventure: 10759,
  animation: 16,
  comedy: 35,
  crime: 80,
  drama: 18,
  family: 10751,
  fantasy: 10765,
  horror: 9648,
  mystery: 9648,
  romance: 18,
  scienceFiction: 10765,
  thriller: 9648
};

const TV_GENRE_ID_TO_KEYS = {
  10759: ["action", "adventure"],
  16: ["animation"],
  35: ["comedy"],
  80: ["crime"],
  18: ["drama"],
  10751: ["family"],
  10762: ["family"],
  9648: ["mystery", "thriller"],
  10765: ["scienceFiction", "fantasy"]
};

function getEndpointMediaType(mediaType) {
  return mediaType === "series" ? "tv" : "movie";
}

function resolveGenreFilterId(genreKey, mediaType) {
  if (!genreKey) {
    return null;
  }

  if (mediaType === "series") {
    return TV_GENRE_FILTER_ID_BY_KEY[genreKey] || null;
  }

  return GENRES[genreKey] ? GENRES[genreKey].id : null;
}

function normalizeMediaPreference(mediaPreference) {
  if (mediaPreference === "series" || mediaPreference === "any") {
    return mediaPreference;
  }

  return "movie";
}

function expandGenreKeys(genreIds, mediaType) {
  const normalizedGenreIds = Array.isArray(genreIds) ? genreIds : [];

  if (mediaType === "series") {
    const collected = [];

    for (const genreId of normalizedGenreIds) {
      for (const genreKey of TV_GENRE_ID_TO_KEYS[genreId] || []) {
        collected.push(genreKey);
      }
    }

    return Array.from(new Set(collected));
  }

  return normalizedGenreIds.map((genreId) => MOVIE_GENRE_ID_TO_KEY[genreId]).filter(Boolean);
}

const ERA_FILTERS = {
  latest: {
    minDate: "2020-01-01",
    maxDate: null,
    strictVoteThreshold: "100",
    broadVoteThreshold: "70"
  },
  modern: {
    minDate: "2005-01-01",
    maxDate: "2019-12-31",
    strictVoteThreshold: "70",
    broadVoteThreshold: "45"
  },
  classic: {
    minDate: null,
    maxDate: "2004-12-31",
    strictVoteThreshold: "20",
    broadVoteThreshold: "10"
  }
};

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

function mergeMoviePools(primaryMovies, secondaryMovies) {
  const merged = [];
  const seen = new Set();

  for (const movie of [...primaryMovies, ...secondaryMovies]) {
    const key = buildMovieIdentityKey(movie);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(movie);
  }

  return merged;
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

function applyEraFilters(params, eraPreference, queryScope, mediaType) {
  const config = ERA_FILTERS[eraPreference];

  if (!config) {
    return;
  }

  const dateFieldPrefix = mediaType === "series" ? "first_air_date" : "primary_release_date";

  if (config.minDate) {
    params.set(`${dateFieldPrefix}.gte`, config.minDate);
  }

  if (config.maxDate) {
    params.set(`${dateFieldPrefix}.lte`, config.maxDate);
  }

  params.set(
    "vote_count_gte",
    queryScope === "strict" ? config.strictVoteThreshold : config.broadVoteThreshold
  );
}

function pickFocusQueries(focusTags = []) {
  const tagSet = new Set(focusTags);

  if (tagSet.has("motorsport") || tagSet.has("cars")) {
    return ["formula 1", "racing", "grand prix"];
  }

  if (tagSet.has("sports")) {
    return ["sports"];
  }

  if (tagSet.has("superhero")) {
    return ["superhero"];
  }

  if (tagSet.has("detective")) {
    return ["detective"];
  }

  if (tagSet.has("anime")) {
    return ["anime"];
  }

  if (tagSet.has("dark")) {
    return ["horror"];
  }

  if (tagSet.has("trueStory") || tagSet.has("inspiring")) {
    return ["biography", "based on a true story"];
  }

  return [];
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

function mapTmdbItem(item, mediaType) {
  const endpointMediaType = getEndpointMediaType(mediaType);
  const title = endpointMediaType === "tv" ? item.name : item.title;
  const releaseDate = endpointMediaType === "tv" ? item.first_air_date : item.release_date;

  return {
    id: item.id,
    title: title || item.title || item.name || "Untitled",
    overview: item.overview,
    posterPath: item.poster_path,
    releaseDate,
    rating: item.vote_average,
    voteCount: item.vote_count,
    tmdbUrl: `https://www.themoviedb.org/${endpointMediaType}/${item.id}`,
    genres: expandGenreKeys(item.genre_ids, mediaType),
    tags: inferTagsFromText(title || "", item.overview || ""),
    language: item.original_language || "unknown",
    runtime: null,
    era: inferEraFromDate(releaseDate),
    mediaType: mediaType === "series" ? "series" : "movie"
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
  primaryGenreKey,
  secondaryGenreKey,
  languagePreference,
  focusTags,
  eraPreference,
  mediaPreference
}) {
  const apiKey = Deno.env.get("TMDB_API_KEY");

  if (!apiKey) {
    return { source: "fallback", movies: [] };
  }

  const normalizedMediaPreference = normalizeMediaPreference(mediaPreference);
  const requestedMediaTypes =
    normalizedMediaPreference === "any"
      ? ["movie", "series"]
      : [normalizedMediaPreference];

  const requestPlans = [];

  for (const mediaType of requestedMediaTypes) {
    const endpointMediaType = getEndpointMediaType(mediaType);
    const primaryGenreId = resolveGenreFilterId(primaryGenreKey, mediaType);
    const secondaryGenreId = resolveGenreFilterId(secondaryGenreKey, mediaType);

    if (!primaryGenreId) {
      continue;
    }

    const strictGenreIds = Array.from(
      new Set([primaryGenreId, secondaryGenreId].filter(Boolean).map(String))
    );

    const strictParams = new URLSearchParams({
      api_key: apiKey,
      include_adult: "false",
      language: "en-US",
      sort_by: "popularity.desc",
      vote_count_gte: "120",
      with_genres: strictGenreIds.join(",")
    });

    const broadParams = new URLSearchParams({
      api_key: apiKey,
      include_adult: "false",
      language: "en-US",
      sort_by: "popularity.desc",
      vote_count_gte: "80",
      with_genres: String(primaryGenreId)
    });

    if (endpointMediaType === "movie") {
      strictParams.set("include_video", "false");
      broadParams.set("include_video", "false");
    }

    const shouldHardFilterLanguage =
      languagePreference && languagePreference !== "any" && !(focusTags || []).length;

    if (shouldHardFilterLanguage) {
      strictParams.set("with_original_language", languagePreference);
      broadParams.set("with_original_language", languagePreference);
    }

    applyEraFilters(strictParams, eraPreference, "strict", mediaType);
    applyEraFilters(broadParams, eraPreference, "broad", mediaType);

    for (const url of buildPagedUrls(
      `https://api.themoviedb.org/3/discover/${endpointMediaType}`,
      strictParams,
      1,
      3
    )) {
      requestPlans.push({ url, mediaType });
    }

    if (secondaryGenreId) {
      for (const url of buildPagedUrls(
        `https://api.themoviedb.org/3/discover/${endpointMediaType}`,
        broadParams,
        1,
        2
      )) {
        requestPlans.push({ url, mediaType });
      }
    }

    const focusQueries = pickFocusQueries(focusTags);
    for (const query of focusQueries) {
      for (let page = 1; page <= 2; page += 1) {
        const searchParams = new URLSearchParams({
          api_key: apiKey,
          include_adult: "false",
          language: "en-US",
          page: String(page),
          query
        });

        requestPlans.push({
          url: `https://api.themoviedb.org/3/search/${endpointMediaType}?${searchParams.toString()}`,
          mediaType
        });
      }
    }
  }

  if (!requestPlans.length) {
    return { source: "fallback", movies: [] };
  }
  const shouldHardFilterLanguage =
    languagePreference && languagePreference !== "any" && !(focusTags || []).length;

  const responses = await Promise.all(requestPlans.map(({ url }) => fetchJson(url)));
  const rawMovies = responses.flatMap((payload, index) => {
    const mediaType = requestPlans[index].mediaType;
    const results = Array.isArray(payload.results) ? payload.results : [];
    return results.map((item) => ({ item, mediaType }));
  });

  const uniqueRawMovies = [];
  const seenIds = new Set();

  for (const movie of rawMovies) {
    const mediaType = movie.mediaType === "series" ? "series" : "movie";
    const key = `${mediaType}:${movie.item.id}`;

    if (seenIds.has(key)) {
      continue;
    }

    seenIds.add(key);
    uniqueRawMovies.push(movie);
  }

  const mappedMovies = uniqueRawMovies.map(({ item, mediaType }) =>
    mapTmdbItem(item, mediaType)
  );

  return {
    source: "tmdb",
    movies: shouldHardFilterLanguage
      ? mappedMovies.filter((movie) => movie.language === languagePreference).slice(0, 96)
      : mappedMovies.slice(0, 96)
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
  let rankingSignals = null;

  try {
    const tmdbResponse = await fetchMoviesFromTmdb({
      primaryGenreKey: primaryKey,
      secondaryGenreKey: secondaryKey,
      languagePreference: rankContext.languagePreference,
      focusTags: rankContext.focusTags,
      eraPreference: rankContext.eraPreference,
      mediaPreference: rankContext.mediaPreference
    });

    source = tmdbResponse.source;
    let rankingResult = rankMoviesDetailed(tmdbResponse.movies, rankContext);
    movies = rankingResult.movies;
    rankingSignals = rankingResult.rankingSignals;

    if (rankContext.focusTags.length && rankingSignals.focusSupplyLow) {
      const blendedPool = mergeMoviePools(tmdbResponse.movies, FALLBACK_MOVIES);
      rankingResult = rankMoviesDetailed(blendedPool, rankContext);
      movies = rankingResult.movies;
      rankingSignals = {
        ...rankingResult.rankingSignals,
        languageRelaxed:
          rankingSignals.languageRelaxed || rankingResult.rankingSignals.languageRelaxed
      };
    }
  } catch {
    source = "fallback";
  }

  if (!movies.length) {
    const rankingResult = rankMoviesDetailed(FALLBACK_MOVIES, rankContext);
    movies = rankingResult.movies;
    rankingSignals = rankingResult.rankingSignals;
    source = "fallback";
  }

  return {
    movieType: primaryGenre.label,
    backupType: secondaryGenre ? secondaryGenre.label : null,
    source,
    recommendationReason: buildReason({
      primaryGenre,
      secondaryGenre,
      mediaPreference: rankContext.mediaPreference,
      languagePreference: rankContext.languagePreference,
      preferredTags: rankContext.preferredTags,
      focusLabel: rankContext.focusLabel
    }),
    constraintNotice: buildConstraintNotice(rankContext, rankingSignals),
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

      // Store quiz answers in Supabase
      try {
        await supabase.from("quiz_answers").insert([
          {
            answers,
            submitted_at: new Date().toISOString()
          }
        ]);
      } catch (e) {
        // Log but do not block recommendation if storing fails
        console.error("Failed to store quiz answers:", e);
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
