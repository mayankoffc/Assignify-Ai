#!/bin/bash

# Assignify AI - Startup Script for Codespaces

echo "🚀 Starting Assignify AI in Codespaces..."
echo ""

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "⚠️  Warning: .env.local file not found!"
    echo "📝 Please create a .env.local file with your Gemini API key:"
    echo "   VITE_API_KEY=your_gemini_api_key_here"
    echo ""
    read -p "Would you like to create .env.local now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your Gemini API key: " api_key
        echo "VITE_API_KEY=$api_key" > .env.local
        echo "✅ Created .env.local file"
    else
        echo "⏭️  Skipping .env.local creation. You can create it manually later."
    fi
fi

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "🎉 Setup complete!"
echo "🌐 Starting development server on port 5173..."
echo ""
echo "💡 Tip: When the server starts, click 'Open in Browser' in the notification"
echo "    or go to the 'Ports' tab and click the globe icon next to port 5173"
echo ""

# Start the dev server
npm run dev
