const express = require('express');
const app = express();

app.use(express.json());

// Add CORS headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Supabase config
const SUPABASE_URL = 'https://atddexueqapijmevomam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0ZGRleHVlcWFwaWptZXZvbWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzIxNzIsImV4cCI6MjEwMDIwODE3Mn0.qCdUFLJuYhTSinVJ9v3h9-rmui3vOZmTn8w4Kdi9oVY';

// Get all websites from Supabase
app.get('/websites', async (req, res) => {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/websites`, {
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch websites' });
    }

    const websites = await response.json();
    return res.status(200).json({ websites });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Upload CSV to Supabase
app.post('/upload-websites', async (req, res) => {
  try {
    const { websites } = req.body;

    if (!Array.isArray(websites)) {
      return res.status(400).json({ error: 'websites must be an array' });
    }

    // Insert websites into Supabase
    const response = await fetch(`${SUPABASE_URL}/rest/v1/websites`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(websites),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.message || 'Failed to upload websites' });
    }

    return res.status(200).json({ message: `${websites.length} websites uploaded successfully` });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Research endpoint
app.post('/research', async (req, res) => {
  try {
    const { action, topic, keywords, websites } = req.body;
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing API key' });
    }

    let prompt = '';

    if (action === 'expandTopic') {
      prompt = `Topic: "${topic}"

Generate 8-12 relevant keywords for researching this topic on company websites.

Return ONLY a comma-separated list. Nothing else.`;
    } 
    else if (action === 'search') {
      const sites = websites.map(w => `${w.name} (${w.domain})`).join(', ');
      const keys = keywords.join(', ');

      prompt = `Search these websites for content related to: "${topic}"

Websites to search: ${sites}

Keywords to look for: ${keys}

IMPORTANT INSTRUCTIONS:
1. If relevant content is found, state what was found up front (e.g., "A white paper titled..." or "A product page titled...")
2. Extract a 1-3 sentence summary of the content
3. If the website alludes to the company being a leader or subject matter expert in data center engineering, start with "SME ALERT: DATA CENTER ENGINEERING" before the findings
4. Format findings as numbered list with specific document/page titles
5. Include reference numbers in brackets if citing specific sections

If the website alludes to expertise in data center engineering, liquid cooling, advanced thermal solutions, or similar areas, include SME ALERT at the top.

Format example:
SME ALERT: DATA CENTER ENGINEERING

1. A white paper titled "[Title]" was found. [1-3 sentence summary][1]
2. A product page titled "[Title]" was found. [1-3 sentence summary][2]

If no relevant information is found, respond ONLY with: No Updates Found`;
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: err.error?.message || 'Perplexity API error' });
    }

    const result = await response.json();
    const text = result.choices[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: 'No response from Perplexity' });
    }

    return res.status(200).json({ result: text });

  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
