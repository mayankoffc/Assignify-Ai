# Assignify - Universal TMA Solver

## Overview
Assignify is a React + Vite web application that converts any Tutor-Marked Assignment (TMA) into realistic handwritten-style solutions using Google's Gemini AI. The app supports all subjects - Science, Mathematics, Commerce, Arts, Literature, History, and more.

## Project Structure
- **Frontend**: React 19.2 with TypeScript
- **Build Tool**: Vite 6.2
- **AI Integration**: 
  - Google Gemini 2.5 Flash for solution generation
  - Imagen 3.0 for image generation
- **PDF Processing**: pdfjs-dist for extracting text from PDFs
- **Styling**: TailwindCSS (via CDN)
- **Custom Fonts**: Multiple handwriting fonts (Caveat, Cedarville Cursive, Shadows Into Light)

## Key Features
- Upload any TMA/Assignment PDF or image
- Universal AI-powered solution generation (works for any subject)
- Realistic handwritten text rendering with character-level variations
- Support for mathematical notation (fractions, square roots)
- AI-generated illustrations for complex visuals
- Print-ready output formatted as A4 paper
- Export options: Clean and Scanned modes

## Architecture
### Frontend Components
- `App.tsx`: Main application logic, AI integration, and UI components
- `components/PaperSheet.tsx`: Component for rendering individual solution pages
- `types.ts`: TypeScript type definitions
- `constants.ts`: Universal AI prompts and fallback data

### Handwriting Engine
The app uses a sophisticated handwriting simulation:
- Character-level randomization (rotation, offset, scale, skew)
- Multiple font families mixed naturally
- Staggered animation for realistic writing effect
- Simulated pen pressure variations

### AI Models Used
- **gemini-2.5-flash**: For analyzing assignments and generating detailed solutions
- **imagen-3.0-generate-002**: For generating educational illustrations

## Environment Setup
### Required Environment Variables
- `VITE_API_KEY`: Google Gemini API key (stored as shared environment variable)

### Development
- Server runs on port 5000 (configured for Replit)
- Host: 0.0.0.0 (allows Replit proxy)
- HMR configured for Replit environment
- AllowedHosts: true (for proxy compatibility)

## Recent Changes (December 7, 2025)
- Converted from Physics-specific solver to Universal TMA Solver (Assignify)
- Updated AI prompt to support all subjects
- Changed model from gemini-2.5-flash to gemini-2.5-flash with universal prompts
- Updated image generation to use imagen-3.0-generate-002
- Removed physics-specific fallback solutions
- Updated branding throughout (title, UI text, terminal messages)
- Added generic diagram placeholder for custom diagrams
- Fixed image API response parsing for different SDK versions

## Deployment
- **Type**: Static site deployment
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- The app builds to static HTML/CSS/JS that can be served from any CDN

## Dependencies Note
Due to React version conflicts (React 19.2 vs lucide-react@0.263.1 expecting React 18), the project uses `--legacy-peer-deps` flag for npm install.

## User Preferences
- User prefers universal TMA support, not physics-specific
- App should work for any subject assignment
