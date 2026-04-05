export const GENRES = {
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

export const LANGUAGE_LABELS = {
  any: "No language preference",
  en: "English",
  hi: "Hindi",
  ko: "Korean",
  ja: "Japanese",
  es: "Spanish"
};

export const PREFERENCE_TAG_LABELS = {
  motorsport: "Motorsport",
  sports: "Sports",
  cars: "Racing Cars",
  superhero: "Superhero",
  detective: "Detective Mystery",
  mindgame: "Mind Game",
  trueStory: "True Story",
  feelgood: "Feel-Good",
  dark: "Dark Intense",
  anime: "Anime",
  family: "Family Friendly",
  inspiring: "Inspiring"
};

export const QUESTIONS = [
  {
    id: "mood",
    title: "How are you feeling right now?",
    options: [
      {
        id: "energetic",
        text: "Energetic and pumped",
        weights: { action: 3, adventure: 2, thriller: 1 },
        tags: ["sports", "cars"]
      },
      {
        id: "cheerful",
        text: "Cheerful and playful",
        weights: { comedy: 3, family: 2, animation: 2 },
        tags: ["feelgood", "family"]
      },
      {
        id: "emotional",
        text: "Emotional and reflective",
        weights: { drama: 3, romance: 2 },
        tags: ["inspiring"]
      },
      {
        id: "curious",
        text: "Curious and thoughtful",
        weights: { mystery: 2, scienceFiction: 3, fantasy: 2 },
        tags: ["mindgame", "detective"]
      },
      {
        id: "dark",
        text: "In the mood for something intense",
        weights: { thriller: 2, horror: 3, crime: 2 },
        tags: ["dark"]
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
        weights: { action: 3, thriller: 2, adventure: 2 },
        runtime: "short"
      },
      {
        id: "balanced",
        text: "Balanced storytelling",
        weights: { drama: 2, mystery: 2, comedy: 1 },
        runtime: "medium"
      },
      {
        id: "slow",
        text: "Slow and deep",
        weights: { drama: 3, romance: 2, fantasy: 1 },
        runtime: "long"
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
        weights: { mystery: 2, thriller: 2, scienceFiction: 2 },
        tags: ["mindgame"]
      },
      {
        id: "friends",
        text: "Friends",
        weights: { comedy: 3, action: 2, adventure: 2 },
        tags: ["sports", "feelgood"]
      },
      {
        id: "family",
        text: "Family",
        weights: { family: 3, animation: 3, fantasy: 2 },
        tags: ["family", "feelgood"]
      },
      {
        id: "partner",
        text: "Partner",
        weights: { romance: 3, drama: 2, comedy: 1 },
        tags: ["feelgood"]
      }
    ]
  },
  {
    id: "focus",
    title: "What are you most excited to watch today?",
    options: [
      {
        id: "motorsport",
        text: "Motorsport and racing",
        weights: { action: 3, drama: 2, adventure: 1 },
        tags: ["motorsport", "cars"]
      },
      {
        id: "superhero",
        text: "Superhero and comic style",
        weights: { action: 3, scienceFiction: 2, adventure: 1 },
        tags: ["superhero"]
      },
      {
        id: "mystery",
        text: "Mystery and detective plots",
        weights: { mystery: 3, crime: 2, thriller: 2 },
        tags: ["detective", "mindgame"]
      },
      {
        id: "inspiring",
        text: "Inspiring true stories",
        weights: { drama: 3, family: 1, romance: 1 },
        tags: ["inspiring", "trueStory"]
      },
      {
        id: "feelgood",
        text: "Feel-good comedy and light fun",
        weights: { comedy: 3, family: 2, romance: 1 },
        tags: ["feelgood", "family"]
      },
      {
        id: "scifi",
        text: "Sci-fi and futuristic adventure",
        weights: { scienceFiction: 3, adventure: 2, action: 1 },
        tags: ["mindgame"]
      },
      {
        id: "horror",
        text: "Horror and intense thrill",
        weights: { horror: 3, thriller: 2, mystery: 1 },
        tags: ["dark"]
      }
    ]
  },
  {
    id: "language",
    title: "Preferred movie language",
    options: [
      {
        id: "english",
        text: "English",
        weights: { action: 1, drama: 1 },
        language: "en"
      },
      {
        id: "hindi",
        text: "Hindi",
        weights: { drama: 1, romance: 1, family: 1 },
        language: "hi"
      },
      {
        id: "korean",
        text: "Korean",
        weights: { thriller: 1, drama: 1, mystery: 1 },
        language: "ko"
      },
      {
        id: "japanese",
        text: "Japanese",
        weights: { animation: 2, fantasy: 1 },
        language: "ja",
        tags: ["anime"]
      },
      {
        id: "spanish",
        text: "Spanish",
        weights: { thriller: 1, drama: 1 },
        language: "es"
      },
      {
        id: "any",
        text: "No preference",
        weights: { comedy: 1 },
        language: "any"
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
        weights: { drama: 3, crime: 2, thriller: 1 },
        tags: ["trueStory"]
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
        weights: { horror: 3, mystery: 2, thriller: 1 },
        tags: ["dark"]
      }
    ]
  },
  {
    id: "length",
    title: "How long can you watch right now?",
    options: [
      {
        id: "quick",
        text: "Around 90 to 110 minutes",
        weights: { thriller: 1, comedy: 1, animation: 1 },
        runtime: "short"
      },
      {
        id: "normal",
        text: "Around 2 hours",
        weights: { action: 1, drama: 1, mystery: 1 },
        runtime: "medium"
      },
      {
        id: "long",
        text: "Long immersive experience",
        weights: { drama: 2, fantasy: 1, scienceFiction: 1 },
        runtime: "long"
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
        weights: { comedy: 2, family: 2, romance: 2 },
        tags: ["feelgood"]
      },
      {
        id: "twist",
        text: "Unexpected twist",
        weights: { mystery: 3, thriller: 2, crime: 1 },
        tags: ["mindgame"]
      },
      {
        id: "heavy",
        text: "Powerful and emotional",
        weights: { drama: 3, romance: 1, crime: 1 },
        tags: ["inspiring"]
      },
      {
        id: "fright",
        text: "Scary and intense",
        weights: { horror: 3, thriller: 2 },
        tags: ["dark"]
      }
    ]
  },
  {
    id: "era",
    title: "Pick a release period",
    options: [
      {
        id: "latest",
        text: "Latest (2020 and newer)",
        weights: { action: 1, scienceFiction: 1 },
        era: "latest"
      },
      {
        id: "modern",
        text: "Modern classics (2005-2019)",
        weights: { drama: 1, action: 1, mystery: 1 },
        era: "modern"
      },
      {
        id: "classic",
        text: "Old classics (before 2005)",
        weights: { drama: 2, romance: 1 },
        era: "classic"
      }
    ]
  }
];

export function getPublicQuestions() {
  return QUESTIONS.map((question) => ({
    id: question.id,
    title: question.title,
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text
    }))
  }));
}
