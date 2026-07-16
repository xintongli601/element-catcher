# Element Catcher

Element Catcher is a Chrome extension project for capturing useful UI elements from webpages and turning them into reusable front-end components. The product is aimed at designers, product managers, front-end learners, and indie makers who want a faster way to collect and study interface patterns from pages they can already view in their own browser.

Milestone 2 supports a focused browser selection workflow. The extension can be built, loaded as an unpacked Chrome extension, opened as a side panel, and used to start selection mode on ordinary webpages. Hovered DOM elements receive a temporary overlay highlight, clicking selects the highlighted element, and pressing Escape cancels selection. Screenshot capture, DOM/CSS extraction, local capture storage, and AI generation are intentionally not implemented yet.

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

## Milestone 2 Support

- Chrome Extension Manifest V3 scaffold
- Background service worker entry
- Content script selection mode for ordinary webpages
- React + TypeScript side panel UI
- "Start Capture" button that starts selection mode on the active webpage
- Hover highlight overlay that does not modify webpage layout
- Click-to-select with minimal in-memory selection metadata
- Escape key and side panel cancellation
- Minimal selected-element confirmation in the side panel
- Empty saved captures state
- Plain CSS styling

## Selection Mode

Open the Element Catcher side panel and click `Start Capture` on an ordinary webpage. Move the pointer across page elements to preview the current target with a temporary overlay, then click the highlighted element to select it. Press `Escape` or use the side panel `Cancel` button to leave selection mode without selecting anything.

Selection mode records only minimal metadata for this milestone: tag name, bounding rectangle, page URL, optional short text preview, optional element ID, and optional class names. It does not save captures locally.

## Known Limitations

- Selection mode is limited to ordinary `http://` and `https://` webpages where the content script is available.
- Restricted pages such as `chrome://` pages, Chrome Web Store pages, browser-controlled UI, and some extension pages cannot be selected.
- Cross-origin iframe support is not implemented in Milestone 2.
- Closed shadow roots and browser UI cannot be inspected.

## Intentionally Unimplemented

- Screenshot capture and cropping
- DOM/CSS extraction
- Capture preview
- Local capture library storage
- React + Tailwind component generation
- AI API integration
- Figma export
- Authentication, backend services, cloud sync, and payments

Milestone 3 is the next planned step and will focus on screenshot capture and cropping.
