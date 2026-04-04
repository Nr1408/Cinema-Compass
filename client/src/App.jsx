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

  const currentQuestion = questions[currentIndex] || null;
  const totalQuestions = questions.length;
  const selectedOption = currentQuestion ? answers[currentQuestion.id] : null;

  const progress = useMemo(() => {
    if (!totalQuestions) {
      return 0;
    }
    return Math.round(((currentIndex + 1) / totalQuestions) * 100);
  }, [currentIndex, totalQuestions]);

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

  function chooseOption(optionId) {
    if (!currentQuestion) {
      return;
    }

    setAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: optionId
    }));
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
    } catch (submitError) {
      console.error(submitError);
      setError("Could not generate recommendation. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function goNext() {
    if (!selectedOption) {
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
  }

  return (
    <div className="page-shell">
      <header className="hero">
        <p className="hero-tag">College Project</p>
        <h1>Cinema Compass</h1>
        <p className="hero-subtitle">
          Answer a few questions and discover your movie type instantly.
        </p>
      </header>

      <main className="main-panel">
        {loading ? (
          <div className="status-box">Loading quiz...</div>
        ) : null}

        {!loading && error ? <div className="status-box error">{error}</div> : null}

        {!loading && !result && currentQuestion ? (
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

            <h2>{currentQuestion.title}</h2>

            <div className="options-grid">
              {currentQuestion.options.map((option) => {
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
                disabled={!selectedOption || submitting}
              >
                {currentIndex === totalQuestions - 1
                  ? submitting
                    ? "Getting recommendation..."
                    : "See my movie type"
                  : "Next"}
              </button>
            </div>
          </section>
        ) : null}

        {!loading && result ? (
          <section className="result-panel">
            <div className="result-banner">
              <p>Your movie type</p>
              <h2>{result.movieType}</h2>
              {result.backupType ? (
                <p className="backup">Backup vibe: {result.backupType}</p>
              ) : null}
              <p className="source-note">
                Source: {result.source === "tmdb" ? "TMDB API" : "Offline fallback list"}
              </p>
            </div>

            <div className="movie-grid">
              {(result.movies || []).map((movie, index) => (
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
      </main>
    </div>
  );
}
