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

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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
// CALL PERPLEXITY API - HELPER FUNCTION
// ============================================================================
async function callPerplexity(prompt) {
  if (!PERPLEXITY_API_KEY) {
    throw new Error('Missing Perplexity API key');
  }

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
      max_tokens: 2000,
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || response.statusText);
  }

  const result = await response.json();
  return result.choices[0]?.message?.content;
}

// ============================================================================
// RESEARCH ENDPOINT - MAIN LOGIC
// ============================================================================
app.post('/research', async (req, res) => {
  log('INFO', '='.repeat(70));
  log('INFO', 'Research request received');
  log('INFO', '='.repeat(70));
  
  try {
    const { action, topic, keywords, websites } = req.body;

    if (!PERPLEXITY_API_KEY) {
      log('ERROR', 'PERPLEXITY_API_KEY not set in environment');
      return res.status(500).json({ error: 'Missing Perplexity API key' });
    }

    // ========================================================================
    // ACTION 1: EXPAND TOPIC INTO KEYWORDS
    // ========================================================================
    if (action === 'expandTopic') {
      log('INFO', `Action: expandTopic`);
      log('INFO', `Topic: "${topic}"`);
      
      const prompt = `Topic: "${topic}"

Generate 8-12 relevant keywords for researching this topic on company websites.

Return ONLY a comma-separated list. Nothing else.`;

      try {
        const text = await callPerplexity(prompt);
        log('SUCCESS', `Keywords generated: ${text}`);
        return res.status(200).json({ result: text });
      } catch (error) {
        log('ERROR', `Perplexity error: ${error.message}`);
        return res.status(500).json({ error: error.message });
      }
    }

    // ========================================================================
    // ACTION 2: SEARCH EACH WEBSITE INDIVIDUALLY
    // ========================================================================
    else if (action === 'search') {
      log('INFO', `Action: search`);
      log('INFO', `Topic: "${topic}"`);
      log('INFO', `Keywords: ${keywords.join(', ')}`);
      log('INFO', `Websites: ${websites.length}`);
      
      if (!Array.isArray(websites) || websites.length === 0) {
        log('ERROR', 'No websites provided');
        return res.status(400).json({ error: 'No websites provided' });
      }

      const allResults = [];
      const keywordsList = keywords.join(', ');

      log('INFO', 'Starting individual website searches...');
      log('INFO', '='.repeat(70));

      // Search each website one at a time
      for (let i = 0; i < websites.length; i++) {
        const website = websites[i];
        const progress = `[${i + 1}/${websites.length}]`;
        
        log('INFO', `${progress} Searching: ${website.name} (${website.domain})`);

        try {
          const searchPrompt = `Search the website ${website.domain} for information about: "${topic}"

Company Name: ${website.name}
Website Domain: ${website.domain}

Keywords to search for: ${keywordsList}

Your task:
1. Search this specific website for content related to "${topic}"
2. Look for the keywords mentioned
3. Provide findings in this format:

${website.name} | ${website.domain} | [1-3 sentence summary of what you found] | [reference links if available]

Important:
- If you find data center engineering content, start the summary with "SME ALERT: DATA CENTER ENGINEERING"
- Be specific about what you found
- Include direct quotes or specific details
- If nothing relevant found, respond: "${website.name} | ${website.domain} | No relevant content found | N/A"

Search now and report findings:`;

          const text = await callPerplexity(searchPrompt);
          
          if (text && !text.toLowerCase().includes('no relevant content')) {
            log('SUCCESS', `${progress} Found content for ${website.name}`);
            allResults.push(text);
          } else {
            log('INFO', `${progress} No content found for ${website.name}`);
            allResults.push(`${website.name} | ${website.domain} | No relevant content found | N/A`);
          }

        } catch (error) {
          log('ERROR', `${progress} Error searching ${website.name}: ${error.message}`);
          allResults.push(`${website.name} | ${website.domain} | Search error: ${error.message} | N/A`);
        }

        // Delay before next request (500ms) to avoid rate limiting
        if (i < websites.length - 1) {
          log('INFO', `${progress} Waiting 500ms before next search...`);
          await delay(500);
        }
      }

      log('INFO', '='.repeat(70));
      log('SUCCESS', 'All searches complete');
      log('INFO', `Total results collected: ${allResults.length}`);

      const finalResult = allResults.join('\n\n---\n\n');

      return res.status(200).json({ result: finalResult });
    }

    // If neither action is recognized
    else {
      log('ERROR', `Unknown action: ${action}`);
      return res.status(400).json({ error: 'Unknown action' });
    }

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
  log('INFO', '='.repeat(70));
  log('INFO', `🚀 Server running on port ${PORT}`);
  log('INFO', `Environment: ${process.env.NODE_ENV || 'development'}`);
  log('INFO', `Perplexity API Key: ${PERPLEXITY_API_KEY ? '✓ Set' : '✗ Missing'}`);
  log('INFO', '='.repeat(70));
});
