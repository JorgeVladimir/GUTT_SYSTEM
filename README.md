<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1PSrwmb1QGWJdXC4tI_yCCoQY3pgCvaaC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Debugging with VS Code

If you use **Visual Studio Code**, there are ready-to-use configurations in `.vscode/launch.json` and `.vscode/tasks.json` to run and debug the app.

- Start the dev server manually: `npm run dev`, then open your browser at `http://localhost:3000`.
- Or let VS Code start the server automatically: open **Run and Debug** (Ctrl+Shift+D), select **Launch Chrome (Vite)** or **Launch Edge (Vite)**, and press F5. The debugger will run the `npm: dev` task before opening the browser.

> Tip: If VS Code asks to install "JSON with Comments" when you press F5, it’s because a JSON file (like `tsconfig.json`) is active — just select the debug configuration and run it, or close the JSON file before starting the debugger.
