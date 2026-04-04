import { GENRES } from "../data/questions.js";
import { inferTagsFromText } from "./recommendationCore.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

const GENRE_ID_TO_KEY = Object.fromEntries(
  Object.entries(GENRES).map(([genreKey, genreValue]) => [genreValue.id, genreKey])
);

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
  focusTags
}) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return { source: "fallback", movies: [] };
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    vote_count_gte: "120",
    with_genres: [primaryGenreId, secondaryGenreId].filter(Boolean).join(",")
  });

  if (languagePreference && languagePreference !== "any") {
    params.set("with_original_language", languagePreference);
  }

  const discoverPageOne = new URLSearchParams(params);
  discoverPageOne.set("page", "1");

  const discoverPageTwo = new URLSearchParams(params);
  discoverPageTwo.set("page", "2");

  const discoverUrls = [
    `${TMDB_BASE_URL}/discover/movie?${discoverPageOne.toString()}`,
    `${TMDB_BASE_URL}/discover/movie?${discoverPageTwo.toString()}`
  ];

  const focusQuery = pickFocusQuery(focusTags);
  if (focusQuery) {
    const searchParams = new URLSearchParams({
      api_key: apiKey,
      include_adult: "false",
      language: "en-US",
      page: "1",
      query: focusQuery
    });

    discoverUrls.push(`${TMDB_BASE_URL}/search/movie?${searchParams.toString()}`);
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

  const languageFilteredMovies =
    languagePreference && languagePreference !== "any"
      ? mappedMovies.filter((movie) => movie.language === languagePreference)
      : mappedMovies;

  const movies = (languageFilteredMovies.length ? languageFilteredMovies : mappedMovies).slice(
    0,
    36
  );

  return {
    source: "tmdb",
    movies
  };
}
