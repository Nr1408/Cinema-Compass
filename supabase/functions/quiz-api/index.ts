// @ts-nocheck
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

type GenreMap = Record<string, { id: number; label: string }>;
type Question = {
  id: string;
  title: string;
  options: Array<{
    id: string;
    text: string;
    weights: Record<string, number>;
  }>;
};

type Movie = {
  id: string | number;
  title: string;
  overview: string;
  posterPath: string;
  releaseDate: string;
  rating: number;
  tmdbUrl: string;
};

const GENRES: GenreMap = {
  action: { id: 28, label: "Action" },
  adventure: { id: 12, label: "Adventure" },
  animation: { id: 16, label: "Animation" },
  comedy: { id: 35, label: "Comedy" },
  crime: { id: 80, label: "Crime" },
  drama: { id: 18, label: "Drama" },
  family: { id: 10751, label: "Family" },
  fantasy: { id: 14, label: "Fantasy" },
  horror: { id: 27, label: "Horror" },
  mystery: { id: 9648, label: "Mystery" },
  romance: { id: 10749, label: "Romance" },
  scienceFiction: { id: 878, label: "Science Fiction" },
  thriller: { id: 53, label: "Thriller" }
};

const QUESTIONS: Question[] = [
  {
    id: "mood",
    title: "How are you feeling right now?",
    options: [
      {
        id: "energetic",
        text: "Energetic and pumped",
        weights: { action: 3, adventure: 2, thriller: 1 }
      },
      {
        id: "cheerful",
        text: "Cheerful and playful",
        weights: { comedy: 3, family: 2, animation: 2 }
      },
      {
        id: "emotional",
        text: "Emotional and reflective",
        weights: { drama: 3, romance: 2 }
      },
      {
        id: "curious",
        text: "Curious and thoughtful",
        weights: { mystery: 2, scienceFiction: 3, fantasy: 2 }
      },
      {
        id: "dark",
        text: "In the mood for something intense",
        weights: { thriller: 2, horror: 3, crime: 2 }
      }
    ]
  },
  {
    id: "pace",
    title: "What pace do you want?",
    options: [
      {
        id: "fast",
        text: "Fast and thrilling",
        weights: { action: 3, thriller: 2, adventure: 2 }
      },
      {
        id: "balanced",
        text: "Balanced storytelling",
        weights: { drama: 2, mystery: 2, comedy: 1 }
      },
      {
        id: "slow",
        text: "Slow and deep",
        weights: { drama: 3, romance: 2, fantasy: 1 }
      }
    ]
  },
  {
    id: "company",
    title: "Who are you watching with?",
    options: [
      {
        id: "solo",
        text: "Just me",
        weights: { mystery: 2, thriller: 2, scienceFiction: 2 }
      },
      {
        id: "friends",
        text: "Friends",
        weights: { comedy: 3, action: 2, adventure: 2 }
      },
      {
        id: "family",
        text: "Family",
        weights: { family: 3, animation: 3, fantasy: 2 }
      },
      {
        id: "partner",
        text: "Partner",
        weights: { romance: 3, drama: 2, comedy: 1 }
      }
    ]
  },
  {
    id: "world",
    title: "Pick the world you want to enter",
    options: [
      {
        id: "real",
        text: "Realistic world",
        weights: { drama: 3, crime: 2, thriller: 1 }
      },
      {
        id: "epic",
        text: "Epic and adventurous",
        weights: { adventure: 3, fantasy: 2, action: 2 }
      },
      {
        id: "futuristic",
        text: "Future and technology",
        weights: { scienceFiction: 3, action: 1, mystery: 1 }
      },
      {
        id: "spooky",
        text: "Dark and spooky",
        weights: { horror: 3, mystery: 2, thriller: 1 }
      }
    ]
  },
  {
    id: "ending",
    title: "What ending style do you prefer?",
    options: [
      {
        id: "feelgood",
        text: "Happy and feel-good",
        weights: { comedy: 2, family: 2, romance: 2 }
      },
      {
        id: "twist",
        text: "Unexpected twist",
        weights: { mystery: 3, thriller: 2, crime: 1 }
      },
      {
        id: "heavy",
        text: "Powerful and emotional",
        weights: { drama: 3, romance: 1, crime: 1 }
      },
      {
        id: "fright",
        text: "Scary and intense",
        weights: { horror: 3, thriller: 2 }
      }
    ]
  }
];

