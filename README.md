# BeanChilling MVP

Coffee leaf classifier powered by Google Cloud Vertex AI.

---

## Quick Start

### 1. Open the app

Open `frontend/index.html` in any browser — no install or build step needed.

> For camera capture to work on desktop, serve the file locally instead of opening it directly:
> ```bash
> npx serve index.html
> ```
> Then go to `http://localhost:3000`.

### 2. Configure Settings

Click **Settings** in the top-right corner and fill in the fields using the values in `Settings.txt`:

| Field | Value |
|---|---|
| Cloud Function URL | the `URL` value |
| API Key | the `API` value |
| Model name | the `Model Name` value |
| Model accuracy | the `Accuracy` value |

Click **Save settings**.

### 3. Analyze a leaf

1. Tap **Take photo** or **Upload photo**
2. Add an optional note (location, tree ID, etc.)
3. Click **Analyze**

Results appear instantly. Every analysis is saved to the **Logs** table and can be exported as CSV.

---

## Project Structure

```
frontend/        # Static web app (open index.html in browser)
  index.html
  css/style.css
  js/script.js
backend/         # Google Cloud Function (already deployed)
  index.js
  package.json
```

## Deploying the Backend

Only needed if the Cloud Function is redeployed:

```bash
gcloud functions deploy beanchilling-predict \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=backend \
  --entry-point=predict \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=beanchilling,ENDPOINT_ID=5388988512462700544,LOCATION=us-central1,API_KEY=<your key>"
```
