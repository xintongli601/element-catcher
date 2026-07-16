# Element Catcher

Element Catcher is a Chrome extension project for capturing useful UI elements from webpages and turning them into reusable front-end components. The product is aimed at designers, product managers, front-end learners, and indie makers who want a faster way to collect and study interface patterns from pages they can already view in their own browser.

Milestone 1 only establishes the Chrome Extension Manifest V3 scaffold. The extension can be built, loaded as an unpacked Chrome extension, and opened as a side panel with an initial interface. Capture selection, screenshots, DOM/CSS extraction, local capture storage, and AI generation are intentionally not implemented yet.

## Prerequisites

- Node.js 20 or newer
- npm
- Google Chrome with extension developer mode enabled

## Installation

Install project dependencies:

```bash
npm install
```

## Development

Start the Vite development server for the side panel UI:

```bash
npm run dev
```

Create a production extension build:

```bash
npm run build
```

Preview the built side panel UI:

```bash
npm run preview
```

## Loading the Extension in Chrome

1. Run `npm run build`.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on Developer mode.
4. Click Load unpacked.
5. Select the generated `dist/` directory.
6. Click the Element Catcher extension icon to open the side panel.

## Milestone 1 Support

- Chrome Extension Manifest V3 scaffold
- Background service worker entry
- Passive content script entry
- React + TypeScript side panel UI
- "Start Capture" button with a Milestone 2 notice
- Empty saved captures state
- Plain CSS styling

## Intentionally Unimplemented

- Element selection and hover highlighting
- Screenshot capture and cropping
- DOM/CSS extraction
- Local capture library storage
- React + Tailwind component generation
- AI API integration
- Figma export
- Authentication, backend services, cloud sync, and payments
