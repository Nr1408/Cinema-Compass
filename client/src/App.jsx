import { useEffect, useMemo, useState } from "react";

const LEGACY_API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const QUESTIONS_API_URL =
  import.meta.env.VITE_QUESTIONS_API_URL ||
  (LEGACY_API_BASE_URL
    ? `${LEGACY_API_BASE_URL}/api/questions`
    : "http://localhost:5000/api/questions");

const RECOMMEND_API_URL =
  import.meta.env.VITE_RECOMMEND_API_URL ||
  (LEGACY_API_BASE_URL
    ? `${LEGACY_API_BASE_URL}/api/recommend`
    : "http://localhost:5000/api/recommend");

const HISTORY_STORAGE_KEY = "cinema-compass-history-v1";
const HISTORY_LIMIT = 8;

const MEDIA_LABEL_BY_ANSWER = {
  movie: "Movies only",
  series: "Series only",
  any: "Movies and series"
};

const ADAPTIVE_QUESTION_CONTENT = {
  pace: {
    series: {
      title: "What pacing style do you want in a series?",
      optionTextById: {
        fast: "Fast-paced episodes and cliffhangers",
        balanced: "Balanced character and story progression",
        slow: "Slow-burn world building"
      }
    },
    any: {
      title: "What pacing style do you want?",
      optionTextById: {
        fast: "Fast and thrilling (movie or series)",
        balanced: "Balanced storytelling",
        slow: "Slow and deep"
      }
    }
  },
  length: {
    series: {
      title: "How much can you watch right now?",
      optionTextById: {
        quick: "1 to 2 short episodes",
        normal: "3 to 5 episodes",
        long: "Long binge session"
      }
    },
    any: {
      title: "How much can you watch right now?",
      optionTextById: {
        quick: "Quick session (one short movie or 1 to 2 episodes)",
        normal: "Medium session (full movie or a few episodes)",
        long: "Long immersive watch or binge"
      }
    }
  }
};

function resolveMediaLabel(appliedMedia, selectedMediaAnswerId) {
  const trimmedApplied = typeof appliedMedia === "string" ? appliedMedia.trim() : "";
  if (trimmedApplied) {
    return trimmedApplied;
  }

  if (selectedMediaAnswerId && MEDIA_LABEL_BY_ANSWER[selectedMediaAnswerId]) {
    return MEDIA_LABEL_BY_ANSWER[selectedMediaAnswerId];
  }

  return "Movies only";
}

function normalizeStoredHistoryMedia(mediaLabel) {
  const resolved = resolveMediaLabel(mediaLabel, null);
  return resolved === "No format preference" ? "Movies only" : resolved;
}

function getAdaptiveQuestion(currentQuestion, mediaAnswer) {
  if (!currentQuestion) {
    return null;
  }

  const mediaKey = mediaAnswer === "series" || mediaAnswer === "any" ? mediaAnswer : "movie";
  const contentOverride = ADAPTIVE_QUESTION_CONTENT[currentQuestion.id]?.[mediaKey];

  if (!contentOverride) {
    return currentQuestion;
  }

  const optionTextById = contentOverride.optionTextById || {};

  return {
    ...currentQuestion,
    title: contentOverride.title || currentQuestion.title,
    options: currentQuestion.options.map((option) => ({
      ...option,
      text: optionTextById[option.id] || option.text
    }))
  };
}

