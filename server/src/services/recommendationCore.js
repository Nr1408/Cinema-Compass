import {
  GENRES,
  LANGUAGE_LABELS,
  MEDIA_PREFERENCE_LABELS,
  PREFERENCE_TAG_LABELS,
  QUESTIONS
} from "../data/questions.js";

export const RESULT_LIMIT = 10;

const MODEL_WEIGHTS = {
  genreAlignmentBase: 24,
  genreAlignmentStrictnessBoost: 10,
  primaryMatchBase: 5,
  primaryMatchStrictnessBoost: 7,
  primaryMissBasePenalty: 2.8,
  primaryMissStrictnessPenalty: 4.6,
  secondaryMatchBase: 2.2,
  secondaryMatchStrictnessBoost: 2.8,
  tagOverlapBase: 6,
  tagOverlapStrictnessBoost: 8,
  focusBaseBonus: 8,
  focusStrictnessBoost: 8,
  focusMissBasePenalty: 4,
  focusMissStrictnessPenalty: 8,
  languageMatchBase: 3,
  languageMatchStrictnessBoost: 6,
  languageMissBasePenalty: 3,
  languageMissStrictnessPenalty: 7,
  runtimeMatch: 2.2,
  runtimeMissPenalty: 1.4,
  eraMatch: 2.1,
  eraMissPenalty: 2.2,
  ratingBaseWeight: 1.6,
  voteCountBoostWeight: 0.9,
  constraintFitBoost: 9
};

const FOCUS_PRIORITY_SLOTS = 3;
const LANGUAGE_PRIORITY_SLOTS = 2;
const SOFT_LANGUAGE_MIN_FOCUS_MATCHES = 2;

const QUESTION_IMPORTANCE = {
  focus: 4.2,
  language: 3,
  media: 1,
  world: 1.6,
  pace: 1.5,
  length: 1.4,
  mood: 1.2,
  ending: 1.1,
  company: 1,
  era: 0.9
};

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

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeScores(scores) {
  const positiveTotal = Object.values(scores).reduce(
    (sum, value) => sum + Math.max(0, Number(value || 0)),
    0
  );

  if (!positiveTotal) {
    return Object.fromEntries(Object.keys(scores).map((key) => [key, 0]));
  }

  return Object.fromEntries(
    Object.entries(scores).map(([key, value]) => [
      key,
      Math.max(0, Number(value || 0)) / positiveTotal
    ])
  );
}

export function parseAnswers(answers) {
  const genreScores = createInitialScores();
  const tagScores = {};
  let answeredCount = 0;

  let languagePreference = "any";
  let mediaPreference = "movie";
  let runtimePreference = null;
  let eraPreference = null;
  let focusLabel = null;
  let focusTags = [];

  for (const [questionId, optionId] of Object.entries(answers || {})) {
    const option = OPTION_LOOKUP.get(`${questionId}:${optionId}`);
    if (!option) {
      continue;
    }

    answeredCount += 1;

    const questionWeight = QUESTION_IMPORTANCE[questionId] || 1;
    const optionWeights = option.weights || {};

    for (const [genreKey, weight] of Object.entries(optionWeights)) {
      genreScores[genreKey] =
        (genreScores[genreKey] || 0) + Number(weight || 0) * questionWeight;
    }

    for (const tag of option.tags || []) {
      tagScores[tag] = (tagScores[tag] || 0) + questionWeight;
    }

    if (questionId === "focus") {
      focusLabel = option.text || null;
      focusTags = Array.from(new Set(option.tags || []));
    }

    if (option.language) {
      languagePreference = option.language;
    }

    if (option.mediaPreference) {
      mediaPreference = option.mediaPreference;
    }

    if (option.runtime) {
      runtimePreference = option.runtime;
    }

    if (option.era) {
      eraPreference = option.era;
    }
  }

  return {
    genreScores,
    normalizedGenreScores: normalizeScores(genreScores),
    tagScores,
    answeredCount,
    languagePreference,
    mediaPreference,
    runtimePreference,
    eraPreference,
    focusLabel,
    focusTags
  };
}

