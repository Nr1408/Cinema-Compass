import { GENRES } from "../data/questions.js";
import { inferTagsFromText } from "./recommendationCore.js";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

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
  const mappedGenres = expandGenreKeys(item.genre_ids, mediaType);
  const inferredTags = inferTagsFromText(title || "", item.overview || "");

  return {
    id: item.id,
    title: title || item.title || item.name || "Untitled",
    overview: item.overview,
    posterPath: item.poster_path,
    releaseDate,
    rating: item.vote_average,
    voteCount: item.vote_count,
    tmdbUrl: `https://www.themoviedb.org/${endpointMediaType}/${item.id}`,
    genres: mappedGenres,
    tags: inferredTags,
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

export async function fetchMoviesFromTmdb({
  primaryGenreKey,
  secondaryGenreKey,
  languagePreference,
  focusTags,
  eraPreference,
  mediaPreference
}) {
  const apiKey = process.env.TMDB_API_KEY;

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
      `${TMDB_BASE_URL}/discover/${endpointMediaType}`,
      strictParams,
      1,
      3
    )) {
      requestPlans.push({ url, mediaType });
    }

    if (secondaryGenreId) {
      for (const url of buildPagedUrls(
        `${TMDB_BASE_URL}/discover/${endpointMediaType}`,
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
          url: `${TMDB_BASE_URL}/search/${endpointMediaType}?${searchParams.toString()}`,
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
  const rawItems = responses.flatMap((payload, index) => {
    const mediaType = requestPlans[index].mediaType;
    const results = Array.isArray(payload.results) ? payload.results : [];
    return results.map((item) => ({ item, mediaType }));
  });

  const uniqueRawMovies = [];
  const seenIds = new Set();

  for (const entry of rawItems) {
    const mediaType = entry.mediaType === "series" ? "series" : "movie";
    const key = `${mediaType}:${entry.item.id}`;

    if (seenIds.has(key)) {
      continue;
    }

    seenIds.add(key);
    uniqueRawMovies.push(entry);
  }

  const mappedMovies = uniqueRawMovies.map(({ item, mediaType }) =>
    mapTmdbItem(item, mediaType)
  );

  const movies = shouldHardFilterLanguage
    ? mappedMovies
        .filter((movie) => movie.language === languagePreference)
        .slice(0, 96)
    : mappedMovies.slice(0, 96);

  return {
    source: "tmdb",
    movies
  };
}