function formatDate(value) {
  if (!value) {
    return "Unknown date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString();
}

function getPosterUrl(path) {
  if (!path) {
    return "";
  }

  return `https://image.tmdb.org/t/p/w500${path}`;
}

export default function App() {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [feedbackByMovie, setFeedbackByMovie] = useState({});
  const [historyItems, setHistoryItems] = useState([]);

  const currentQuestion = questions[currentIndex] || null;
  const displayedQuestion = useMemo(
    () => getAdaptiveQuestion(currentQuestion, answers.media),
    [currentQuestion, answers.media]
  );
  const totalQuestions = questions.length;
  const selectedOption = displayedQuestion ? answers[displayedQuestion.id] : null;
  const hasValidSelection = displayedQuestion
    ? displayedQuestion.options.some((option) => option.id === selectedOption)
    : false;

  const mediaPreferenceLabel = useMemo(
    () => resolveMediaLabel(result?.appliedPreferences?.media, answers.media),
    [result, answers.media]
  );

  const progress = useMemo(() => {
    if (!totalQuestions) {
      return 0;
    }
    return Math.round(((currentIndex + 1) / totalQuestions) * 100);
  }, [currentIndex, totalQuestions]);

  const rankedMovies = useMemo(() => {
    const movies = Array.isArray(result?.movies) ? result.movies : [];
    const originalOrder = new Map(movies.map((movie, index) => [String(movie.id), index]));

    const getFeedbackScore = (movieId) => {
      const feedback = feedbackByMovie[String(movieId)];
      if (feedback === "like") {
        return 2;
      }
      if (feedback === "dislike") {
        return 0;
      }
      return 1;
    };

    return [...movies].sort((a, b) => {
      const scoreDiff = getFeedbackScore(b.id) - getFeedbackScore(a.id);
      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      return (originalOrder.get(String(a.id)) || 0) - (originalOrder.get(String(b.id)) || 0);
    });
  }, [result, feedbackByMovie]);

  useEffect(() => {
    async function loadQuestions() {
      try {
        setLoading(true);
        setError("");

        const response = await fetch(QUESTIONS_API_URL);
        if (!response.ok) {
          throw new Error("Failed to fetch questions");
        }

        const data = await response.json();
        setQuestions(Array.isArray(data.questions) ? data.questions : []);
      } catch (loadError) {
        console.error(loadError);
        setError(
          "Unable to load quiz questions. Please start backend server and refresh."
        );
      } finally {
        setLoading(false);
      }
    }

    loadQuestions();
  }, []);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!storedHistory) {
        return;
      }

      const parsed = JSON.parse(storedHistory);
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          ...item,
          media: normalizeStoredHistoryMedia(item?.media)
        }));

        setHistoryItems(normalized);
      }
    } catch (historyError) {
      console.error(historyError);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(historyItems));
    } catch (historyError) {
      console.error(historyError);
    }
  }, [historyItems]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("high-refresh");

    return () => {
      root.classList.remove("high-refresh");
    };
  }, []);

  function chooseOption(optionId) {
    if (!currentQuestion) {
      return;
    }

    const questionId = currentQuestion.id;

    setAnswers((prev) => {
      if (prev[questionId] === optionId) {
        return prev;
      }

      const next = {
        ...prev,
        [questionId]: optionId
      };

      // When a prior answer changes, reset answers for later questions.
      for (const laterQuestion of questions.slice(currentIndex + 1)) {
        delete next[laterQuestion.id];
      }

      return next;
    });
  }

  async function submitQuiz() {
    try {
      setSubmitting(true);
      setError("");

      const response = await fetch(RECOMMEND_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ answers })
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recommendation");
      }

      const data = await response.json();
      setResult(data);
      setFeedbackByMovie({});

      const historyEntry = {
        id: `${Date.now()}`,
        time: new Date().toISOString(),
        movieType: data.movieType,
        media: resolveMediaLabel(data.appliedPreferences?.media, answers.media),
        topMovie: data.movies?.[0]?.title || "No movie available",
        source: data.source
      };

      setHistoryItems((prev) => [historyEntry, ...prev].slice(0, HISTORY_LIMIT));
    } catch (submitError) {
      console.error(submitError);
      setError("Could not generate recommendation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (!hasValidSelection) {
      return;
    }

    if (currentIndex === totalQuestions - 1) {
      submitQuiz();
      return;
    }

    setCurrentIndex((prev) => prev + 1);
  }

  function goBack() {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }

  function restart() {
    setResult(null);
    setAnswers({});
    setCurrentIndex(0);
    setError("");
    setFeedbackByMovie({});
  }

  function updateMovieFeedback(movieId, feedbackType) {
    const key = String(movieId);

    setFeedbackByMovie((prev) => {
      if (prev[key] === feedbackType) {
        const next = { ...prev };
        delete next[key];
        return next;
      }

      return {
        ...prev,
        [key]: feedbackType
      };
    });
  }

  function clearHistory() {
    setHistoryItems([]);
    localStorage.removeItem(HISTORY_STORAGE_KEY);
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <h1>Cinema Compass</h1>
        <p className="hero-subtitle">
          Answer a few questions and discover your next watch instantly.
        </p>
      </header>

      <main className="main-panel">
        {loading ? (
          <div className="status-box">Loading quiz...</div>
        ) : null}

        {!loading && error ? <div className="status-box error">{error}</div> : null}

        {!loading && !result && displayedQuestion ? (
          <section className="quiz-card">
            <div className="quiz-top-row">
              <span>
                Question {currentIndex + 1} of {totalQuestions}
              </span>
              <span>{progress}%</span>
            </div>

            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            <h2>{displayedQuestion.title}</h2>

            <div className="options-grid">
              {displayedQuestion.options.map((option) => {
                const active = selectedOption === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    className={`option-chip ${active ? "active" : ""}`}
                    onClick={() => chooseOption(option.id)}
                  >
                    {option.text}
                  </button>
                );
              })}
            </div>

            <div className="actions-row">
              <button
                type="button"
                className="ghost-btn"
                onClick={goBack}
                disabled={currentIndex === 0}
              >
                Previous
              </button>

              <button
                type="button"
                className="primary-btn"
                onClick={goNext}
                disabled={!hasValidSelection || submitting}
              >
                {currentIndex === totalQuestions - 1
                  ? submitting
                    ? "Getting recommendation..."
                    : "See my recommendation"
                  : "Next"}
              </button>
            </div>
          </section>
        ) : null}

        {!loading && result ? (
          <section className="result-panel">
            <div className="result-banner">
              <p>Your recommendation type</p>
              <h2>{result.movieType}</h2>
              {result.backupType ? (
                <p className="backup">Backup vibe: {result.backupType}</p>
              ) : null}
              <p className="source-note">
                Source: {result.source === "tmdb" ? "TMDB API" : "Offline fallback list"}
              </p>
              {result.recommendationReason ? (
                <p className="reason-note">{result.recommendationReason}</p>
              ) : null}
              {result.constraintNotice ? (
                <p className="constraint-note">{result.constraintNotice}</p>
              ) : null}
              {result.appliedPreferences ? (
                <div className="preference-pills">
                  <span>{mediaPreferenceLabel}</span>
                  <span>{result.appliedPreferences.language}</span>
                  <span>{result.appliedPreferences.runtime} runtime</span>
                  <span>{result.appliedPreferences.era} era</span>
                  {(result.appliedPreferences.tags || []).map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="result-actions-row">
              <p className="result-help-note">
                Showing top {rankedMovies.length} precise matches. Use Like/Dislike to rerank by taste.
              </p>
              <button
                type="button"
                className="ghost-btn reset-rerank-btn"
                onClick={() => setFeedbackByMovie({})}
              >
                Reset rerank
              </button>
            </div>

            <div className="movie-grid">
              {rankedMovies.map((movie, index) => (
                <article
                  key={movie.id}
                  className="movie-card"
                  style={{ animationDelay: `${index * 80}ms` }}
                >
                  {getPosterUrl(movie.posterPath) ? (
                    <img
                      className="poster"
                      src={getPosterUrl(movie.posterPath)}
                      alt={`${movie.title} poster`}
                      loading="lazy"
                    />
                  ) : (
                    <div className="poster placeholder">No Poster</div>
                  )}

                  <div className="movie-content">
                    <h3>{movie.title}</h3>
                    <p className="meta">
                      {formatDate(movie.releaseDate)} | Rating {movie.rating ?? "N/A"}
                    </p>
                    <p>{movie.overview || "No description available."}</p>
                    <div className="feedback-row">
                      <button
                        type="button"
                        className={`tiny-btn ${
                          feedbackByMovie[String(movie.id)] === "like" ? "active-like" : ""
                        }`}
                        onClick={() => updateMovieFeedback(movie.id, "like")}
                      >
                        Like
                      </button>
                      <button
                        type="button"
                        className={`tiny-btn ${
                          feedbackByMovie[String(movie.id)] === "dislike"
                            ? "active-dislike"
                            : ""
                        }`}
                        onClick={() => updateMovieFeedback(movie.id, "dislike")}
                      >
                        Dislike
                      </button>
                    </div>
                    {movie.tmdbUrl ? (
                      <a href={movie.tmdbUrl} target="_blank" rel="noreferrer">
                        Open details
                      </a>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>

            <button type="button" className="primary-btn restart" onClick={restart}>
              Retake quiz
            </button>
          </section>
        ) : null}

        {historyItems.length ? (
          <section className="history-panel">
            <div className="history-top-row">
              <h3>Recent recommendation history</h3>
              <button
                type="button"
                className="ghost-btn clear-history-btn"
                onClick={clearHistory}
              >
                Clear history
              </button>
            </div>

            <div className="history-list">
              {historyItems.map((item) => (
                <article key={item.id} className="history-item">
                  <p>
                    <strong>{item.movieType}</strong> | {item.media} | {item.topMovie}
                  </p>
                  <p className="history-meta">
                    {new Date(item.time).toLocaleString()} | Source: {item.source}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
