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

## Recent Changes (January 27, 2026)
- **Completely Offline Operation**
  - Removed all external AI dependencies (Gemini, OpenAI)
  - Implemented Tesseract.js OCR for client-side text extraction
  - Works 100% offline after page load

- **Professional UI Redesign**
  - Clean, modern dashboard layout with sidebar navigation
  - New color palette:
    - Background: #2F313A (dark grey)
    - Cards: #3A3D47
    - Primary: #6ED3B3 (soft mint green)
    - Accent: #2F6FE4 (blue)
    - Text: #FFFFFF, #B0B5C0
  - Sidebar with tools menu (Handwriting Generator, Dashboard, History, Settings)
  - Professional header with user profile
  - Clean file upload section with drag & drop
  - Processing screen with live stats (letters/sec, pages, progress stages)
  - Results screen with professional toolbar (search, zoom, export)

- **Enhanced Handwriting Engine**
  - Gaussian distribution for natural variations
  - Word-level context awareness
  - Ink pooling effects at stroke ends
  - Baseline drift simulation
  - Character-level kerning randomization

- **Virtual Scrolling for 1000+ Pages**
  - react-window v2 for virtualized list rendering
  - Memoized page components
  - Lazy loading with 3-page overscan
  - Smooth scrolling with zoom controls

- **Converted to Android App using Capacitor**
  - Added @capacitor/core, @capacitor/cli, @capacitor/android packages
  - Created Android project in /android folder
  - Configured Capacitor for HTTPS scheme and mixed content
  - App ID: com.assignify.app

## Android Build Instructions
1. Build and sync: `npm run android:sync`
2. Open in Android Studio: `npm run android:open` (or import /android folder manually)
3. Build APK from Android Studio: Build > Build Bundle(s) / APK(s) > Build APK(s)
4. The APK will be in: android/app/build/outputs/apk/debug/app-debug.apk

### Android Project Structure
- `/android` - Complete Android Studio project
- `/android/app/src/main/assets/public` - Web app files
- `/android/app/src/main/res` - Android resources (icons, splash screens)
- `/capacitor.config.ts` - Capacitor configuration

## Previous Changes (December 7, 2025)
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