const FALLBACK_MOVIES_BY_GENRE: Record<string, Movie[]> = {
  action: [
    {
      id: "fb-action-1",
      title: "Mad Max: Fury Road",
      overview:
        "In a post-apocalyptic wasteland, Max teams up with Furiosa in a high-speed escape.",
      posterPath: "/hA2ple9q4qnwxp3hKVNhroipsir.jpg",
      releaseDate: "2015-05-13",
      rating: 7.6,
      tmdbUrl: "https://www.themoviedb.org/movie/76341"
    },
    {
      id: "fb-action-2",
      title: "John Wick",
      overview:
        "A retired hitman seeks vengeance after gangsters take away everything he loved.",
      posterPath: "/fZPSd91yGE9fCcCe6OoQr6E3Bev.jpg",
      releaseDate: "2014-10-22",
      rating: 7.4,
      tmdbUrl: "https://www.themoviedb.org/movie/245891"
    }
  ],
  comedy: [
    {
      id: "fb-comedy-1",
      title: "The Grand Budapest Hotel",
      overview:
        "A legendary concierge and his lobby boy are caught in a wildly funny adventure.",
      posterPath: "/eWdyYQreja6JGCzqHWXpWHDrrPo.jpg",
      releaseDate: "2014-02-26",
      rating: 8,
      tmdbUrl: "https://www.themoviedb.org/movie/120467"
    },
    {
      id: "fb-comedy-2",
      title: "Free Guy",
      overview:
        "A bank teller discovers he is actually an NPC inside an open-world video game.",
      posterPath: "/xmbU4JTUm8rsdtn7Y3Fcm30GpeT.jpg",
      releaseDate: "2021-08-11",
      rating: 7.5,
      tmdbUrl: "https://www.themoviedb.org/movie/550988"
    }
  ],
  drama: [
    {
      id: "fb-drama-1",
      title: "The Pursuit of Happyness",
      overview:
        "A struggling salesman fights to build a better life for himself and his son.",
      posterPath: "/f6l9rghX8PjL1f9L8T8fNQ9fBfR.jpg",
      releaseDate: "2006-12-14",
      rating: 7.9,
      tmdbUrl: "https://www.themoviedb.org/movie/1402"
    },
    {
      id: "fb-drama-2",
      title: "The Shawshank Redemption",
      overview:
        "Two imprisoned men form a profound friendship over years of hardship.",
      posterPath: "/q6y0Go1tsGEsmtFryDOJo3dEmqu.jpg",
      releaseDate: "1994-09-23",
      rating: 8.7,
      tmdbUrl: "https://www.themoviedb.org/movie/278"
    }
  ],
  romance: [
    {
      id: "fb-romance-1",
      title: "La La Land",
      overview:
        "A jazz musician and an aspiring actress fall in love while chasing big dreams.",
      posterPath: "/uDO8zWDhfWwoFdKS4fzkUJt0Rf0.jpg",
      releaseDate: "2016-11-29",
      rating: 7.9,
      tmdbUrl: "https://www.themoviedb.org/movie/313369"
    },
    {
      id: "fb-romance-2",
      title: "The Notebook",
      overview:
        "A timeless love story told through memory, distance, and devotion.",
      posterPath: "/rNzQyW4f8B8cQeg7Dgj3n6eT5k9.jpg",
      releaseDate: "2004-06-25",
      rating: 7.9,
      tmdbUrl: "https://www.themoviedb.org/movie/11036"
    }
  ],
  horror: [
    {
      id: "fb-horror-1",
      title: "A Quiet Place",
      overview:
        "A family must live in silence while hiding from deadly creatures that hunt by sound.",
      posterPath: "/nAU74GmpUk7t5iklEp3bufwDq4n.jpg",
      releaseDate: "2018-04-03",
      rating: 7.4,
      tmdbUrl: "https://www.themoviedb.org/movie/447332"
    },
    {
      id: "fb-horror-2",
      title: "The Conjuring",
      overview:
        "Paranormal investigators help a family terrorized by a dark presence.",
      posterPath: "/wVYREutTvI2tmxr6ujrHT704wGF.jpg",
      releaseDate: "2013-07-18",
      rating: 7.5,
      tmdbUrl: "https://www.themoviedb.org/movie/138843"
    }
  ],
  scienceFiction: [
    {
      id: "fb-sf-1",
      title: "Interstellar",
      overview:
        "A team of explorers travel through a wormhole in space in an attempt to save humanity.",
      posterPath: "/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg",
      releaseDate: "2014-11-05",
      rating: 8.4,
      tmdbUrl: "https://www.themoviedb.org/movie/157336"
    },
    {
      id: "fb-sf-2",
      title: "The Martian",
      overview:
        "An astronaut becomes stranded on Mars and must survive using science and grit.",
      posterPath: "/5aGhaIHYuQbqlHWvWYqMCnj40y2.jpg",
      releaseDate: "2015-09-30",
      rating: 7.7,
      tmdbUrl: "https://www.themoviedb.org/movie/286217"
    }
  ],
  default: [
    {
      id: "fb-default-1",
      title: "Inception",
      overview:
        "A skilled thief enters dreams to steal secrets but receives one impossible mission.",
      posterPath: "/oYuLEt3zVCKq57qu2F8dT7NIa6f.jpg",
      releaseDate: "2010-07-15",
      rating: 8.4,
      tmdbUrl: "https://www.themoviedb.org/movie/27205"
    },
    {
      id: "fb-default-2",
      title: "Spider-Man: Into the Spider-Verse",
      overview:
        "Miles Morales becomes Spider-Man and joins heroes from parallel dimensions.",
      posterPath: "/iiZZdoQBEYBv6id8su7ImL0oCbD.jpg",
      releaseDate: "2018-12-06",
      rating: 8.4,
      tmdbUrl: "https://www.themoviedb.org/movie/324857"
    }
  ]
};