export function selectTopGenres(scores) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] <= 0) {
    return ["comedy", "drama"];
  }

  return [ranked[0][0], ranked[1] ? ranked[1][0] : null];
}

export function getTopPreferenceTags(tagScores, limit = 4) {
  return Object.entries(tagScores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag]) => tag);
}

export function buildRankContext(profile) {
  const [primaryKey, secondaryKey] = selectTopGenres(profile.genreScores);
  const preferredTags = getTopPreferenceTags(profile.tagScores, 4);

  const scoreValues = Object.values(profile.genreScores).map((value) =>
    Math.max(0, safeNumber(value))
  );
  const scoreTotal = scoreValues.reduce((sum, value) => sum + value, 0);
  const primaryShare = scoreTotal
    ? Math.max(0, safeNumber(profile.genreScores[primaryKey])) / scoreTotal
    : 0;
  const secondaryShare =
    scoreTotal && secondaryKey
      ? Math.max(0, safeNumber(profile.genreScores[secondaryKey])) / scoreTotal
      : 0;
  const dominance = Math.max(0, primaryShare - secondaryShare);
  const focusFactor = profile.focusTags.length
    ? Math.min(profile.focusTags.length / 3, 1)
    : 0;
  const languageFactor = profile.languagePreference !== "any" ? 1 : 0;
  const answerCoverage = clamp(
    safeNumber(profile.answeredCount) / Math.max(QUESTIONS.length, 1),
    0,
    1
  );

  const strictness = clamp(
    0.34 +
      primaryShare * 0.28 +
      dominance * 0.22 +
      focusFactor * 0.1 +
      languageFactor * 0.06 +
      answerCoverage * 0.1,
    0.35,
    0.96
  );

  return {
    ...profile,
    primaryKey,
    secondaryKey,
    preferredTags,
    strictness
  };
}

function computeWeightedTagOverlap(movieTags, tagScores) {
  const desiredTagEntries = Object.entries(tagScores || {}).filter(
    ([, score]) => safeNumber(score) > 0
  );

  if (!desiredTagEntries.length) {
    return 0;
  }

  const desiredTotal = desiredTagEntries.reduce(
    (sum, [, score]) => sum + safeNumber(score),
    0
  );

  if (!desiredTotal) {
    return 0;
  }

  const movieTagSet = new Set(Array.isArray(movieTags) ? movieTags : []);
  const matchedTotal = desiredTagEntries.reduce((sum, [tag, score]) => {
    return movieTagSet.has(tag) ? sum + safeNumber(score) : sum;
  }, 0);

  return matchedTotal / desiredTotal;
}

function isLanguageMatch(movie, context) {
  if (!context.languagePreference || context.languagePreference === "any") {
    return true;
  }

  return movie.language === context.languagePreference;
}

function isFocusMatch(movie, context) {
  if (!context.focusTags.length) {
    return true;
  }

  const movieTags = Array.isArray(movie.tags) ? movie.tags : [];
  return context.focusTags.some((tag) => movieTags.includes(tag));
}

function isEraMatch(movie, context) {
  if (!context.eraPreference) {
    return true;
  }

  return Boolean(movie.era && movie.era === context.eraPreference);
}

function isExactOptionMatch(movie, context) {
  if (!isMediaPreferenceMatch(movie, context)) {
    return false;
  }

  if (!isLanguageMatch(movie, context)) {
    return false;
  }

  if (!isEraMatch(movie, context)) {
    return false;
  }

  if (!isFocusMatch(movie, context)) {
    return false;
  }

  return true;
}

function getMediaNoun(mediaPreference) {
  if (mediaPreference === "series") {
    return "series";
  }

  if (mediaPreference === "movie") {
    return "movies";
  }

  return "titles";
}

function getMovieMediaType(movie) {
  return movie.mediaType === "series" ? "series" : "movie";
}

function isMediaPreferenceMatch(movie, context) {
  if (!context.mediaPreference || context.mediaPreference === "any") {
    return true;
  }

  return getMovieMediaType(movie) === context.mediaPreference;
}

function buildMovieIdentityKey(movie) {
  return `${getMovieMediaType(movie)}:${String(movie.id)}:${movie.title || ""}`;
}

