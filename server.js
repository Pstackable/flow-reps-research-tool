const express = require('express');
const app = express();

app.use(express.json());

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

      prompt = `Topic: "${topic}"
Websites: ${sites}
Keywords: ${keys}

Search these websites for this topic. For each website provide:
1. Website Name
2. Findings (1-3 sentences) or "No Updates Found"
3. SME Alert (if applicable, format: "SME ALERT: EXPERTISE TYPE")`;
    }

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'pplx-7b-chat',
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
