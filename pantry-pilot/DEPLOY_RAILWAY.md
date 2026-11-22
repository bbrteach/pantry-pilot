# Deploying PantryPilot to Railway (Free Plan)

Follow these steps to host PantryPilot on **Railway** with persistent SQLite storage, uploaded meal photos, a shared household passcode, and Kroger Public API support.

---

## 1. Push the Project to a Private GitHub Repo

```bash
cd pantry-pilot
git init
git add .
git commit -m "Initial PantryPilot deployment"
# Create a private repo on GitHub, then push:
git branch -M main
git remote add origin https://github.com/<your-username>/pantry-pilot.git
git push -u origin main
```

---

## 2. Create the Service on Railway

1. Sign in at [railway.com](https://railway.com) and click **New Project → Deploy from GitHub Repo**.
2. Select your `pantry-pilot` repository.
   - Railway automatically detects [Dockerfile](./Dockerfile) and [railway.toml](./railway.toml) (which pre-enables **App Sleeping / Serverless** and `/api/health` checks).
3. In the service **Settings → Networking**, click **Generate Domain** to get your HTTPS URL (e.g., `https://pantrypilot-production.up.railway.app`).

---

## 3. Attach a Persistent Volume (Important!)

Without a volume, Railway wipes local files on every redeploy.

1. Open your Railway service → **Volumes** (or right-click canvas → **Add Volume**).
2. Set the **Mount Path** to:
   ```text
   /data
   ```
   *(The Free plan includes a 0.5 GB volume—enough for thousands of meals and ~4,000+ compressed meal photos.)*

---

## 4. Set Environment Variables

In your Railway service → **Variables**, add:

| Variable | Value | Notes |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Serves React UI + API from one port |
| `DATABASE_PATH` | `/data/pantrypilot.db` | Stores SQLite DB & meal photos (`/data/uploads/`) on the persistent volume |
| `APP_PASSCODE` | *(pick a shared family passcode)* | Locks the app behind a 30-day household sign-in screen |
| `SESSION_SECRET` | *(any random 32+ char string)* | Keeps household phones logged in across restarts |

### Optional: Enable Live Kroger Integration
Add these once you have your credentials from [developer.kroger.com](https://developer.kroger.com):

| Variable | Value |
| :--- | :--- |
| `KROGER_CLIENT_ID` | *(your Production Client ID)* |
| `KROGER_CLIENT_SECRET` | *(your Production Client Secret)* |
| `KROGER_REDIRECT_URI` | `https://<your-railway-domain>/api/kroger/callback` |
| `KROGER_BASE_URL` | `https://api.kroger.com/v1` |

Make sure you also add `https://<your-railway-domain>/api/kroger/callback` as an allowed **Redirect URI** in your Kroger Developer Portal app settings!

---

## 5. Verify Serverless (App Sleeping) Is Enabled

1. Go to **Settings → Deploy → Serverless** (enabled automatically via `sleepApplication = true` in `railway.toml`).
2. When no one uses PantryPilot for ~10 minutes, Railway puts the app to sleep so CPU & RAM charges stop, keeping typical household usage well within the Free Plan's **\$1/month** credit.

---

## 6. Share With Your Household (Install on Phones)

Send your Railway HTTPS link + household passcode to anyone in your household:
- **iPhone (Safari):** Open the link → tap **Share** → **Add to Home Screen**.
- **Android (Chrome):** Open the link → tap **⋮ Menu** → **Add to Home screen** / **Install app**.

Everyone shares the same live meal library, photos, recurring staples, weekly plan, and grocery list!
