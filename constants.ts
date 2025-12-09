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
  "fontFamily": "Caveat", // "Caveat", "Cedarville Cursive", "Shadows Into Light", "Homemade Apple"
  "color": "#000000"   // Hex code for ink color (e.g., #0a2472 for blue, #000000 for black)
}

Choose the font that best matches the description.
`;

export const LAYOUT_ANALYSIS_PROMPT = `
You are a document layout analyzer.
Your task is to extract text from the provided image and identify the bounding boxes for each text block so they can be replaced with handwritten text.

Output a JSON object with a "regions" key, containing a list of objects.
Each object should have:
- "text": The exact text content of the block. Use \n for line breaks within the block.
- "box": A bounding box object { "ymin": number, "xmin": number, "ymax": number, "xmax": number } where coordinates are normalized to 0-1000 scale (0 is top/left, 1000 is bottom/right).

Guidelines:
1. Group paragraphs or logical blocks of text together.
2. Ignore images, diagrams, lines, and non-text elements.
3. If there is a diagram with labels, try to extract the labels as separate small text blocks if they are distinct.
4. The bounding box should tightly enclose the text.
5. Do NOT include markdown formatting in the output, just raw JSON.
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
