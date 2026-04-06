import { FALLBACK_MOVIES } from "../data/fallbackMovies.js";
import {
  GENRES,
  QUESTIONS
} from "../data/questions.js";
import { fetchMoviesFromTmdb } from "./tmdbClient.js";
import {
  buildMovieIdentityKey,
  buildConstraintNotice,
  buildRankContext,
  buildReason,
  formatAppliedPreferences,
  parseAnswers,
  rankMoviesDetailed
} from "./recommendationCore.js";

if (!QUESTIONS.length) {
  throw new Error("Question bank is empty. Cannot run recommender.");
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

export async function recommendFromAnswers(answers) {
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
  } catch (error) {
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
