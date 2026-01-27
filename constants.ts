export const HANDWRITING_STYLE_PROMPT = `
You are a handwriting style analyzer. Based on the user's description of how they want their handwriting to look, generate a JSON object with numerical style parameters.

User will describe things like: "neat and clean", "messy student writing", "cursive and elegant", "quick notes style", etc.

Output ONLY valid JSON with these parameters (all values between 0 and 1):
{
  "slant": 0.5,        // 0 = upright, 1 = heavily slanted right
  "spacing": 0.5,      // 0 = tight letters, 1 = wide spacing
  "size": 0.5,         // 0 = small, 1 = large
  "pressure": 0.5,     // 0 = light/thin, 1 = heavy/bold
  "messiness": 0.3,    // 0 = very neat, 1 = very messy
  "fontMix": ["Caveat", "Cedarville Cursive"]  // fonts to use
}

Available fonts: "Caveat", "Cedarville Cursive", "Shadows Into Light"

Interpret the user's style request and adjust parameters accordingly.
`;

export const DEFAULT_STYLE: {
  slant: number;
  spacing: number;
  size: number;
  pressure: number;
  messiness: number;
  fontMix: string[];
} = {
  slant: 0.3,
  spacing: 0.5,
  size: 0.5,
  pressure: 0.5,
  messiness: 0.25,
  fontMix: ["Caveat", "Cedarville Cursive", "Shadows Into Light"]
};

export const OCR_CONFIG = {
  PDF_SCALE: 2.0,
  SUPPORTED_FORMATS: ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'],
  MAX_FILE_SIZE_MB: 50,
};

export const FALLBACK_SOLUTIONS = [
  {
    questionText: "Sample Question 1: What is the quadratic formula?",
    steps: [
      "Sol:",
      "The quadratic formula is used to solve equations of the form ax² + bx + c = 0",
      "",
      "The formula is:",
      "x = (-b ± √(b² - 4ac)) / 2a",
      "",
      "Where:",
      "• a = coefficient of x²",
      "• b = coefficient of x",
      "• c = constant term",
      "",
      "The discriminant (b² - 4ac) determines the nature of roots:",
      "• If > 0: Two distinct real roots",
      "• If = 0: One repeated real root",
      "• If < 0: Two complex conjugate roots"
    ]
  },
  {
    questionText: "Sample Question 2: Explain photosynthesis",
    steps: [
      "Sol:",
      "Photosynthesis is the process by which plants convert light energy into chemical energy.",
      "",
      "The overall equation:",
      "6CO₂ + 6H₂O + Light Energy → C₆H₁₂O₆ + 6O₂",
      "",
      "Key steps:",
      "1. Light-dependent reactions occur in thylakoid membranes",
      "2. ATP and NADPH are produced",
      "3. Calvin cycle fixes CO₂ into glucose",
      "4. Oxygen is released as a byproduct",
      "",
      "Factors affecting rate:",
      "• Light intensity",
      "• CO₂ concentration",
      "• Temperature"
    ]
  }
];
