const functions = require('@google-cloud/functions-framework');
const { GoogleAuth } = require('google-auth-library');

const auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});

functions.http('predict', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  const apiKey = process.env.API_KEY;
  if (apiKey && req.headers['x-api-key'] !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const PROJECT_ID  = process.env.PROJECT_ID || 'beanchilling';
    const ENDPOINT_ID = process.env.ENDPOINT_ID || '5388988512462700544';
    const LOCATION    = process.env.LOCATION || 'us-central1';

    if (!PROJECT_ID || !ENDPOINT_ID) {
      res.status(500).json({ error: 'Missing PROJECT_ID or ENDPOINT_ID env vars' });
      return;
    }

    const client = await auth.getClient();
    const tokenData = await client.getAccessToken();
    const token = tokenData.token;

    const imageBase64 = req.rawBody.toString('base64');

    const vertexUrl = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/endpoints/${ENDPOINT_ID}:predict`;

    const vertexRes = await fetch(vertexUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        instances: [{ content: imageBase64 }]
      })
    });

    if (!vertexRes.ok) {
      const text = await vertexRes.text();
      throw new Error(`Vertex AI ${vertexRes.status}: ${text}`);
    }

    const data = await vertexRes.json();

    const pred = data.predictions[0];
    const predictions = pred.displayNames.map((name, i) => ({
      tagName: name,
      probability: pred.confidences[i]
    })).sort((a, b) => b.probability - a.probability);

    res.json({ predictions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});
