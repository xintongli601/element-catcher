# Element Catcher v0.1 Development Brief

## 1. Objective

Build the first working MVP of Element Catcher as a Chrome extension.

The extension should allow a user to select a visible UI element on a webpage, capture a cropped screenshot of that element, extract basic DOM and computed CSS information, save the capture locally, and prepare the data for AI-based React + Tailwind component generation.

The first implementation should prioritize a working end-to-end capture flow over visual polish.

## 2. Development Principles

Keep the MVP small and focused.

Do not implement Figma export, user accounts, cloud sync, payment, team collaboration, or advanced design-system features.

Avoid unnecessary dependencies.

Use clear, readable code.

Prefer a modular structure so later versions can add AI generation, search, tagging, and Figma integration.

Do not hard-code any private API keys.

If an AI API is added, use environment variables or a local config file that is excluded from git.

## 3. Recommended Tech Stack

Use Chrome Extension Manifest V3.

Use TypeScript if practical.

Use React for the extension UI if it can be set up cleanly.

Use Tailwind for the extension UI if it does not create unnecessary setup complexity.

Use Chrome extension APIs for active tab access, content scripts, screenshot capture, and local storage.

Use local Chrome storage for v0.1 saved captures.

No backend is required for v0.1.

No domain is required for v0.1.

## 4. Suggested Project Structure

Create a structure similar to:

```text
element-catcher/
  README.md
  docs/
    PRD.md
    DEVELOPMENT_BRIEF.md
  extension/
    manifest.json
    src/
      background/
      content/
      popup/
      sidepanel/
      shared/
    public/
  package.json
  .gitignore
```

If a simpler structure is better for the initial implementation, use the simpler structure, but keep the code organized by responsibility.

## 5. Core Functional Requirements

### 5.1 Extension Activation

The user should be able to click the extension icon to activate Element Catcher.

Activation should allow the user to start selecting an element on the current webpage.

### 5.2 Element Highlighting

When selection mode is active, the content script should highlight the element currently under the cursor.

The highlight should be visually clear but temporary.

The highlight should not permanently modify the webpage.

### 5.3 Element Selection

When the user clicks a highlighted element, the extension should record the selected element's bounding box.

The selected element should be identified using DOM selection where possible.

For v0.1, click-to-select is enough. Drag-to-select can be added later.

### 5.4 Screenshot Capture

After selection, the extension should use chrome.tabs.captureVisibleTab to capture the visible tab.

The extension should crop the screenshot according to the selected element's bounding box.

The cropped screenshot should be stored as a data URL or Blob-compatible format.

### 5.5 DOM and CSS Extraction

The content script should extract useful information from the selected element.

At minimum, extract:

- Tag name
- Text content
- Class names
- Element dimensions
- Computed color
- Computed background color
- Font family
- Font size
- Font weight
- Border radius
- Border
- Box shadow
- Padding
- Margin
- Display
- Gap
- Flex or grid-related properties where available

The extraction should return a structured JSON object.

### 5.6 Capture Preview

After an element is captured, the extension UI should show:

- The cropped screenshot
- Source URL
- Capture timestamp
- Basic extracted style information
- A placeholder area for generated component code

### 5.7 Local Storage

The extension should save captured items locally.

Each item should include:

- Unique ID
- Source URL
- Timestamp
- Screenshot data
- Extracted DOM/CSS JSON
- Generated code if available
- Optional title or element type

### 5.8 Code Generation Placeholder

If AI integration is not implemented in the first commit, create a clear placeholder function such as generateComponentFromCapture(capture).

The placeholder should return a simple React + Tailwind component template based on the extracted information.

This will later be replaced or extended with a vision-capable AI API call.

## 6. AI Integration Requirements for Later Step

When AI generation is implemented, the function should send:

- Cropped screenshot
- Extracted DOM/CSS JSON
- User instruction
- Desired output format: React + Tailwind

The model should return:

- Component name
- React + Tailwind code
- Short component summary
- Optional notes about approximation limitations

Do not implement API key handling insecurely.

Do not commit API keys.

## 7. Acceptance Criteria for v0.1

The MVP is acceptable when:

1. The extension can be loaded locally in Chrome developer mode.
2. The user can activate selection mode.
3. Hovered elements are highlighted.
4. The user can click an element to select it.
5. The extension captures and crops a screenshot of the selected element.
6. The extension extracts basic DOM/CSS data.
7. The extension displays a preview of the captured element.
8. The extension saves the capture locally.
9. The user can copy generated or placeholder React + Tailwind code.
10. The project remains small, readable, and easy to extend.

## 8. Out of Scope for First Build

Do not build Figma export.

Do not build authentication.

Do not build cloud sync.

Do not build a backend.

Do not build payment or subscription logic.

Do not build team libraries.

Do not build full-page website reconstruction.

Do not implement drag-to-select unless the click-to-select flow is already stable.

Do not spend time on advanced UI polish before the capture flow works.

## 9. README Requirements

The README should explain:

- What Element Catcher is
- Why it exists
- The core v0.1 workflow
- How to run the extension locally
- What is currently supported
- What is planned next

The README should be written clearly for a portfolio project.

## 10. Next Development Step

After this documentation is updated, begin implementing the Chrome extension MVP in small milestones.

Milestone 1: Set up extension scaffold.

Milestone 2: Implement selection mode and element highlighting.

Milestone 3: Implement screenshot capture and cropping.

Milestone 4: Implement DOM/CSS extraction.

Milestone 5: Implement preview UI and local storage.

Milestone 6: Add placeholder React + Tailwind generation.

Milestone 7: Add AI integration after the core flow is stable.