const OPTION_LOOKUP = new Map<string, Question["options"][number]>();

for (const question of QUESTIONS) {
  for (const option of question.options) {
    OPTION_LOOKUP.set(`${question.id}:${option.id}`, option);
  }
}

function getCorsHeaders(origin: string | null) {
  const configuredOrigins = Deno.env.get("CORS_ORIGIN") || "*";

  if (configuredOrigins === "*") {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    };
  }

  const allowList = configuredOrigins
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const selectedOrigin =
    origin && allowList.includes(origin) ? origin : allowList[0] || "*";

  return {
    "Access-Control-Allow-Origin": selectedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
  };
}

function jsonResponse(data: unknown, status = 200, corsHeaders: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json"
    }
  });
}

function getPublicQuestions() {
  return QUESTIONS.map((question) => ({
    id: question.id,
    title: question.title,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text
    }))
  }));
}

function createInitialScores() {
  return Object.keys(GENRES).reduce<Record<string, number>>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {});
}

function scoreAnswers(answers: Record<string, string>) {
  const scores = createInitialScores();

  for (const [questionId, optionId] of Object.entries(answers || {})) {
    const option = OPTION_LOOKUP.get(`${questionId}:${optionId}`);
    if (!option) {
      continue;
    }

    for (const [genreKey, weight] of Object.entries(option.weights)) {
      scores[genreKey] = (scores[genreKey] || 0) + Number(weight || 0);
    }
  }

  return scores;
}

