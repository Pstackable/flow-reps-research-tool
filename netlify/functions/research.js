exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { action, topic, keywords, websites } = JSON.parse(event.body);
    const apiKey = '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';

    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Missing Perplexity API key' })
      };
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
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: err.error?.message || 'Perplexity API error' })
      };
    }

    const result = await response.json();
    const text = result.choices[0]?.message?.content;

    if (!text) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No response from Perplexity' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ result: text })
    };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
