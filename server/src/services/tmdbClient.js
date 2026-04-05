import { GENRES } from "../data/questions.js";
import { inferTagsFromText } from "./recommendationCore.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const GENRE_ID_TO_KEY = Object.fromEntries(
  Object.entries(GENRES).map(([genreKey, genreValue]) => [genreValue.id, genreKey])
);

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

function applyEraFilters(params, eraPreference, queryScope) {
  const config = ERA_FILTERS[eraPreference];

  if (!config) {
    return;
  }

  if (config.minDate) {
    params.set("primary_release_date.gte", config.minDate);
  }

  if (config.maxDate) {
    params.set("primary_release_date.lte", config.maxDate);
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

function mapTmdbMovie(movie) {
  const mappedGenres = Array.isArray(movie.genre_ids)
    ? movie.genre_ids
        .map((genreId) => GENRE_ID_TO_KEY[genreId])
        .filter(Boolean)
    : [];

  const inferredTags = inferTagsFromText(movie.title || "", movie.overview || "");

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
    tags: inferredTags,
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

export async function fetchMoviesFromTmdb({
  primaryGenreId,
  secondaryGenreId,
  languagePreference,
  focusTags,
  eraPreference
}) {
  const apiKey = process.env.TMDB_API_KEY;

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

  const shouldHardFilterLanguage =
    languagePreference && languagePreference !== "any" && !(focusTags || []).length;

  if (shouldHardFilterLanguage) {
    strictParams.set("with_original_language", languagePreference);
    broadParams.set("with_original_language", languagePreference);
  }

  applyEraFilters(strictParams, eraPreference, "strict");
  applyEraFilters(broadParams, eraPreference, "broad");

  const discoverUrls = [
    ...buildPagedUrls(`${TMDB_BASE_URL}/discover/movie`, strictParams, 1, 3)
  ];

  if (secondaryGenreId) {
    discoverUrls.push(
      ...buildPagedUrls(`${TMDB_BASE_URL}/discover/movie`, broadParams, 1, 2)
    );
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

      discoverUrls.push(`${TMDB_BASE_URL}/search/movie?${searchParams.toString()}`);
    }
  }

  const responses = await Promise.all(discoverUrls.map((url) => fetchJson(url)));
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

  const movies = shouldHardFilterLanguage
    ? mappedMovies
        .filter((movie) => movie.language === languagePreference)
        .slice(0, 72)
    : mappedMovies.slice(0, 72);

  return {
    source: "tmdb",
    movies
  };
}
