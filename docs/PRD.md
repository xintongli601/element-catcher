# Element Catcher v0.1 Product Requirements Document

## 1. Product Overview

Element Catcher is a Chrome extension that helps designers, product managers, front-end learners, and indie makers capture useful UI elements from webpages and convert them into reusable front-end components.

When users browse websites, they often discover UI/UX details worth learning from: a clean pricing card, a well-designed comment box, a polished button, a useful form layout, a dashboard widget, or a navigation pattern. Current workflows are fragmented. Users usually take screenshots, save links, or manually recreate the element later. This process loses important design details such as spacing, typography, colors, structure, and component hierarchy.

Element Catcher aims to turn UI inspiration into reusable design and code assets. In v0.1, users can select a visible UI element on any webpage, capture a screenshot of that area, extract basic DOM and computed CSS where available, and generate a clean reusable React + Tailwind component.

The product's key positioning is: capture from what users can see, not only from what external tools can access.

This makes Element Catcher especially useful for private, login-only, permissioned, or dynamic webpages, such as university discussion platforms, internal dashboards, CRM systems, learning management systems, and other pages that URL-based design import tools may not be able to access.

## 2. Problem

Designers and front-end learners often collect UI inspiration while browsing, but screenshots alone are passive references. They do not preserve the underlying structure or make the element immediately reusable.

Existing URL-to-design tools are useful for public webpages, but they often struggle with private, login-only, dynamic, or permissioned pages. For example, a student may see a well-designed component inside Ed Discussion, Canvas, Moodle, or an internal dashboard, but an external design-import tool cannot access that page through a URL.

Existing screenshot-to-code tools can generate code from images, but they are usually separated from the browsing workflow. Users must manually take a screenshot, upload it, generate code, copy the result, and organize it somewhere else. Many of these tools also focus on full-page or full-screen reconstruction rather than element-level capture.

Element Catcher solves this by capturing what the user can already see in their own browser and turning selected UI elements into reusable components.

## 3. Target Users

The first target users are UI/UX students, junior product designers, product managers learning design, front-end beginners, and indie makers.

These users frequently browse websites for inspiration and want to build their own UI reference library, but they do not want to manually recreate every element from scratch.

The strongest early user is someone building a design or front-end portfolio. They browse products, collect UI patterns, study how good interfaces are structured, and want to quickly turn inspiration into editable front-end components.

## 4. Product Differentiation

Element Catcher sits between three existing product categories.

URL-to-design tools can import public webpages into design tools, but they may not work well with private or login-only pages.

Inspiration tools can save screenshots or links, but they do not turn captured UI elements into reusable code assets.

Screenshot-to-code tools can generate code from images, but they usually require a separate upload workflow and are not focused on browser-native element-level capture.

Element Catcher combines these workflows into one browser-based experience: capture a visible UI element, extract available design information, generate reusable component code, and save the result into a local component library.

## 5. MVP Scope

v0.1 should focus only on the core flow: capture a visible UI element and generate a reusable code asset.

The core user flow is:

1. The user opens a webpage.
2. The user clicks the Element Catcher extension.
3. The webpage enters selection mode.
4. The user selects a UI element.
5. The extension captures a screenshot of the selected area.
6. The extension extracts basic DOM and computed CSS if available.
7. The user previews the captured element.
8. The user clicks "Generate Component".
9. The system generates a React + Tailwind component.
10. The user copies or saves the generated component locally.

v0.1 should include element selection, screenshot capture, basic DOM/CSS extraction, local saved items, and AI-based component generation.

v0.1 should not include Figma export, cloud sync, user accounts, team sharing, paid plans, advanced responsive state handling, or full design-system management.

## 6. Key Features

### 6.1 Selection Mode

When the user activates the extension, the webpage enters a selection state. As the user moves the cursor, the hovered element should be highlighted with a visible outline. The user can click to select an element.

The first version should prioritize DOM element selection. Drag-to-box selection can be considered in a later version if element selection is not precise enough.

