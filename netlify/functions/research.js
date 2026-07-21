exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { action, topic, keywords, websites } = JSON.parse(event.body);
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Missing API key' })
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

    const apiResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: 2000,
        messages: [{
          role: 'user',
          content: prompt
        }]
      })
    });

    if (!apiResponse.ok) {
      const err = await apiResponse.json();
      return {
        statusCode: apiResponse.status,
        body: JSON.stringify({ error: err.error?.message || 'API error' })
      };
    }

    const result = await apiResponse.json();
    const text = result.content[0]?.text;

    if (!text) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'No response from Claude' })
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
