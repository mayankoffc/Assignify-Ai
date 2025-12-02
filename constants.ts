
import { QuestionSolution } from './types';

export const AI_SYSTEM_PROMPT = `
You are a Physics Topper Student. Your task is to solve physics problems from an image/PDF.
Output the solutions in a strictly structured JSON format.

RULES FOR FORMATTING:
1. Use simple, direct language like a student.
2. Use "Sol:", "Given:", "Step 1:", "Ans:" structure.
3. For Fractions, use ONLY this syntax: FRAC[numerator|denominator]
4. For Square Roots, use ONLY this syntax: SQRT[content]
5. For mistakes (simulate a student), use: STRIKE[wrong_word] then write the correct one.
6. For Diagrams: 
   - If it's a simple graph or schema, use: DIAGRAM[TYPE] (e.g., DIAGRAM[STRESS_STRAIN], DIAGRAM[LENS_RAY]).
   - If it's a complex realistic illustration (like a detailed planet, molecule 3D model, or instrument), use: GENAI_IMAGE[description of image].
7. Do not use LaTeX. Use the custom tags above.

JSON SCHEMA:
[
  {
    "id": number,
    "questionNumber": "Q1. (A)",
    "questionText": "Short summary of question...",
    "steps": ["Line 1", "Line 2", "Line 3"...]
  }
]
`;

export const FALLBACK_SOLUTIONS: QuestionSolution[] = [
  {
    id: 1,
    questionNumber: "Q1. (A)",
    questionText: "Hooke's Law & Modulus of Elasticity",
    steps: [
      "Sol:",
      "Hooke's Law states that within the STRIKE[plastic] elastic limit, stress is directly proportional to strain.",
      "Stress ∝ Strain",
      "Stress = E × Strain",
      "OR",
      "E = FRAC[Stress|Strain]",
      "DIAGRAM[Q1_GRAPH]",
      "Where 'E' is the Modulus of Elasticity.",
      "",
      "Can one modulus explain all behaviors?",
      "No. Different types of strain require different moduli:",
      "1. Young's Modulus (Y): For length change.",
      "   Y = FRAC[Longitudinal Stress|Longitudinal Strain]",
      "",
      "2. Shear Modulus (G): For shape change.",
      "   G = FRAC[Shear Stress|Shear Strain]",
      "",
      "3. Bulk Modulus (B): For volume STRIKE[stress] change.",
      "   B = FRAC[Volumetric Stress|Volumetric Strain]",
      "",
      "Conclusion: Each type of deformation corresponds to a unique modulus."
    ]
  },
  {
    id: 2,
    questionNumber: "Q2. (A)",
    questionText: "Thermodynamics of He Molecule",
    steps: [
      "Sol:",
      "Given: Helium (He) is a monoatomic gas.",
      "Temperature (T) = 300 K",
      "Boltzmann Constant (k) = 1.38 × 10⁻²³ J/K",
      "GENAI_IMAGE[A realistic scientific illustration of a Helium atom model with electrons orbiting]",
      "(i) Degrees of Freedom (f):",
      "    For monoatomic gas, f = 3 (translational only).",
      "",
      "(ii) Specific Heat Capacities:",
      "    Cv = FRAC[3|2] R  = 1.5 R",
      "    Cp = (1 + FRAC[f|2]) R = FRAC[5|2] R = 2.5 R",
      "",
      "(iii) Total Energy (E) per molecule:",
      "    Average Kinetic Energy is given by:",
      "    E = FRAC[3|2] kT",
      "    E = 1.5 × (1.38 × 10⁻²³) × 300",
      "    E = STRIKE[4.5] 1.5 × 4.14 × 10⁻²¹",
      "    E = 6.21 × 10⁻²¹ J",
      "",
      "Ans: f = 3, Cp = 2.5R, Cv = 1.5R, E = 6.21 × 10⁻²¹ J"
    ]
  }
];