### 6.2 Element Screenshot Capture

After selection, the extension captures the current visible tab and crops the image to the selected element's bounding box. This screenshot becomes the visual reference for AI reconstruction.

The cropped screenshot should be saved with the captured item.

### 6.3 DOM and CSS Extraction

If the selected element is accessible, the extension should extract useful structural and style information.

The extracted information should include, where available:

- Tag name
- Text content
- Class names
- Child element summary
- Width and height
- Color
- Background color
- Font family
- Font size
- Font weight
- Line height
- Border
- Border radius
- Box shadow
- Padding
- Margin
- Display
- Flex or grid-related properties
- Gap
- Alignment

The extracted data does not need to be exhaustive. It should provide enough context to help AI generate a cleaner and more accurate component.

### 6.4 AI Component Generation

The extension should send the cropped screenshot and extracted style information to an AI model and ask it to generate a clean React + Tailwind component.

The output should not blindly copy messy website code. It should create a readable, reusable component inspired by the captured element.

The first version should generate React + Tailwind by default.

### 6.5 Local Component Library

Each captured item should be saved locally with:

- Screenshot
- Source URL
- Capture date
- Detected or user-assigned element type
- Extracted style information
- Generated component code

The user should be able to revisit saved captures and copy the generated code again.

## 7. AI Output Requirements

The generated component should be readable, reusable, and not overly tied to the original website's internal class names.

If the user captures a pricing card, the AI should generate a standalone component such as PricingCard with a clean structure: container, title, price, feature list, and call-to-action button.

Tailwind classes should approximate the captured spacing, colors, typography, border radius, and shadow.

If exact reproduction is impossible, the AI should prioritize a clean reusable approximation over messy or overly specific code.

The AI should also return a short component summary, including the component type and key design properties.

Example summary: "This is a pricing card with rounded corners, a subtle border, soft shadow, primary CTA button, and vertical feature list."

## 8. Success Criteria

The MVP is successful if a user can capture a UI element from a webpage and generate a usable React + Tailwind component in under one minute.

The generated component does not need to be pixel-perfect, but it should preserve the core structure, visual style, and layout of the selected element.

For portfolio purposes, success means the project clearly demonstrates a real user problem, a clear gap in existing tools, a focused MVP, a browser-based capture workflow, AI-assisted UI reconstruction, and product thinking around privacy, usability, and reuse.

## 9. Non-Goals for v0.1

v0.1 will not attempt to recreate entire websites.

v0.1 will not guarantee pixel-perfect reconstruction.

v0.1 will not support Figma export.

v0.1 will not support cloud accounts or team libraries.

v0.1 will not automatically publish components to a design system.

v0.1 will not bypass access controls or scrape content that the user cannot already view.

v0.1 will not include payment, subscriptions, or authentication.

## 10. Privacy and Ethical Considerations

Because this tool can capture private or login-only pages, the product should be framed carefully. It should not be positioned as a tool to steal UI or extract confidential information.

The intended use is personal design inspiration, study, and component recreation.

Captured content should stay local unless the user chooses to send it to an AI API for code generation.

If API-based generation is used, users should be warned not to send sensitive personal information, private messages, confidential business data, or protected content.

A later version may explore local-only model options, but this is not required for v0.1.

## 11. Recommended Technical Direction

Build as a Chrome extension using Manifest V3.

Use a content script for element highlighting and selection.

Use chrome.tabs.captureVisibleTab to capture the current visible page.

Crop the screenshot using the selected element's bounding box.

Use window.getComputedStyle() to extract basic CSS from the selected element and important child elements.

Use Chrome storage or local storage to save captured items.

Use a popup or side panel for the extension UI. A side panel is preferred because the user needs to preview the screenshot and review generated code.

Use React + Tailwind for the extension UI if it does not add unnecessary complexity.

For AI generation, use a vision-capable model API. The request should include the cropped screenshot plus extracted style JSON. The model should return React + Tailwind code and a short component summary.