function computeConstraintFit(movie, context) {
  let slots = 0;
  let matched = 0;

  if (context.mediaPreference && context.mediaPreference !== "any") {
    slots += 1;
    if (isMediaPreferenceMatch(movie, context)) {
      matched += 1;
    }
  }

  if (context.languagePreference && context.languagePreference !== "any") {
    slots += 1;

    if (isLanguageMatch(movie, context)) {
      matched += 1;
    } else if (!movie.language || movie.language === "unknown") {
      matched += 0.35;
    }
  }

  if (context.eraPreference) {
    slots += 1;
    if (movie.era === context.eraPreference) {
      matched += 1;
    }
  }

  if (context.focusTags.length) {
    slots += 1;

    const movieTags = Array.isArray(movie.tags) ? movie.tags : [];
    const focusMatches = context.focusTags.filter((tag) => movieTags.includes(tag)).length;

    if (focusMatches > 0) {
      matched += Math.min(1, focusMatches / context.focusTags.length + 0.2);
    }
  }

  return slots ? matched / slots : 0.7;
}

export function inferTagsFromText(title = "", overview = "") {
  const text = `${title} ${overview}`.toLowerCase();

  const tagPatternMap = {
    motorsport: [
      /\bformula\s?1\b/,
      /\bf1\b/,
      /\bgrand prix\b/,
      /\ble mans\b/,
      /\bmotorsport\b/,
      /\brace\s?car\b/,
      /\bpit stop\b/
    ],
    cars: [/\brace\s?car\b/, /\bracing\b/, /\bracetrack\b/, /\bspeedway\b/],
    sports: [
      /\bathlete\b/,
      /\bteam\b/,
      /\bcoach\b/,
      /\btournament\b/,
      /\bleague\b/,
      /\bmatch\b/,
      /\bchampionship\b/,
      /\bfootball\b/,
      /\bcricket\b/,
      /\bbasketball\b/,
      /\bboxing\b/
    ],
    superhero: [
      /\bsuperhero\b/,
      /\bavenger\b/,
      /\bbatman\b/,
      /\bspider-man\b/,
      /\bx-men\b/
    ],
    detective: [/\bdetective\b/, /\binvestigation\b/, /\bmurder case\b/, /\bcrime scene\b/],
    mindgame: [/\btwist\b/, /\bpsychological\b/, /\bmystery\b/, /\bsecret\b/],
    trueStory: [/\btrue story\b/, /\bbased on\b/, /\bbiography\b/, /\breal[- ]life\b/],
    feelgood: [/\bfriendship\b/, /\bheartwarming\b/, /\buplifting\b/, /\bfeel-good\b/],
    dark: [/\bdark\b/, /\bhorror\b/, /\bhaunted\b/, /\bkiller\b/, /\bterror\b/],
    anime: [/\banime\b/, /\bmanga\b/],
    family: [/\bfamily\b/, /\bkids\b/, /\bchildren\b/],
    inspiring: [/\binspir(e|ing)\b/, /\bcomeback\b/, /\bdream\b/, /\bovercome\b/]
  };

  const detectedTags = [];

  for (const [tag, patterns] of Object.entries(tagPatternMap)) {
    if (patterns.some((pattern) => pattern.test(text))) {
      detectedTags.push(tag);
    }
  }

  return detectedTags;
}

