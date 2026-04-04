import { FALLBACK_MOVIES } from "../data/fallbackMovies.js";
import {
  GENRES,
  QUESTIONS
} from "../data/questions.js";
import { fetchMoviesFromTmdb } from "./tmdbClient.js";
import {
  buildRankContext,
  buildReason,
  formatAppliedPreferences,
  parseAnswers,
  rankMovies
} from "./recommendationCore.js";

if (!QUESTIONS.length) {
  throw new Error("Question bank is empty. Cannot run recommender.");
}

export async function recommendFromAnswers(answers) {
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
      languagePreference: rankContext.languagePreference,
      preferredTags: rankContext.preferredTags,
      focusLabel: rankContext.focusLabel
    }),
    appliedPreferences: formatAppliedPreferences(rankContext),
    movies
  };
}
