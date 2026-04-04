import { FALLBACK_MOVIES } from "../data/fallbackMovies.js";
import {
  GENRES,
  LANGUAGE_LABELS,
  PREFERENCE_TAG_LABELS,
  QUESTIONS
} from "../data/questions.js";
import { fetchMoviesFromTmdb } from "./tmdbClient.js";

const OPTION_LOOKUP = new Map();
const RESULT_LIMIT = 5;

for (const question of QUESTIONS) {
  for (const option of question.options) {
    OPTION_LOOKUP.set(`${question.id}:${option.id}`, option);
  }
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

export async function recommendFromAnswers(answers) {
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
  } catch (error) {
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
