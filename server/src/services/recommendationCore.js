import {
  GENRES,
  LANGUAGE_LABELS,
  PREFERENCE_TAG_LABELS,
  QUESTIONS
} from "../data/questions.js";

export const RESULT_LIMIT = 5;

const QUESTION_IMPORTANCE = {
  focus: 4.2,
  language: 3,
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

  let languagePreference = "any";
  let runtimePreference = null;
  let eraPreference = null;
  let focusLabel = null;
  let focusTags = [];

  for (const [questionId, optionId] of Object.entries(answers || {})) {
    const option = OPTION_LOOKUP.get(`${questionId}:${optionId}`);
    if (!option || !option.weights) {
      continue;
    }

    const questionWeight = QUESTION_IMPORTANCE[questionId] || 1;

    for (const [genreKey, weight] of Object.entries(option.weights)) {
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
    languagePreference,
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

  return {
    ...profile,
    primaryKey,
    secondaryKey,
    preferredTags
  };
}

export function inferTagsFromText(title = "", overview = "") {
  const text = `${title} ${overview}`.toLowerCase();

  const tagKeywordMap = {
    motorsport: ["formula", "f1", "race", "racing", "grand prix", "track"],
    cars: ["car", "cars", "driver", "racing", "speed"],
    sports: ["sport", "athlete", "team", "match", "coach", "tournament"],
    superhero: ["superhero", "hero", "avenger", "batman", "spider-man", "x-men"],
    detective: ["detective", "investigation", "murder case", "crime scene"],
    mindgame: ["mind", "twist", "psychological", "mystery", "secret"],
    trueStory: ["true story", "based on", "biography", "real-life", "real life"],
    feelgood: ["friendship", "heartwarming", "joy", "uplifting"],
    dark: ["dark", "horror", "haunted", "killer", "terror"],
    anime: ["anime", "manga"],
    family: ["family", "kids", "children"],
    inspiring: ["inspire", "inspiring", "comeback", "dream", "overcome"]
  };

  const detectedTags = [];

  for (const [tag, keywords] of Object.entries(tagKeywordMap)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      detectedTags.push(tag);
    }
  }

  return detectedTags;
}

export function scoreMovie(movie, context) {
  const movieGenres = Array.isArray(movie.genres) ? movie.genres : [];
  const movieTags = Array.isArray(movie.tags) ? movie.tags : [];

  let score = 0;

  const genreAlignment = movieGenres.reduce(
    (sum, genre) => sum + (context.normalizedGenreScores[genre] || 0),
    0
  );
  score += genreAlignment * 24;

  if (movieGenres.includes(context.primaryKey)) {
    score += 7;
  } else {
    score -= 4;
  }

  if (context.secondaryKey && movieGenres.includes(context.secondaryKey)) {
    score += 2.4;
  }

  for (const tag of context.preferredTags) {
    if (movieTags.includes(tag)) {
      score += (context.tagScores[tag] || 1) * 2.1;
    }
  }

  if (context.focusTags.length) {
    const focusMatches = context.focusTags.filter((tag) => movieTags.includes(tag)).length;

    if (focusMatches > 0) {
      score += 10 + focusMatches * 3;
    } else {
      score -= 8;
    }
  }

  if (context.languagePreference !== "any") {
    if (movie.language === context.languagePreference) {
      score += 6;
    } else if (movie.language && movie.language !== "unknown") {
      score -= 7;
    }
  }

  if (context.runtimePreference && movie.runtime) {
    score += movie.runtime === context.runtimePreference ? 2.1 : -1.2;
  }

  if (context.eraPreference && movie.era) {
    score += movie.era === context.eraPreference ? 2 : -1;
  }

  score += Math.min(Number(movie.rating || 0), 10) * 0.14;

  return score;
}

export function rankMovies(movies, context, limit = RESULT_LIMIT) {
  const baseMovies = Array.isArray(movies) ? movies : [];
  let candidateMovies = baseMovies;

  if (context.languagePreference && context.languagePreference !== "any") {
    const languageMatches = candidateMovies.filter(
      (movie) => movie.language === context.languagePreference
    );

    if (languageMatches.length >= Math.max(3, limit - 1)) {
      candidateMovies = languageMatches;
    }
  }

  if (context.eraPreference) {
    const eraMatches = candidateMovies.filter((movie) => movie.era === context.eraPreference);

    if (eraMatches.length >= Math.ceil(limit / 2)) {
      candidateMovies = eraMatches;
    }
  }

  if (context.focusTags.length) {
    const focusMatches = candidateMovies.filter((movie) => {
      const tags = Array.isArray(movie.tags) ? movie.tags : [];
      return context.focusTags.some((tag) => tags.includes(tag));
    });

    if (focusMatches.length >= Math.ceil(limit / 2)) {
      candidateMovies = focusMatches;
    }
  }

  const scoreAndSort = (items) =>
    items
      .map((movie) => ({
        ...movie,
        __score: scoreMovie(movie, context)
      }))
      .sort((a, b) => b.__score - a.__score || (b.rating || 0) - (a.rating || 0));

  const ranked = scoreAndSort(candidateMovies);

  const uniqueMovies = [];
  const seenIds = new Set();

  for (const movie of ranked) {
    if (seenIds.has(movie.id)) {
      continue;
    }

    seenIds.add(movie.id);
    const { __score, ...moviePayload } = movie;
    uniqueMovies.push(moviePayload);

    if (uniqueMovies.length >= limit) {
      break;
    }
  }

  if (uniqueMovies.length < limit && candidateMovies !== baseMovies) {
    const alreadyIncluded = new Set(uniqueMovies.map((movie) => movie.id));
    const fallbackRanked = scoreAndSort(baseMovies);

    for (const movie of fallbackRanked) {
      if (alreadyIncluded.has(movie.id)) {
        continue;
      }

      alreadyIncluded.add(movie.id);
      const { __score, ...moviePayload } = movie;
      uniqueMovies.push(moviePayload);

      if (uniqueMovies.length >= limit) {
        break;
      }
    }
  }

  return uniqueMovies;
}

export function buildReason({
  primaryGenre,
  secondaryGenre,
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
    language: LANGUAGE_LABELS[context.languagePreference] || LANGUAGE_LABELS.any,
    tags: context.preferredTags.map((tag) => PREFERENCE_TAG_LABELS[tag] || tag),
    runtime: context.runtimePreference || "Any",
    era: context.eraPreference || "Any",
    focus: context.focusLabel || "No specific focus"
  };
}
