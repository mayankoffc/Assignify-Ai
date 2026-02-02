# GitHub Codespaces Setup Guide

## Running the Application in Codespaces

This guide will help you run the Assignify AI application in GitHub Codespaces.

### Prerequisites

- A GitHub account with Codespaces access
- A Gemini API key

### Steps to Run

1. **Open in Codespaces**
   - Navigate to the repository on GitHub
   - Click the "Code" button
   - Select "Codespaces" tab
   - Click "Create codespace on main" (or your branch)

2. **Configure Environment Variables**
   - Create a `.env.local` file in the root directory:
     ```bash
     echo "VITE_API_KEY=your_gemini_api_key_here" > .env.local
     ```
   - Replace `your_gemini_api_key_here` with your actual Gemini API key

3. **Install Dependencies** (if not already done)
   ```bash
   npm install
   ```

4. **Start the Development Server**
   ```bash
   npm run dev
   ```

5. **Access the Application**
   - When the dev server starts, Codespaces will automatically forward port 5173
   - A notification will appear with a button to "Open in Browser"
   - Click the button to open the application
   - Alternatively, go to the "Ports" tab and click the globe icon next to port 5173

### Troubleshooting

#### Simple Browser Issues
If you're having trouble with the Codespaces Simple Browser:
- Click on the "Ports" tab at the bottom of the Codespaces interface
- Find port 5173 in the list
- Click the globe icon (🌐) to open in a new browser tab
- Alternatively, copy the forwarded URL and paste it in your regular browser

#### Port Configuration
The application is configured to run on port 5173 by default. If you need to use a different port:
1. Update the `port` value in `vite.config.ts`
2. Update the `forwardPorts` value in `.devcontainer/devcontainer.json`
3. Restart the development server

#### HMR (Hot Module Replacement) Issues
If hot reload isn't working:
- The configuration already includes proper HMR settings for Codespaces
- Try refreshing the browser
- Check that the dev server is running without errors

### Configuration Details

The application includes special configuration for Codespaces:
- **Port**: 5173 (standard Vite port)
- **Host**: 0.0.0.0 (allows external connections)
- **HMR**: Configured with WSS protocol and port 443 for Codespaces compatibility

### Additional Resources

- [Codespaces Documentation](https://docs.github.com/en/codespaces)
- [Vite Documentation](https://vitejs.dev/)
- [Gemini API Documentation](https://ai.google.dev/docs)
