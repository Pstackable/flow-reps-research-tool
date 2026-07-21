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

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Get all websites from Supabase
app.get('/websites', async (req, res) => {
  try {
    console.log('Fetching websites from Supabase...');
    
    const response = await fetch(`${SUPABASE_URL}/rest/v1/websites?select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    });

    console.log('Supabase response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Supabase error:', errorText);
      return res.status(response.status).json({ error: `Supabase error: ${errorText}` });
    }

    const websites = await response.json();
    console.log('Fetched', websites.length, 'websites');
    return res.status(200).json({ websites });
  } catch (error) {
    console.error('Error fetching websites:', error.message);
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

// Upload websites to Supabase
app.post('/upload-websites', async (req, res) => {
  try {
    const { websites } = req.body;

    if (!Array.isArray(websites)) {
      return res.status(400).json({ error: 'websites must be an array' });
    }

    const response = await fetch(`${SUPABASE_URL}/rest/v1/websites`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify(websites),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Upload error:', errorText);
      return res.status(response.status).json({ error: errorText });
    }

    return res.status(200).json({ message: `${websites.length} websites uploaded successfully` });
  } catch (error) {
    console.error('Upload error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Research endpoint
app.post('/research', async (req, res) => {
  try {
    const { action, topic, keywords, websites } = req.body;
    const apiKey = process.env.PERPLEXITY_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing Perplexity API key' });
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
1. If relevant content is found, state what was found up front
2. Extract a 1-3 sentence summary
3. If the website alludes to expertise in data center engineering, start with "SME ALERT: DATA CENTER ENGINEERING"
4. Format findings as numbered list
5. Include reference numbers in brackets

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
    console.error('Research error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
