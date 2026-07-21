const express = require('express');
const app = express();
app.use(express.json());
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const SUPABASE_URL = 'https://atddexueqapijmevomam.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF0ZGRleHVlcWFwaWptZXZvbWFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ2MzIxNzIsImV4cCI6MjEwMDIwODE3Mn0.qCdUFLJuYhTSinVJ9v3h9-rmui3vOZmTn8w4Kdi9oVY';
const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

const log = (type, msg) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${msg}`);
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

app.get('/health', (req, res) => {
  log('INFO', 'Health check');
  res.json({ status: 'ok', message: 'Server is running' });
});

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

async function callPerplexity(prompt) {
  if (!PERPLEXITY_API_KEY) throw new Error('Missing Perplexity API key');
  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [{ role: 'user', content: prompt }],
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

function parseResultForExcel(rawResult, website) {
  const lines = rawResult.split('\n').filter(line => line.trim());
  let companyName = website.name;
  let domain = website.domain;
  let summary = '';
  let citationLinks = '';

  for (const line of lines) {
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      if (parts.length >= 3) {
        companyName = parts[0] || website.name;
        domain = parts[1] || website.domain;
        summary = parts[2] || '';
        citationLinks = parts[3] || '';
        break;
      }
    }
  }

  if (!summary || summary.toLowerCase().includes('error')) {
    summary = rawResult.substring(0, 300);
  }

  return {
    companyName,
    domain,
    summary: summary.trim(),
    citationLinks: citationLinks.trim(),
    dateFound: new Date().toLocaleDateString(),
  };
}

async function saveSearchToSupabase(topic, keywords, websites, results) {
  try {
    log('INFO', 'Saving search results to Supabase');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/search_results`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        topic,
        keywords,
        websites_searched: websites.map(w => w.name),
        results_data: results,
        search_date: new Date().toISOString(),
      })
    });
    if (response.ok) {
      log('SUCCESS', 'Search results saved to Supabase');
    } else {
      log('WARNING', 'Failed to save results to Supabase');
    }
  } catch (error) {
    log('WARNING', `Error saving to Supabase: ${error.message}`);
  }
}

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

    if (action === 'expandTopic') {
      log('INFO', `Action: expandTopic`);
      log('INFO', `Topic: "${topic}"`);
      const prompt = `Generate 8-12 relevant keywords for researching this topic on company websites in the PVF (pipe, valves, fittings) industry and data center engineering.

Topic: "${topic}"

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
    else if (action === 'search') {
      log('INFO', `Action: search`);
      log('INFO', `Topic: "${topic}"`);
      log('INFO', `Keywords: ${keywords.join(', ')}`);
      log('INFO', `Websites: ${websites.length}`);

      if (!Array.isArray(websites) || websites.length === 0) {
        log('ERROR', 'No websites provided');
        return res.status(400).json({ error: 'No websites provided' });
      }

      const cappedWebsites = websites.slice(0, 10);
      const allResults = [];
      const keywordsList = keywords.join(', ');

      log('INFO', 'Starting individual website searches...');
      log('INFO', '='.repeat(70));

      for (let i = 0; i < cappedWebsites.length; i++) {
        const website = cappedWebsites[i];
        const progress = `[${i + 1}/${cappedWebsites.length}]`;
        log('INFO', `${progress} Searching: ${website.name} (${website.domain})`);

        try {
          const searchPrompt = `Search the website ${website.domain} for PDFs, white papers, technical blog posts, or product pages related to either of these topics:

Topic #1: Liquid Cooling for Data Centers
Keywords: "liquid-cooled servers," "direct-to-chip," "immersion cooling," "data center cooling systems," "AI GPU cooling," "TDP," "facility water system," "rear-door heat exchanger," "CDU," "dielectric fluid," "thermal ride-through," "sustainable data center"

Topic #2: Valve Usage in Modern Applications
Keywords: "quarter-turn valves," "ball valve," "butterfly valve," "plug valve," "globe valve," "needle valve," "gate valve," "pinch valve," "rotary valves," "valve control," "valve automation," "valves in data centers," "valve application case study," "valve case studies"

Instructions:
1. If relevant source found: State what was found first (e.g., "A white paper titled...")
2. Extract 1-3 sentence summary
3. If company is SME in data center engineering, START with: "SME ALERT: DATA CENTER ENGINEERING"
4. Format: Company Name | Domain | Summary | Links

If NO relevant information found, respond ONLY: No Updates Found

Do not include any other commentary.`;

          const text = await callPerplexity(searchPrompt);
          if (text && !text.toLowerCase().includes('no updates found')) {
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

        if (i < cappedWebsites.length - 1) {
          log('INFO', `${progress} Waiting 7 seconds before next search...`);
          await delay(7000);
        }
      }

      log('INFO', '='.repeat(70));
      log('SUCCESS', 'All searches complete');
      log('INFO', `Total results collected: ${allResults.length}`);

      const parsedResults = allResults.map((result, idx) => {
        return parseResultForExcel(result, cappedWebsites[idx]);
      });

      await saveSearchToSupabase(topic, keywords, cappedWebsites, parsedResults);

      return res.status(200).json({
        results: parsedResults,
        topic,
        keywords,
        searchDate: new Date().toLocaleDateString(),
      });
    }
    else {
      log('ERROR', `Unknown action: ${action}`);
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (error) {
    log('ERROR', `Research endpoint error: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  log('INFO', '='.repeat(70));
  log('INFO', `🚀 Server running on port ${PORT}`);
  log('INFO', `Environment: ${process.env.NODE_ENV || 'development'}`);
  log('INFO', `Perplexity API Key: ${PERPLEXITY_API_KEY ? '✓ Set' : '✗ Missing'}`);
  log('INFO', '='.repeat(70));
});
