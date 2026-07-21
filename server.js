const express = require('express');
const app = express();

app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Environment variables
const SUPABASE_URL = 'https://atddexueqapijmevomam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0ZGRleHVlcWFwaWptZXZvbWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzIxNzIsImV4cCI6MjEwMDIwODE3Mn0.qCdUFLJuYhTSinVJ9v3h9-rmui3vOZmTn8w4Kdi9oVY';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

// Logging helper
const log = (type, msg) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${msg}`);
};

// ============================================================================
// HEALTH CHECK
// ============================================================================
app.get('/health', (req, res) => {
  log('INFO', 'Health check');
  res.json({ status: 'ok', message: 'Server is running' });
});

// ============================================================================
// GET ALL WEBSITES FROM SUPABASE
// ============================================================================
app.get('/websites', async (req, res) => {
  log('INFO', 'Fetching websites from Supabase');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/websites?select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', `Supabase error: ${errorText}`);
      return res.status(response.status).json({ error: `Supabase error: ${errorText}` });
    }

    const websites = await response.json();
    log('SUCCESS', `Loaded ${websites.length} websites from Supabase`);
    return res.status(200).json({ websites });
  } catch (error) {
    log('ERROR', `Failed to fetch websites: ${error.message}`);
    return res.status(500).json({ error: `Server error: ${error.message}` });
  }
});

// ============================================================================
// GET SAVED WEBSITE LISTS
// ============================================================================
app.get('/saved-lists', async (req, res) => {
  log('INFO', 'Fetching saved website lists');
  
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/website_lists?select=*`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      log('INFO', 'No saved lists found');
      return res.status(200).json({ lists: [] });
    }

    const lists = await response.json();
    log('SUCCESS', `Loaded ${lists.length} saved lists`);
    return res.status(200).json({ lists });
  } catch (error) {
    log('ERROR', `Failed to fetch saved lists: ${error.message}`);
    return res.status(200).json({ lists: [] });
  }
});

// ============================================================================
// SAVE A WEBSITE LIST
// ============================================================================
app.post('/save-list', async (req, res) => {
  log('INFO', 'Saving website list');
  
  try {
    const { name, websites } = req.body;

    if (!name || !Array.isArray(websites)) {
      log('ERROR', 'Invalid request body for save-list');
      return res.status(400).json({ error: 'Invalid request: need name and websites array' });
    }

    log('INFO', `Saving list "${name}" with ${websites.length} websites`);

    const response = await fetch(`${SUPABASE_URL}/rest/v1/website_lists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        name,
        websites,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('ERROR', `Supabase save error: ${errorText}`);
      return res.status(response.status).json({ error: errorText });
    }

    log('SUCCESS', `List "${name}" saved successfully`);
    return res.status(200).json({ message: 'List saved successfully' });
  } catch (error) {
    log('ERROR', `Failed to save list: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// RESEARCH ENDPOINT - THE MAIN LOGIC
// ============================================================================
app.post('/research', async (req, res) => {
  log('INFO', 'Research request received');
  
  try {
    const { action, topic, keywords, websites } = req.body;

    if (!PERPLEXITY_API_KEY) {
      log('ERROR', 'PERPLEXITY_API_KEY not set in environment');
      return res.status(500).json({ error: 'Missing Perplexity API key' });
    }

    let prompt = '';

    // ========================================================================
    // ACTION 1: EXPAND TOPIC INTO KEYWORDS
    // ========================================================================
    if (action === 'expandTopic') {
      log('INFO', `Expanding topic: "${topic}"`);
      
      prompt = `Topic: "${topic}"

Generate 8-12 relevant keywords for researching this topic on company websites.

Return ONLY a comma-separated list. Nothing else.`;
    } 

    // ========================================================================
    // ACTION 2: SEARCH WEBSITES FOR TOPIC
    // ========================================================================
    else if (action === 'search') {
      log('INFO', `Searching ${websites.length} websites for topic: "${topic}"`);
      log('INFO', `Keywords: ${keywords.join(', ')}`);
      
      if (!Array.isArray(websites) || websites.length === 0) {
        log('ERROR', 'No websites provided');
        return res.status(400).json({ error: 'No websites provided' });
      }

      // Build the site: queries for Perplexity to search
      const siteQueries = websites.map(w => `site:${w.domain}`).join(' OR ');
      const domainsList = websites.map(w => w.domain).join(', ');
      const companyList = websites.map(w => `${w.name} (${w.domain})`).join('\n');
      const keywordsList = keywords.join(', ');

      log('INFO', `Building search prompt for domains: ${domainsList}`);

      prompt = `You are a research assistant. Search the following company websites for information related to: "${topic}"

WEBSITES TO SEARCH:
${companyList}

SEARCH QUERIES TO USE:
${siteQueries}

KEYWORDS TO LOOK FOR:
${keywordsList}

INSTRUCTIONS:
1. Use the site: queries above to force searching on those specific domains only
2. For each website, search for content related to "${topic}" and the keywords listed
3. Report findings from each domain separately
4. For each company, provide:
   - Company Name and Domain
   - 1-3 sentence summary of what was found
   - If data center engineering content is found, start with "SME ALERT: DATA CENTER ENGINEERING"
   - Reference links if available

FORMAT YOUR RESPONSE AS:
COMPANY NAME | DOMAIN | SUMMARY | REFERENCES

CRITICAL: If NO relevant information is found on ANY of the websites, respond ONLY with: "No Updates Found"

Do NOT use your training data. Only report what you find by searching these specific domains.`;

      log('INFO', 'Prompt built, sending to Perplexity');
    }

    // ========================================================================
    // CALL PERPLEXITY API
    // ========================================================================
    log('INFO', `Calling Perplexity API with model: sonar-pro`);
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [{
          role: 'user',
          content: prompt
        }],
        max_tokens: 4000,
        temperature: 0.7,
      })
    });

    if (!response.ok) {
      const err = await response.json();
      log('ERROR', `Perplexity API error: ${err.error?.message || response.statusText}`);
      return res.status(response.status).json({ 
        error: err.error?.message || 'Perplexity API error' 
      });
    }

    const result = await response.json();
    const text = result.choices[0]?.message?.content;

    if (!text) {
      log('ERROR', 'No response content from Perplexity');
      return res.status(500).json({ error: 'No response from Perplexity' });
    }

    log('SUCCESS', `Got response from Perplexity (${text.length} characters)`);
    log('INFO', `Response preview: ${text.substring(0, 100)}...`);

    return res.status(200).json({ result: text });

  } catch (error) {
    log('ERROR', `Research endpoint error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// START SERVER
// ============================================================================
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  log('INFO', `🚀 Server running on port ${PORT}`);
  log('INFO', `Environment: ${process.env.NODE_ENV || 'development'}`);
  log('INFO', `Perplexity API Key: ${PERPLEXITY_API_KEY ? '✓ Set' : '✗ Missing'}`);
});
