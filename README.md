<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1WMlM2SXKGDUIIReak8i5rF29iZF8fEys

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Run in GitHub Codespaces

This app is fully configured to run in GitHub Codespaces:

1. Open this repository in Codespaces
2. The dev server will automatically start on port 5173
3. Click on the "Ports" tab and find port 5173
4. Click on the forwarded URL or use the "Open in Browser" button
5. Your app will be accessible via the Codespaces forwarded port URL (e.g., `https://[codespace-name]-5173.app.github.dev/`)

The configuration includes:
- Server listening on `0.0.0.0` to accept external connections
- Hot Module Replacement (HMR) configured for Codespaces
- CORS enabled for forwarded port access
