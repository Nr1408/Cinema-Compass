import { FALLBACK_MOVIES_BY_GENRE } from "../data/fallbackMovies.js";
import { GENRES, QUESTIONS } from "../data/questions.js";
import { fetchMoviesFromTmdb } from "./tmdbClient.js";

const OPTION_LOOKUP = new Map();

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

function scoreAnswers(answers) {
  const scores = createInitialScores();

  for (const [questionId, optionId] of Object.entries(answers || {})) {
    const option = OPTION_LOOKUP.get(`${questionId}:${optionId}`);
    if (!option || !option.weights) {
      continue;
    }

    for (const [genreKey, weight] of Object.entries(option.weights)) {
      scores[genreKey] = (scores[genreKey] || 0) + Number(weight || 0);
    }
  }

  return scores;
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

function getFallbackMovies(primaryKey) {
  return (
    FALLBACK_MOVIES_BY_GENRE[primaryKey] ||
    FALLBACK_MOVIES_BY_GENRE.default ||
    []
  ).slice(0, 8);
}

export async function recommendFromAnswers(answers) {
  const scores = scoreAnswers(answers);
  const [primaryKey, secondaryKey] = selectTopGenres(scores);

  const primaryGenre = GENRES[primaryKey];
  const secondaryGenre = secondaryKey ? GENRES[secondaryKey] : null;

  let movies = [];
  let source = "fallback";

  try {
    const tmdbResponse = await fetchMoviesFromTmdb({
      primaryGenreId: primaryGenre.id,
      secondaryGenreId: secondaryGenre ? secondaryGenre.id : null
    });

    source = tmdbResponse.source;
    movies = tmdbResponse.movies;
  } catch (error) {
    source = "fallback";
  }

  if (!movies.length) {
    movies = getFallbackMovies(primaryKey);
    source = "fallback";
  }

  return {
    movieType: primaryGenre.label,
    backupType: secondaryGenre ? secondaryGenre.label : null,
    source,
    movies
  };
}
