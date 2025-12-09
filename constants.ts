export const HANDWRITING_STYLE_PROMPT = `
You are a handwriting style analyzer. Based on the user's description of how they want their handwriting to look, generate a JSON object with numerical style parameters.

User will describe things like: "neat and clean", "messy student writing", "cursive and elegant", "quick notes style", "blue ink", "black ballpoint", etc.

Output ONLY valid JSON with these parameters:
{
  "slant": 0.0,        // -1 (left) to 1 (right)
  "spacing": 1.0,      // 0.8 to 1.5 multiplier
  "size": 1.0,         // 0.8 to 1.2 multiplier
  "weight": 1.0,       // 0.5 (thin) to 2.0 (bold)
  "messiness": 0.3,    // 0 (neat) to 1 (messy)
  "fontFamily": "Caveat", // Choose one: "Caveat", "Cedarville Cursive", "Zeyada", "La Belle Aurore", "Indie Flower", "Shadows Into Light"
  "color": "#000000"   // Hex code for ink color (e.g., #0a2472 for blue, #000000 for black)
}

**Font Guide:**
- "Caveat": Standard neat handwriting.
- "Cedarville Cursive": Authentic, slightly messy cursive.
- "Zeyada": Very messy, scribbly cursive.
- "La Belle Aurore": Tall, elegant, slightly messy cursive.
- "Indie Flower": Bubbly, neat, rounded.
- "Shadows Into Light": Neat, upright, print-style.

Choose the font that best matches the description.
`;

export const LAYOUT_ANALYSIS_PROMPT = `
You are a document layout analyzer.
Your task is to extract content from the provided image so it can be reconstructed as a handwritten document.

Identify two types of regions:
1. "text_regions": Blocks of text that should be converted to handwriting.
2. "image_regions": Diagrams, illustrations, photos, graphs, or complex equations that cannot be easily written as text. These should be preserved as images.

Output a JSON object with a "regions" key, containing a list of objects.
Each object must have:
- "type": "text" or "image"
- "content":
    - For "text": The exact string content. Use \n for line breaks.
    - For "image": A short description (e.g., "circuit diagram").
- "box": A bounding box object { "ymin": number, "xmin": number, "ymax": number, "xmax": number }
  **Coordinates must be normalized to a 0-1000 scale** (0 is top/left, 1000 is bottom/right).

Guidelines:
- Group paragraphs together.
- For "image" regions, the box should tightly enclose the visual element.
- Ignore page numbers, headers, or footers if they are irrelevant to the assignment content.
- Do NOT include markdown formatting. Return RAW JSON.
`;

export const DEFAULT_STYLE = {
  slant: 0,
  spacing: 1,
  size: 1,
  weight: 1,
  messiness: 0.2,
  fontFamily: "Caveat",
  color: "#0a2472"
};
