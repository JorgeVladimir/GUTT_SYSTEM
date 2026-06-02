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

## Integrar con backend Informix

La app ya puede consumir un API remoto para autenticacion y perfiles.

1. Crea un archivo `.env.local` en la raiz con base en `.env.example`.
2. Configura estas variables:
   - `VITE_USE_REMOTE_API=true`
   - `VITE_API_URL=/api`
   - `VITE_API_PROXY_TARGET=http://192.168.0.197`
3. Levanta el frontend con `npm run dev`.

Con esta configuracion, las llamadas a `/api/*` se enrutan al servidor remoto durante desarrollo.

Endpoints esperados por el frontend:
- `POST /api/auth/login.php`
- `GET /api/users/get_profile.php?id=<id>`
- `POST /api/reports/generate.php`
