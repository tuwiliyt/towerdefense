# 🧟 Retro Zombie Tower Defense

A retro arcade-style HTML5 Canvas Tower Defense game with rich audio synthesizers, customizable towers, wave progression, CRT shader scanlines, and apocalypse theme.

## 🚀 Play Online / Deployment

This project is a 100% client-side static web application (HTML5, Vanilla JavaScript, CSS). It requires **no backend server** and can be deployed for free on static hosting platforms:

### Deploy to Cloudflare Pages (Recommended)
1. Fork or push this repository to your GitHub account.
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) > **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**.
3. Select this repository.
4. Build configuration:
   - **Framework preset**: `None`
   - **Build command**: *(Leave empty)*
   - **Build output directory**: `/` (or leave empty)
5. Click **Save and Deploy**. Your game is live worldwide 24/7!

---

## 💻 Run Locally

You can run this project locally with any static web server:

### Using Python
```bash
python3 -m http.server 8000
```
Open `http://localhost:8000` in your browser.

### Using Node.js / npx
```bash
npx serve .
```

---

## 🕹️ Controls & Hotkeys
- **Mouse Click**: Place towers, select towers, interact with HUD buttons
- **Space**: Pause / Resume game
- **F**: Fast forward speed (1x / 2x / 3x)
- **M**: Toggle audio sound effects
- **Hotkeys (1-5)**: Quick-select tower type

## 📄 License
MIT License.
