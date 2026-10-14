# Screen Draw & Laser

A lightweight Chrome extension for drawing, highlighting, writing text, and pointing with a laser overlay on web pages.

## Features

- Pen for freehand drawing
- Highlighter with translucent strokes
- Text annotations
- Eraser
- Laser pointer with adjustable fade duration and glow
- Browse mode for scrolling and interacting with the page
- Adjustable drawing color and size
- Undo and clear controls
- Draggable toolbar with left/right edge docking
- Toolbar position and laser settings saved locally
- Canvas annotations stay aligned while the page scrolls

## Installation

This project is currently set up as an unpacked Chrome extension.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the project folder containing `manifest.json`.
5. Open a web page and click the extension icon.

To apply code changes during development, return to `chrome://extensions` and click the extension's **Reload** button, then refresh the web page.

## Usage

Click the extension icon or press `Alt+Shift+D` to show or hide the drawing overlay.

Choose a tool from the toolbar:

- **Pen:** draw solid lines.
- **Highlighter:** draw wider, translucent lines.
- **Text:** click the page, type an annotation, then press `Enter` to place it. Use `Shift+Enter` for a new line.
- **Eraser:** remove parts of existing strokes.
- **Laser:** hold the left mouse button and move the pointer. Adjust fade and glow while this tool is active.
- **Browse:** temporarily pass clicks through to the page and continue scrolling or interacting normally.

The toolbar can be moved by dragging its grip or an empty area. Drag it near the left or right edge to dock it vertically.

## Shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+Shift+D` | Toggle the overlay |
| `Esc` | Hide the overlay |
| `Ctrl+Z` or `Cmd+Z` | Undo the most recent stroke or text annotation |
| `Enter` | Finish a text annotation |
| `Shift+Enter` | Insert a line break in a text annotation |

## Permissions

The extension requests:

- `activeTab` to interact with the current tab
- `scripting` to inject the content script when needed
- `storage` to save toolbar position and laser settings

The content script matches all URLs, but browsers restrict extensions from running on protected pages such as `chrome://` pages and the Chrome Web Store.

## Project Structure

- `manifest.json` - Chrome extension metadata, permissions, commands, and script registration
- `background.js` - Handles toolbar clicks and injects the content script when necessary
- `content.js` - Creates and manages the drawing, text, laser, and toolbar overlay