function selectTopGenres(scores: Record<string, number>) {
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);

  if (!ranked.length || ranked[0][1] <= 0) {
    return ["comedy", "drama"];
  }

  return [ranked[0][0], ranked[1] ? ranked[1][0] : null] as [string, string | null];
}

function mapTmdbMovie(movie: Record<string, unknown>) {
  return {
    id: movie.id as number,
    title: (movie.title as string) || "Unknown",
    overview: (movie.overview as string) || "",
    posterPath: (movie.poster_path as string) || "",
    releaseDate: (movie.release_date as string) || "",
    rating: Number(movie.vote_average || 0),
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`
  } satisfies Movie;
}

async function fetchMoviesFromTmdb(primaryGenreId: number, secondaryGenreId: number | null) {
  const apiKey = Deno.env.get("TMDB_API_KEY");

  if (!apiKey) {
    return { source: "fallback", movies: [] as Movie[] };
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    include_adult: "false",
    include_video: "false",
    language: "en-US",
    sort_by: "popularity.desc",
    page: "1",
    vote_count_gte: "120",
    with_genres: [primaryGenreId, secondaryGenreId].filter(Boolean).join(",")
  });

  const response = await fetch(`https://api.themoviedb.org/3/discover/movie?${params.toString()}`,
    {
      headers: {
        Accept: "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(`TMDB request failed with status ${response.status}`);
  }

  const data = await response.json();
  const movies = Array.isArray(data.results)
    ? data.results.slice(0, 8).map(mapTmdbMovie)
    : [];

  return {
    source: "tmdb",
    movies
  };
}

async function recommendFromAnswers(answers: Record<string, string>) {
  const scores = scoreAnswers(answers || {});
  const [primaryKey, secondaryKey] = selectTopGenres(scores);

  const primaryGenre = GENRES[primaryKey];
  const secondaryGenre = secondaryKey ? GENRES[secondaryKey] : null;

  let source = "fallback";
  let movies: Movie[] = [];

  try {
    const tmdbResponse = await fetchMoviesFromTmdb(
      primaryGenre.id,
      secondaryGenre ? secondaryGenre.id : null
    );
    source = tmdbResponse.source;
    movies = tmdbResponse.movies;
  } catch {
    source = "fallback";
  }

  if (!movies.length) {
    movies =
      FALLBACK_MOVIES_BY_GENRE[primaryKey] ||
      FALLBACK_MOVIES_BY_GENRE.default ||
      [];
    source = "fallback";
  }

  return {
    movieType: primaryGenre.label,
    backupType: secondaryGenre ? secondaryGenre.label : null,
    source,
    movies: movies.slice(0, 8)
  };
}

function resolveRoute(requestUrl: URL) {
  const routeFromQuery = requestUrl.searchParams.get("route");
  if (routeFromQuery) {
    return routeFromQuery;
  }

  const parts = requestUrl.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "questions";
}

serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const route = resolveRoute(url);

  if (req.method === "GET" && (route === "health" || route === "quiz-api")) {
    return jsonResponse({ status: "ok" }, 200, corsHeaders);
  }

  if (req.method === "GET" && route === "questions") {
    return jsonResponse({ questions: getPublicQuestions() }, 200, corsHeaders);
  }

  if (req.method === "POST" && route === "recommend") {
    try {
      const payload = await req.json();
      const answers = payload?.answers;

      if (!answers || typeof answers !== "object") {
        return jsonResponse(
          { error: "answers must be an object with question ids as keys" },
          400,
          corsHeaders
        );
      }

      const recommendation = await recommendFromAnswers(answers as Record<string, string>);
      return jsonResponse(recommendation, 200, corsHeaders);
    } catch {
      return jsonResponse({ error: "Invalid JSON payload" }, 400, corsHeaders);
    }
  }

  return jsonResponse(
    { error: "Route not found. Use route=questions or route=recommend" },
    404,
    corsHeaders
  );
});
