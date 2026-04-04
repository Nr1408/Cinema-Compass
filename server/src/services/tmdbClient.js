const TMDB_BASE_URL = "https://api.themoviedb.org/3";

function mapTmdbMovie(movie) {
  return {
    id: movie.id,
    title: movie.title,
    overview: movie.overview,
    posterPath: movie.poster_path,
    releaseDate: movie.release_date,
    rating: movie.vote_average,
    tmdbUrl: `https://www.themoviedb.org/movie/${movie.id}`
  };
}

export async function fetchMoviesFromTmdb({ primaryGenreId, secondaryGenreId }) {
  const apiKey = process.env.TMDB_API_KEY;

  if (!apiKey) {
    return { source: "fallback", movies: [] };
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

  const url = `${TMDB_BASE_URL}/discover/movie?${params.toString()}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json"
    }
  });

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