export function scoreMovie(movie, context) {
  const movieGenres = Array.isArray(movie.genres) ? movie.genres : [];
  const movieTags = Array.isArray(movie.tags) ? movie.tags : [];
  const strictness = clamp(safeNumber(context.strictness, 0.55), 0.35, 0.96);

  let score = 0;

  const genreAlignment = movieGenres.reduce(
    (sum, genre) => sum + (context.normalizedGenreScores[genre] || 0),
    0
  );
  score +=
    genreAlignment *
    (MODEL_WEIGHTS.genreAlignmentBase +
      MODEL_WEIGHTS.genreAlignmentStrictnessBoost * strictness);

  if (movieGenres.includes(context.primaryKey)) {
    score +=
      MODEL_WEIGHTS.primaryMatchBase +
      MODEL_WEIGHTS.primaryMatchStrictnessBoost * strictness;
  } else {
    score -=
      MODEL_WEIGHTS.primaryMissBasePenalty +
      MODEL_WEIGHTS.primaryMissStrictnessPenalty * strictness;
  }

  if (context.secondaryKey && movieGenres.includes(context.secondaryKey)) {
    score +=
      MODEL_WEIGHTS.secondaryMatchBase +
      MODEL_WEIGHTS.secondaryMatchStrictnessBoost * strictness;
  }

  const tagOverlap = computeWeightedTagOverlap(movieTags, context.tagScores);
  score +=
    tagOverlap *
    (MODEL_WEIGHTS.tagOverlapBase + MODEL_WEIGHTS.tagOverlapStrictnessBoost * strictness);

  if (context.focusTags.length) {
    const focusMatches = context.focusTags.filter((tag) => movieTags.includes(tag)).length;
    const focusCoverage = focusMatches / context.focusTags.length;

    if (focusMatches > 0) {
      score +=
        focusCoverage *
          (MODEL_WEIGHTS.focusBaseBonus + MODEL_WEIGHTS.focusStrictnessBoost * strictness) +
        focusMatches * 2.2;
    } else {
      score -=
        MODEL_WEIGHTS.focusMissBasePenalty +
        MODEL_WEIGHTS.focusMissStrictnessPenalty * strictness;
    }
  }

  if (context.languagePreference !== "any") {
    if (movie.language === context.languagePreference) {
      score +=
        MODEL_WEIGHTS.languageMatchBase +
        MODEL_WEIGHTS.languageMatchStrictnessBoost * strictness;
    } else if (!movie.language || movie.language === "unknown") {
      score -= MODEL_WEIGHTS.languageMissBasePenalty / 2;
    } else if (movie.language && movie.language !== "unknown") {
      score -=
        MODEL_WEIGHTS.languageMissBasePenalty +
        MODEL_WEIGHTS.languageMissStrictnessPenalty * strictness;
    }
  }

  if (context.runtimePreference && movie.runtime) {
    score +=
      movie.runtime === context.runtimePreference
        ? MODEL_WEIGHTS.runtimeMatch
        : -MODEL_WEIGHTS.runtimeMissPenalty;
  }

  if (context.eraPreference && movie.era) {
    score +=
      movie.era === context.eraPreference
        ? MODEL_WEIGHTS.eraMatch
        : -MODEL_WEIGHTS.eraMissPenalty;
  }

  const ratingValue = clamp(safeNumber(movie.rating), 0, 10) / 10;
  const voteConfidence = movie.voteCount
    ? clamp(Math.log10(safeNumber(movie.voteCount, 0) + 1) / 3, 0, 1)
    : 0.35;

  score +=
    ratingValue *
    (MODEL_WEIGHTS.ratingBaseWeight + MODEL_WEIGHTS.voteCountBoostWeight * voteConfidence);

  const constraintFit = computeConstraintFit(movie, context);
  score += constraintFit * MODEL_WEIGHTS.constraintFitBoost;

  return score;
}

