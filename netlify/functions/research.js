exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { action, topic, keywords, websites } = JSON.parse(event.body);
    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'API key not configured' }) };
    }

    let prompt = '';

    if (action === 'expandTopic') {
      prompt = `For the research topic: "${topic}"

Generate a list of 8-12 relevant keywords that could be searched on company websites. These should include both exact keywords and semantic variations.

Return ONLY a comma-separated list of keywords, nothing else.`;
    } else if (action === 'search') {
      const websiteList = websites.map(w => `${w.name} (${w.domain})`).join(', ');
      const keywordString = keywords.join(', ');

      prompt = `Search the following websites for content related to: "${topic}"

Websites to search: ${websiteList}

Keywords to look for: ${keywordString}

For each website, provide findings in this format:

1. [Website Name]
   - If relevant content found: Brief 1-3 sentence summary of what was found
   - If no relevant content: "No Updates Found"
   - Include any SME alerts if the company appears to be a subject matter expert in this area

Format SME alerts like: "SME ALERT: [EXPERTISE TYPE]"

Be thorough but concise.`;
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: action === 'expandTopic' ? 500 : 2000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { statusCode: response.status, body: JSON.stringify(error) };
    }

    const data = await response.json();

ls -la netlify/functions/
