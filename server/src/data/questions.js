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

export const QUESTIONS = [
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