export function rankMoviesDetailed(movies, context, limit = RESULT_LIMIT) {
  const rankingSignals = {
    mediaRelaxed: false,
    languageRelaxed: false,
    languageSupplyLow: false,
    languagePriorityEnforced: false,
    exactMatchCount: 0,
    noExactOptionMatch: false,
    exactOptionMatchLimited: false,
    eraRelaxed: false,
    focusSupplyLow: false,
    focusPriorityEnforced: false,
    topFocusMatches: null,
    topLanguageMatches: null
  };

  const sourceMovies = Array.isArray(movies) ? movies : [];
  let baseMovies = sourceMovies;

  if (context.mediaPreference && context.mediaPreference !== "any") {
    const mediaMatchedMovies = sourceMovies.filter((movie) =>
      isMediaPreferenceMatch(movie, context)
    );

    if (mediaMatchedMovies.length) {
      baseMovies = mediaMatchedMovies;
    } else {
      rankingSignals.mediaRelaxed = true;
    }
  }

  const exactOptionMatches = sourceMovies.filter((movie) =>
    isExactOptionMatch(movie, context)
  );
  rankingSignals.exactMatchCount = exactOptionMatches.length;
  rankingSignals.noExactOptionMatch = exactOptionMatches.length === 0;
  rankingSignals.exactOptionMatchLimited =
    exactOptionMatches.length > 0 && exactOptionMatches.length < limit;

  const reservoirSize = Math.max(limit * 3, 24);
  let candidateMovies = baseMovies;
  const minConstraintFit =
    context.strictness >= 0.82 ? 0.84 : context.strictness >= 0.68 ? 0.72 : 0.52;

  if (context.languagePreference && context.languagePreference !== "any") {
    const languageMatches = candidateMovies.filter((movie) =>
      isLanguageMatch(movie, context)
    );
    let shouldApplyLanguageFilter = languageMatches.length >= Math.max(3, limit - 1);

    if (context.focusTags.length) {
      const focusLanguageMatches = languageMatches.filter((movie) =>
        isFocusMatch(movie, context)
      );

      if (focusLanguageMatches.length < SOFT_LANGUAGE_MIN_FOCUS_MATCHES) {
        shouldApplyLanguageFilter = false;
        rankingSignals.languageRelaxed = true;
      }
    }

    if (shouldApplyLanguageFilter) {
      candidateMovies = languageMatches;
    }
  }

  if (context.eraPreference) {
    const eraMatches = candidateMovies.filter((movie) => movie.era === context.eraPreference);
    let shouldApplyEraFilter = eraMatches.length >= Math.ceil(limit / 2);

    if (context.focusTags.length) {
      const focusEraMatches = eraMatches.filter((movie) => isFocusMatch(movie, context));

      if (focusEraMatches.length < SOFT_LANGUAGE_MIN_FOCUS_MATCHES) {
        shouldApplyEraFilter = false;
        rankingSignals.eraRelaxed = true;
      }
    }

    if (shouldApplyEraFilter) {
      candidateMovies = eraMatches;
    }
  }

  if (context.focusTags.length) {
    const focusMatches = candidateMovies.filter((movie) => isFocusMatch(movie, context));

    if (focusMatches.length >= Math.ceil(limit / 2)) {
      candidateMovies = focusMatches;
    } else if (focusMatches.length < Math.min(FOCUS_PRIORITY_SLOTS, limit)) {
      rankingSignals.focusSupplyLow = true;
    }
  }

  const strictCandidates = candidateMovies.filter(
    (movie) => computeConstraintFit(movie, context) >= minConstraintFit
  );

  if (strictCandidates.length >= Math.max(limit - 1, Math.ceil(limit * 0.85))) {
    candidateMovies = strictCandidates;
  }

  const scoreAndSort = (items) =>
    items
      .map((movie) => ({
        ...movie,
        __score: scoreMovie(movie, context),
        __constraintFit: computeConstraintFit(movie, context)
      }))
      .sort(
        (a, b) =>
          b.__score - a.__score ||
          b.__constraintFit - a.__constraintFit ||
          (b.rating || 0) - (a.rating || 0)
      );

  const ranked = scoreAndSort(candidateMovies);
  const uniqueMovies = [];
  const seenIds = new Set();

  for (const movie of ranked) {
    const key = buildMovieIdentityKey(movie);
    if (seenIds.has(key)) {
      continue;
    }

    seenIds.add(key);
    const { __score, __constraintFit, ...moviePayload } = movie;
    uniqueMovies.push(moviePayload);

    if (uniqueMovies.length >= reservoirSize) {
      break;
    }
  }

  if (uniqueMovies.length < limit && candidateMovies !== baseMovies) {
    const alreadyIncluded = new Set(uniqueMovies.map((movie) => buildMovieIdentityKey(movie)));
    const fallbackRanked = scoreAndSort(baseMovies);

    for (const movie of fallbackRanked) {
      const key = buildMovieIdentityKey(movie);
      if (alreadyIncluded.has(key)) {
        continue;
      }

      alreadyIncluded.add(key);
      const { __score, __constraintFit, ...moviePayload } = movie;
      uniqueMovies.push(moviePayload);

      if (uniqueMovies.length >= reservoirSize) {
        break;
      }
    }
  }

  if (context.focusTags.length && uniqueMovies.length) {
    const requiredFocusSlots = Math.min(FOCUS_PRIORITY_SLOTS, limit);
    const focusRankedMovies = uniqueMovies.filter((movie) => isFocusMatch(movie, context));

    if (focusRankedMovies.length < requiredFocusSlots) {
      const existingFocusKeys = new Set(
        focusRankedMovies.map((movie) => buildMovieIdentityKey(movie))
      );

      const additionalFocusMovies = scoreAndSort(baseMovies)
        .filter((movie) => isFocusMatch(movie, context))
        .map(({ __score, __constraintFit, ...moviePayload }) => moviePayload);

      for (const movie of additionalFocusMovies) {
        const key = buildMovieIdentityKey(movie);
        if (existingFocusKeys.has(key)) {
          continue;
        }

        existingFocusKeys.add(key);
        focusRankedMovies.push(movie);

        if (focusRankedMovies.length >= requiredFocusSlots) {
          break;
        }
      }
    }

    const nonFocusRankedMovies = uniqueMovies.filter(
      (movie) => !isFocusMatch(movie, context)
    );

    if (focusRankedMovies.length >= requiredFocusSlots) {
      uniqueMovies.splice(
        0,
        uniqueMovies.length,
        ...[...focusRankedMovies, ...nonFocusRankedMovies].slice(0, limit)
      );
      rankingSignals.focusPriorityEnforced = true;
    } else if (focusRankedMovies.length) {
      uniqueMovies.splice(
        0,
        uniqueMovies.length,
        ...[...focusRankedMovies, ...nonFocusRankedMovies].slice(0, limit)
      );
      rankingSignals.focusSupplyLow = true;
    } else {
      rankingSignals.focusSupplyLow = true;
    }
  }

  if (context.languagePreference && context.languagePreference !== "any" && uniqueMovies.length) {
    const requiredLanguageSlots = Math.min(
      context.focusTags.length ? 1 : LANGUAGE_PRIORITY_SLOTS,
      limit
    );
    const isLanguagePriorityEligible = (movie) => {
      if (!isLanguageMatch(movie, context)) {
        return false;
      }

      // When focus is selected, do not force language picks that break focus intent.
      if (context.focusTags.length && !isFocusMatch(movie, context)) {
        return false;
      }

      return true;
    };

    const languageRankedMovies = uniqueMovies.filter((movie) =>
      isLanguagePriorityEligible(movie)
    );

    if (languageRankedMovies.length < requiredLanguageSlots) {
      const existingLanguageKeys = new Set(
        languageRankedMovies.map((movie) => buildMovieIdentityKey(movie))
      );

      const languagePriorityPool = context.focusTags.length
        ? candidateMovies.filter((movie) => isFocusMatch(movie, context))
        : candidateMovies;

      const additionalLanguageMovies = scoreAndSort(languagePriorityPool)
        .filter((movie) => isLanguagePriorityEligible(movie))
        .map(({ __score, __constraintFit, ...moviePayload }) => moviePayload);

      for (const movie of additionalLanguageMovies) {
        const key = buildMovieIdentityKey(movie);
        if (existingLanguageKeys.has(key)) {
          continue;
        }

        existingLanguageKeys.add(key);
        languageRankedMovies.push(movie);

        if (languageRankedMovies.length >= requiredLanguageSlots) {
          break;
        }
      }
    }

    const nonLanguageRankedMovies = uniqueMovies.filter(
      (movie) => !isLanguageMatch(movie, context)
    );

    if (languageRankedMovies.length >= requiredLanguageSlots) {
      uniqueMovies.splice(
        0,
        uniqueMovies.length,
        ...[...languageRankedMovies, ...nonLanguageRankedMovies].slice(0, limit)
      );
      rankingSignals.languagePriorityEnforced = true;
    } else if (languageRankedMovies.length) {
      uniqueMovies.splice(
        0,
        uniqueMovies.length,
        ...[...languageRankedMovies, ...nonLanguageRankedMovies].slice(0, limit)
      );
      rankingSignals.languageSupplyLow = true;
    } else {
      rankingSignals.languageSupplyLow = true;
    }
  }

  const finalMovies = uniqueMovies.slice(0, limit);
  const topSlice = finalMovies.slice(0, Math.min(5, finalMovies.length));

  if (context.focusTags.length) {
    rankingSignals.topFocusMatches = topSlice.filter((movie) => isFocusMatch(movie, context))
      .length;
  }

  if (context.languagePreference && context.languagePreference !== "any") {
    rankingSignals.topLanguageMatches = topSlice.filter((movie) =>
      isLanguageMatch(movie, context)
    ).length;
  }

  return {
    movies: finalMovies,
    rankingSignals
  };
}

