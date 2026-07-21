exports.handler = async (event) => {
  console.log('Function called');
  
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      body: JSON.stringify({ error: 'Method Not Allowed' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, topic, keywords, websites } = body;

    const apiKey = process.env.CLAUDE_API_KEY;

    if (!apiKey) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'API key not configured' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    let prompt = '';

    if (action === 'expandTopic') {
      prompt = `For the research topic: "${topic}"

Generate a list of 8-12 relevant keywords that could be searched on company websites. These should include both exact keywords and semantic variations.

Return ONLY a comma-separated list of keywords, nothing else.`;
    } 
    else if (action === 'search') {
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
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2024-12-01',
      },
      body: JSON.stringify({
        model: 'claude-opus-4-6',
        max_tokens: action === 'expandTopic' ? 500 : 2000,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
      }),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorData = await response.json();
      console.error('API Error:', errorData);
      
      return { 
        statusCode: response.status, 
        body: JSON.stringify({ 
          error: errorData.error?.message || 'Claude API failed',
          details: errorData
        }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    const data = await response.json();

    if (!data.content || !data.content[0]) {
      return { 
        statusCode: 500, 
        body: JSON.stringify({ error: 'Invalid response from Claude API' }),
        headers: { 'Content-Type': 'application/json' }
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ result: data.content[0].text }),
      headers: { 'Content-Type': 'application/json' }
    };

  } catch (error) {
    console.error('Error:', error);
    
    return { 
      statusCode: 500, 
      body: JSON.stringify({ 
        error: error.message
      }),
      headers: { 'Content-Type': 'application/json' }
    };
  }
};
