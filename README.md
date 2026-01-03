# MiniStudio - Studio Artisan

An AI-powered miniature painting visualization app for tabletop hobbyists. Built with Expo (React Native) for iOS, Android, and Web.

## Features

- **Designer Mode**: Generate concept art sketches, 3D miniature renders, and studio-quality product shots
- **Painter Mode**: Visualize painting styles (Heavy Metal, Grimdark, NMM, etc.) on your unpainted miniatures
- **Camera Capture**: Take photos directly from the app
- **Image Library**: Import images from your photo library
- **4K Upscaling**: Enhance generated images to high resolution
- **Color Palettes**: Select from real hobby paint brands (Citadel, Vallejo, Army Painter)
- **Background Themes**: Add Fantasy, Sci-Fi, Modern, or Historical environments

## Tech Stack

- **Expo SDK 52** (React Native)
- **Expo Router** for file-based navigation
- **NativeWind** (Tailwind CSS for React Native)
- **Google Gemini API** for AI image generation
- **Supabase** for paint color database

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- For iOS development: macOS with Xcode
- For Android development: Android Studio with SDK

### Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Add app icons (required):**
   
   Add the following images to the `assets/` folder:
   - `icon.png` (1024x1024) - Main app icon
   - `adaptive-icon.png` (1024x1024) - Android adaptive icon  
   - `splash-icon.png` (512x512) - Splash screen icon
   - `favicon.png` (48x48) - Web favicon

3. **Set up your Gemini API key:**
   
   Get an API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and enter it in the app settings.

### Running the App

**Start the development server:**
```bash
npm start
```

**Run on specific platforms:**
```bash
# Web (for development preview)
npm run web

# iOS Simulator
npm run ios

# Android Emulator
npm run android
```

### Building for Production

**Using EAS Build (recommended):**
```bash
# Install EAS CLI
npm install -g eas-cli

# Configure your project
eas build:configure

# Build for iOS
npm run build:ios

# Build for Android
npm run build:android
```

## Project Structure

```
├── app/                    # Expo Router screens
│   ├── _layout.tsx         # Root layout
│   ├── index.tsx           # Welcome/auth screen
│   ├── camera.tsx          # Camera capture screen
│   ├── settings.tsx        # Settings screen
│   └── (studio)/           # Main studio screens
│       ├── _layout.tsx
│       └── index.tsx       # Main studio interface
├── src/
│   ├── components/         # Reusable components
│   │   └── Icons.tsx       # SVG icon components
│   ├── hooks/              # Custom React hooks
│   │   ├── useCamera.ts
│   │   ├── useImagePicker.ts
│   │   └── useMediaSave.ts
│   ├── services/           # API and data services
│   │   ├── geminiService.ts    # Gemini AI integration
│   │   ├── paintService.ts     # Paint database API
│   │   └── storageService.ts   # Secure storage
│   ├── constants.ts        # App constants
│   └── types.ts            # TypeScript types
├── assets/                 # App icons and images
├── app.json               # Expo configuration
├── babel.config.js        # Babel configuration
├── metro.config.js        # Metro bundler configuration
├── tailwind.config.js     # Tailwind/NativeWind configuration
└── global.css             # Global Tailwind styles
```

## Configuration

### Environment Variables

The app uses secure storage for API keys. Users enter their Gemini API key in the app settings, which is stored securely on the device.

### Customization

- **Painting Styles**: Edit `src/constants.ts` to add or modify painting style prompts
- **Color Palettes**: The app fetches colors from a Supabase database (see `src/services/paintService.ts`)
- **Theme Colors**: Modify `tailwind.config.js` to customize the app theme

## API Requirements

This app requires a **paid** Google Cloud project with the Gemini API enabled:

1. Create a Google Cloud project
2. Enable the Gemini API
3. Set up billing
4. Generate an API key
5. Enter the key in the app settings

See [Gemini API Billing Documentation](https://ai.google.dev/gemini-api/docs/billing) for details.

## Platform Notes

### iOS
- Camera permissions are configured in `app.json`
- Requires iOS 13.4+

### Android
- Camera and storage permissions are configured in `app.json`
- Requires Android API 23+

### Web
- Uses localStorage for secure storage (fallback)
- Camera API uses browser's getUserMedia
- Full functionality available in modern browsers

## Troubleshooting

**TypeScript errors before install:**
This is expected. Run `npm install` to install all dependencies and resolve type errors.

**Camera not working on web:**
Ensure you're using HTTPS or localhost, as getUserMedia requires a secure context.

**Build errors:**
Make sure you have the correct version of Node.js (18+) and have run `npm install`.

## License

© 2025 Miniature Logic Systems. All rights reserved.