export function rankMovies(movies, context, limit = RESULT_LIMIT) {
  return rankMoviesDetailed(movies, context, limit).movies;
}

export function buildConstraintNotice(context, rankingSignals) {
  if (!rankingSignals) {
    return null;
  }

  const notes = [];

  if (rankingSignals.noExactOptionMatch) {
    const mediaNoun = getMediaNoun(context.mediaPreference);
    const languagePrefix =
      context.languagePreference && context.languagePreference !== "any"
        ? `${LANGUAGE_LABELS[context.languagePreference] || context.languagePreference} `
        : "";

    notes.push(
      `No ${languagePrefix}${mediaNoun} matched all selected options exactly, so closest matches are shown.`
    );
  } else if (rankingSignals.exactOptionMatchLimited) {
    notes.push(
      `Only ${rankingSignals.exactMatchCount} title${
        rankingSignals.exactMatchCount > 1 ? "s" : ""
      } matched all selected options exactly, so nearby matches were added.`
    );
  }

  if (context.focusTags.length && rankingSignals.focusSupplyLow) {
    notes.push(
      `Limited ${
        context.focusLabel ? context.focusLabel.toLowerCase() : "focus-matched"
      } titles were found, so broader options were added after focus-first picks.`
    );
  }

  if (context.mediaPreference !== "any" && rankingSignals.mediaRelaxed) {
    notes.push(
      "Format preference was softened because matching titles were limited in this pool."
    );
  }

  if (context.languagePreference !== "any" && rankingSignals.languageSupplyLow) {
    notes.push(
      `Only a few ${
        LANGUAGE_LABELS[context.languagePreference] || context.languagePreference
      } titles were available for this focus, so broader language picks were included.`
    );
  }

  if (
    context.languagePreference !== "any" &&
    rankingSignals.languageRelaxed &&
    !rankingSignals.languageSupplyLow
  ) {
    notes.push("Language preference was softened to preserve focus accuracy.");
  }

  if (context.eraPreference && rankingSignals.eraRelaxed) {
    notes.push("Era preference was softened to preserve focus accuracy.");
  }

  if (!notes.length) {
    return null;
  }

  return `Note: ${notes.join(" ")}`;
}

export function buildReason({
  primaryGenre,
  secondaryGenre,
  mediaPreference,
  languagePreference,
  preferredTags,
  focusLabel
}) {
  const reasonParts = [`you strongly matched ${primaryGenre.label}`];

  if (secondaryGenre) {
    reasonParts.push(`you also aligned with ${secondaryGenre.label.toLowerCase()}`);
  }

  if (focusLabel) {
    reasonParts.push(`you selected ${focusLabel.toLowerCase()} as your main focus`);
  }

  if (mediaPreference && mediaPreference !== "any") {
    reasonParts.push(
      `you asked for ${MEDIA_PREFERENCE_LABELS[mediaPreference] || mediaPreference}`
    );
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

export function formatAppliedPreferences(context) {
  return {
    media: MEDIA_PREFERENCE_LABELS[context.mediaPreference] || MEDIA_PREFERENCE_LABELS.movie,
    language: LANGUAGE_LABELS[context.languagePreference] || LANGUAGE_LABELS.any,
    tags: context.preferredTags.map((tag) => PREFERENCE_TAG_LABELS[tag] || tag),
    runtime: context.runtimePreference || "Any",
    era: context.eraPreference || "Any",
    focus: context.focusLabel || "No specific focus"
  };
}
