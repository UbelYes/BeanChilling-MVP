# BeanChilling MVP — Technical Documentation

**Project:** BeanChilling — Coffee Leaf Classification Web App  
**Platform:** Google Cloud Platform (GCP)  
**Stack:** Vanilla HTML/CSS/JS · Node.js Cloud Function · Vertex AI AutoML Vision  
**Date:** May 2026

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Steps Taken](#2-steps-taken)
3. [Problems Encountered and Solutions](#3-problems-encountered-and-solutions)
4. [GCP Services Used and Cost](#4-gcp-services-used-and-cost)
5. [Architecture and Design Decisions](#5-architecture-and-design-decisions)
6. [Architecture Diagram](#6-architecture-diagram)
7. [Data Flow Diagram](#7-data-flow-diagram)
8. [Security Design](#8-security-design)
9. [Performance Analysis](#9-performance-analysis)
10. [Cost vs Performance Analysis](#10-cost-vs-performance-analysis)
11. [SLA Considerations](#11-sla-considerations)

---

## 1. Project Overview

BeanChilling is a mobile-friendly web application that allows coffee farm workers to take or upload a photo of a coffee leaf and receive an instant AI-powered classification of whether the leaf belongs to an **Arabica** plant, a **Robusta** plant, or **neither**. Results are logged locally with timestamps, notes, and thumbnails, and can be exported as CSV.

The original prototype targeted Microsoft Azure Custom Vision. This documentation covers the migration to and full implementation on Google Cloud Platform.

---

## 2. Steps Taken

### 2.1 Decision to Migrate from Azure to GCP

The original webapp was built to call the Azure Custom Vision prediction endpoint directly from the browser using a `Prediction-Key` header. The decision was made to migrate to GCP for the following reasons:

- Access to Google Cloud Agent Platform (Model Garden / Vertex AI AutoML)
- Familiarity with Google ecosystem
- GCP free trial credits ($300) available

### 2.2 Webapp Code Changes

The following files were updated to support GCP:

**frontend/index.html**
- Settings panel label changed from "Azure URL" to "Cloud Function URL"
- Settings panel label changed from "Prediction Key" to "API Key"
- Hint text updated to reflect GCP architecture

**frontend/js/script.js**
- Fetch header changed from `Prediction-Key` to `X-Api-Key`
- API key is only sent if present (optional)

**frontend/css/style.css**
- Added `.label-pill.arabica`, `.label-pill.robusta`, `.label-pill.neither` CSS classes for the logs table prediction pills

### 2.3 Cloud Function Proxy Creation

A Node.js Cloud Function was created in `backend/` to act as a secure proxy between the browser and Vertex AI. Two files were created:

- `backend/index.js` — the function logic
- `backend/package.json` — dependencies (`@google-cloud/functions-framework`, `google-auth-library`)

### 2.4 GCP Project Setup

1. Created a GCP project named `beanchilling`
2. Enabled billing (required for Vertex AI)
3. Enabled required APIs:
   - Vertex AI API
   - Cloud Functions API
   - Cloud Build API
   - Artifact Registry API
   - Cloud Run API

### 2.5 Vertex AI Dataset and Model Training

1. Navigated to Vertex AI → Datasets → Create dataset
   - Name: `coffee-leaves`
   - Type: Image, Single-label classification
   - Region: `us-central1`
2. Uploaded labeled images in three classes:
   - `arabica` — photos of Arabica coffee leaves
   - `robusta` — photos of Robusta coffee leaves
   - `neither` — photos of non-coffee-leaf subjects
3. Verified labels in the Browse tab
4. Trained using AutoML with 8 node-hour budget
5. Evaluated model via Precision/Recall metrics and Confusion Matrix

### 2.6 Model Deployment

1. Deployed trained model to a new endpoint named `coffee-leaf-endpoint`
2. Machine type: `n1-standard-2`
3. Replicas: 1 (sufficient for MVP/demo usage)
4. Retrieved Endpoint ID from the GCP Console URL

### 2.7 Cloud Function Deployment

Deployed the proxy Cloud Function using the gcloud CLI:

```bash
gcloud functions deploy beanchilling-predict \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=backend \
  --entry-point=predict \
  --trigger-http \
  --allow-unauthenticated \
  --set-env-vars "PROJECT_ID=...,ENDPOINT_ID=...,LOCATION=us-central1,API_KEY=..."
```

### 2.8 IAM Permissions Granted

The following IAM bindings were applied across the project:

| Service Account | Role | Purpose |
|---|---|---|
| `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` | `roles/logging.logWriter` | Cloud Build logging during deploy |
| `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` | `roles/artifactregistry.writer` | Push container image to Artifact Registry |
| `PROJECT_NUMBER@cloudbuild.gserviceaccount.com` | `roles/storage.objectAdmin` | Read/write build artifacts in Cloud Storage |
| `PROJECT_NUMBER-compute@developer.gserviceaccount.com` | `roles/aiplatform.user` | Allow Cloud Function to call Vertex AI endpoint |

### 2.9 Webapp Configuration

After deployment, the webapp was configured via its Settings panel:
- Cloud Function URL pasted into the URL field
- API key entered to match the `API_KEY` env var set during deployment

---

## 3. Problems Encountered and Solutions

### Problem 1 — Cloud Function Deploy: `code=7` Missing Permissions

**Error:**
```
OperationError: code=7, message=Could not build the function due to missing
permissions. projects/-/serviceAccounts/115219687339902554062 can not be
accessed by IAM.
```

**Cause:** Required GCP APIs were not enabled, so the Cloud Build service account did not exist yet and could not be resolved.

**Solution:** Enabled the three missing APIs:
```bash
gcloud services enable cloudbuild.googleapis.com
gcloud services enable artifactregistry.googleapis.com
gcloud services enable run.googleapis.com
```

---

### Problem 2 — Cloud Function Deploy: `code=3` Build Failed

**Error:**
```
OperationError: code=3, message=Build failed with status: FAILURE.
Could not build the function due to a missing permission on the build
service account.
```

**Cause:** The Cloud Build service account existed but lacked the roles needed to write logs, push images to Artifact Registry, and access Cloud Storage during the build.

**Solution:** Granted three roles to the Cloud Build service account (project number `375203008313`):
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:375203008313@cloudbuild.gserviceaccount.com" \
  --role="roles/logging.logWriter"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:375203008313@cloudbuild.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:375203008313@cloudbuild.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"
```

---

### Problem 3 — Missing `PROJECT_ID` or `ENDPOINT_ID` Env Vars

**Error:**
```json
{"error": "Missing PROJECT_ID or ENDPOINT_ID env vars"}
```

**Cause:** The `--set-env-vars` flag was provided in the deploy command but the values were not actually filled in before running.

**Solution:** Redeployed with correct values substituted for all placeholders.

---

### Problem 4 — PowerShell Comma Parsing: Entire Env Vars Merged into `PROJECT_ID`

**Error:**
```
Permission denied on resource project "beanchilling ENDPOINT_ID=538...
LOCATION=us-central1 API_KEY=..."
```

**Cause:** PowerShell treated the comma-separated `--set-env-vars` value as multiple separate arguments rather than one string. All values after `PROJECT_ID=beanchilling` were appended to the project ID with spaces.

**Solution:** Wrapped the entire `--set-env-vars` value in double quotes:
```bash
--set-env-vars "PROJECT_ID=...,ENDPOINT_ID=...,LOCATION=us-central1,API_KEY=..."
```

---

### Problem 5 — Vertex AI `403 PERMISSION_DENIED` on `aiplatform.endpoints.predict`

**Error:**
```
Permission 'aiplatform.endpoints.predict' denied on resource
'//aiplatform.googleapis.com/projects/beanchilling/locations/
us-central1/endpoints/5388988512462700544'
```

**Cause:** Cloud Functions Gen 2 runs under the **Compute Engine default service account** (`PROJECT_NUMBER-compute@developer.gserviceaccount.com`), not the App Engine default service account. The IAM binding was previously applied to the wrong service account.

**Solution:** Granted `roles/aiplatform.user` to the correct service account:
```bash
gcloud projects add-iam-policy-binding PROJECT_ID \
  --member="serviceAccount:375203008313-compute@developer.gserviceaccount.com" \
  --role="roles/aiplatform.user"
```

---

## 4. GCP Services Used and Cost

### Services

| Service | Purpose | Tier Used |
|---|---|---|
| **Vertex AI AutoML Vision** | Train the coffee leaf classification model | AutoML Image Classification |
| **Vertex AI Online Prediction** | Host the trained model and serve predictions | `n1-standard-2`, 1 replica |
| **Cloud Functions Gen 2** | Proxy between browser and Vertex AI; handles GCP authentication | Node.js 20, `us-central1` |
| **Cloud Build** | Build and containerize the Cloud Function during deployment | Default |
| **Artifact Registry** | Store the Cloud Function container image | Default |
| **Cloud Run** | Underlying runtime for Gen 2 Cloud Functions | Managed |

### Estimated Costs

| Service | Cost | Notes |
|---|---|---|
| AutoML Training (8 node hours) | ~$25–35 | One-time cost per training run |
| Vertex AI Endpoint (`n1-standard-2`) | ~$0.11/hour | Charged while endpoint is deployed |
| Cloud Functions invocations | ~$0.40/million calls | First 2M calls/month free |
| Cloud Build | Free | First 120 min/day free |
| Artifact Registry | ~$0.10/GB/month | Negligible for this project |
| **GCP Free Trial Credits** | **$300** | Covers all MVP costs |

> The Vertex AI endpoint is the largest ongoing cost. For a class demo, deploy it only when needed and delete the endpoint when not in use to avoid charges.

---

## 5. Architecture and Design Decisions

### 5.1 Why a Cloud Function Proxy

Vertex AI Online Prediction requires OAuth2 authentication using a GCP service account. Service account credentials cannot be safely embedded in a browser-side JavaScript application (they would be visible to anyone who inspects the page source). A Cloud Function proxy solves this by:

- Keeping the service account credentials server-side (via Application Default Credentials)
- Exposing a simple HTTP endpoint the browser can call
- Optionally enforcing an API key to prevent unauthorized use

### 5.2 Why AutoML Vision

AutoML Vision was chosen over manually training a custom neural network because:

- No ML expertise required — GCP handles model architecture selection and hyperparameter tuning
- Suitable accuracy for a 3-class problem with a small dataset
- Integrated deployment pipeline (train → evaluate → deploy in one console)
- Appropriate for a student MVP timeline

### 5.3 Why Three Classes (Not Two)

Training only `arabica` and `robusta` would force the model to always output one of the two even when presented with a completely unrelated image (a hand, a rock, another plant). The `neither` class gives the model a way to express uncertainty and reject non-coffee-leaf inputs, making the app more reliable in field conditions.

### 5.4 Why Static Frontend (No Backend Framework)

The webapp is a single HTML file with linked CSS and JS files, organized under `frontend/` with `css/` and `js/` subdirectories. No build tools, no framework. This was a deliberate decision to:

- Keep the MVP simple and deployable by opening a file in any browser
- Avoid introducing unnecessary complexity for a proof-of-concept
- Allow the app to run offline (except for the AI call) and on low-end devices

### 5.5 Replica Count Decision

The endpoint was deployed with **1 replica**. For an MVP with a single user or a small demo group, one replica handles requests sequentially and costs the minimum. Multiple replicas would only be needed for concurrent production traffic.

---

## 6. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S DEVICE                            │
│                                                                 │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │               frontend/index.html                       │   │
│   │                                                         │   │
│   │  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌─────────┐  │   │
│   │  │ Settings │  │ Capture  │  │ Result │  │  Logs   │  │   │
│   │  │  Panel   │  │  Area    │  │  View  │  │  Table  │  │   │
│   │  └──────────┘  └──────────┘  └────────┘  └─────────┘  │   │
│   │        │            │             ↑            │        │   │
│   │        ▼            ▼             │            ▼        │   │
│   │  ┌─────────────────────────────────────────────────┐   │   │
│   │  │            frontend/js/script.js                │   │   │
│   │  │  Settings · File Handling · Fetch · History     │   │   │
│   │  └─────────────────────────────────────────────────┘   │   │
│   │        │            │                      │            │   │
│   │        ▼            │                      ▼            │   │
│   │  ┌──────────┐       │              ┌──────────────┐     │   │
│   │  │  Local   │       │              │  Local       │     │   │
│   │  │ Storage  │       │              │  Storage     │     │   │
│   │  │(settings)│       │              │  (history)   │     │   │
│   │  └──────────┘       │              └──────────────┘     │   │
│   └────────────────────────────────────────────────────────-┘   │
│                          │ POST /predict                         │
│                          │ image/octet-stream + X-Api-Key        │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    GOOGLE CLOUD PLATFORM                         │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              Cloud Functions Gen 2 (Node.js 20)            │  │
│  │                   beanchilling-predict                     │  │
│  │                                                            │  │
│  │  1. Validate X-Api-Key header                              │  │
│  │  2. Get OAuth2 token via Application Default Credentials   │  │
│  │  3. Base64-encode raw image bytes                          │  │
│  │  4. POST to Vertex AI endpoint                             │  │
│  │  5. Normalize response → { predictions: [...] }            │  │
│  └────────────────────────┬───────────────────────────────────┘  │
│                           │ HTTPS + Bearer token                 │
│                           │ JSON { instances: [{ content: b64 }]}│
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │            Vertex AI Online Prediction Endpoint             │ │
│  │                  coffee-leaf-endpoint                       │ │
│  │                                                             │ │
│  │   Model: coffee-leaf-classifier (AutoML Vision)             │ │
│  │   Machine: n1-standard-2 · 1 replica · us-central1         │ │
│  │                                                             │ │
│  │   Classes: arabica · robusta · neither                      │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 7. Data Flow Diagram

### 7.1 Analysis Request Flow

```
[1] User selects or takes a photo
        │
        ▼
[2] Browser reads file as ArrayBuffer (FileReader API)
        │
        ▼
[3] frontend/js/script.js stores raw Blob in memory (currentImageBlob)
    and renders a preview thumbnail on screen
        │
        ▼
[4] User clicks Analyze
        │
        ▼
[5] frontend/js/script.js reads Cloud Function URL and API Key from localStorage
        │
        ▼
[6] Browser POSTs raw image bytes to Cloud Function
    Headers: Content-Type: application/octet-stream
             X-Api-Key: <user's api key>
        │
        ▼ (HTTPS, crosses internet boundary)
        │
[7] Cloud Function receives request
    → Checks X-Api-Key against API_KEY env var
    → Calls GoogleAuth to get a short-lived OAuth2 bearer token
    → Converts req.rawBody to base64 string
        │
        ▼
[8] Cloud Function POSTs to Vertex AI
    URL:  https://us-central1-aiplatform.googleapis.com/v1/
          projects/{PROJECT_ID}/locations/us-central1/
          endpoints/{ENDPOINT_ID}:predict
    Body: { "instances": [{ "content": "<base64 image>" }] }
    Auth: Bearer <oauth2 token>
        │
        ▼
[9] Vertex AI AutoML model runs inference on the image
    Returns:
    {
      "predictions": [{
        "displayNames": ["arabica", "robusta", "neither"],
        "confidences": [0.94, 0.04, 0.02]
      }]
    }
        │
        ▼
[10] Cloud Function normalizes to webapp format:
    {
      "predictions": [
        { "tagName": "arabica", "probability": 0.94 },
        { "tagName": "robusta", "probability": 0.04 },
        { "tagName": "neither", "probability": 0.02 }
      ]
    }
        │
        ▼ (HTTPS response back to browser)
        │
[11] frontend/js/script.js renders result:
     - Top prediction and confidence displayed
     - Bar chart of all three confidence scores
     - Entry saved to localStorage with thumbnail, timestamp, note
     - History table re-rendered
```

### 7.2 History Export Flow

```
[1] User clicks Export CSV
        │
        ▼
[2] script.js reads all entries from localStorage
        │
        ▼
[3] Converts to CSV rows:
    timestamp, top_prediction, top_confidence_percent,
    all_predictions, note, model_name, reported_model_accuracy
        │
        ▼
[4] Creates a Blob URL and triggers a browser download
    Filename: coffea-observations-YYYY-MM-DD.csv
        │
        ▼
[5] Blob URL is revoked immediately after download starts
```

---

## 8. Security Design

### 8.1 Threat Model

| Threat | Likelihood | Impact | Mitigation |
|---|---|---|---|
| API key exposed in browser | Medium | Low | Key only protects the proxy, not GCP credentials |
| Unauthorized use of Cloud Function | Medium | Medium | `X-Api-Key` header check on every request |
| GCP service account credentials leaked | Low | Critical | Credentials never leave the Cloud Function; ADC used |
| Malicious image upload | Low | Low | Image is passed directly to Vertex AI; no code execution |
| localStorage history tampered | Low | Low | Data is local only; no server-side state |

### 8.2 Credential Handling

- **GCP service account credentials** are never written anywhere. The Cloud Function uses **Application Default Credentials (ADC)** — GCP automatically injects the Compute service account identity at runtime. No key file is generated or stored.
- **The API key** (`X-Api-Key`) is a lightweight access control layer for the Cloud Function. It is stored in the browser's `localStorage` and in the Cloud Function as an environment variable. It is not a GCP credential and does not grant access to any GCP resource on its own.
- **The Vertex AI endpoint** is not publicly accessible — it requires a valid OAuth2 bearer token signed by a GCP service account that has `roles/aiplatform.user`. Only the Cloud Function holds that identity.

### 8.3 CORS Policy

The Cloud Function sets the following CORS headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, X-Api-Key
```

`Allow-Origin: *` is acceptable for a demo/MVP. For production, this should be restricted to the specific domain serving the webapp.

### 8.4 Known Limitations (MVP Acceptable)

- The API key is stored in `localStorage` (plaintext). For production, use a session token or OAuth login.
- The Cloud Function is deployed with `--allow-unauthenticated`, meaning anyone who discovers the URL can attempt to call it. The API key is the only barrier.
- No rate limiting is implemented. For production, add Cloud Armor or a simple request counter.

---

## 9. Performance Analysis

### 9.1 Latency Breakdown

| Step | Estimated Latency |
|---|---|
| Browser → Cloud Function (network) | 50–150 ms |
| Cloud Function cold start (first call) | 500 ms – 2 s |
| Cloud Function cold start (subsequent) | ~0 ms (warm) |
| OAuth2 token fetch (ADC) | 50–100 ms |
| Cloud Function → Vertex AI (network, same region) | 20–50 ms |
| Vertex AI AutoML inference | 150–400 ms |
| Vertex AI → Cloud Function → Browser | 30–80 ms |
| **Total (cold start)** | **~800 ms – 2.8 s** |
| **Total (warm)** | **~300 ms – 800 ms** |

Cloud Functions Gen 2 has significantly faster cold starts than Gen 1 due to its Cloud Run foundation.

### 9.2 Throughput

With 1 replica on `n1-standard-2`:
- Concurrent requests: 1 (sequential for this MVP)
- Sustained throughput: ~60–120 predictions/minute (warm)
- Sufficient for: individual field workers, classroom demos, small pilot groups

### 9.3 Image Size Impact

Larger images increase:
- Upload time from device to Cloud Function
- Base64 encoding time in the function
- Vertex AI inference time slightly

Recommended: resize images to under 1MB before sending. The browser does not currently do this automatically — a future improvement would be to resize on the client side using a canvas element before POSTing.

### 9.4 Model Accuracy

AutoML Vision with 8 node hours on a balanced 3-class dataset typically achieves:

| Metric | Expected Range |
|---|---|
| Precision (arabica) | 85–96% |
| Precision (robusta) | 85–96% |
| Precision (neither) | 90–98% |
| Overall mAP | 88–96% |

Actual accuracy depends heavily on dataset quality, image variety, and class balance.

---

## 10. Cost vs Performance Analysis

### 10.1 Cost Per Prediction

| Cost Component | Value |
|---|---|
| Vertex AI endpoint (idle) | $0.11/hour = $0.0000306/second |
| Per prediction inference cost | ~$0.0005–0.001 (compute time) |
| Cloud Function invocation | ~$0.0000004 per call |
| Network egress | Negligible |
| **Approximate cost per analysis** | **~$0.001 – $0.002** |

At 100 predictions/day: ~$0.10–0.20/day, or ~$3–6/month.

### 10.2 Cost Optimization Options

| Option | Saving | Trade-off |
|---|---|---|
| Delete endpoint when not in use | Eliminates idle cost ($0.11/hr) | Must redeploy to use again (~10 min) |
| Switch to `n1-standard-1` | ~40% cheaper | Slightly slower inference |
| Use Cloud Run min-instances=0 | No idle cost | Longer cold starts |
| Batch predictions (offline) | Up to 80% cheaper | No real-time results |

### 10.3 Value Assessment

For a student MVP / pilot deployment, the cost-to-value ratio is strongly positive:

- **$300 GCP free credits** covers months of operation including training
- **~$25–35 one-time training cost** produces a reusable model
- **~$3–6/month** operational cost is negligible for a research or pilot deployment
- The alternative (manual leaf identification by an expert) costs significantly more in time and labour per observation

---

## 11. SLA Considerations

### 11.1 GCP Service SLAs

| Service | Google's SLA |
|---|---|
| Cloud Functions | 99.5% monthly uptime |
| Vertex AI Online Prediction | 99.5% monthly uptime |
| Cloud Run (Gen 2 backend) | 99.95% monthly uptime |

### 11.2 Composite System SLA

The webapp requires all three services to be available simultaneously. The composite SLA is:

```
Composite SLA = Cloud Functions SLA × Vertex AI SLA
              = 0.995 × 0.995
              ≈ 99.0% monthly uptime
```

This translates to approximately **7.3 hours of potential downtime per month**, which is acceptable for an MVP or research tool but insufficient for a production agricultural system where real-time availability is critical.

### 11.3 Failure Modes and Degradation

| Failure | User Impact | Behaviour |
|---|---|---|
| Vertex AI endpoint down | Cannot analyze images | Red error message shown; logs still accessible |
| Cloud Function down | Cannot analyze images | Red error message shown; logs still accessible |
| No internet connection | Cannot analyze images | Red error message shown; previously saved logs still viewable |
| LocalStorage full | Cannot save new logs | App trims to last 50 entries automatically |

### 11.4 Recommendations for Production

If BeanChilling were to move beyond MVP to a real deployment:

1. **Increase replicas to 2** for basic redundancy and concurrent user support
2. **Add a custom domain** with HTTPS (Cloud Run supports this natively)
3. **Restrict CORS** to the production domain only
4. **Implement rate limiting** via Cloud Armor or a token bucket in the Cloud Function
5. **Replace localStorage** with Firestore for multi-device, multi-user history
6. **Add authentication** (Firebase Auth) so multiple farm workers can have separate accounts
7. **Automate endpoint lifecycle** — deploy at start of workday, shut down at end — to reduce idle costs

---

*Documentation prepared based on the full implementation session for BeanChilling MVP, May 2026.*
