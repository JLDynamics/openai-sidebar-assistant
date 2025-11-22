importScripts('config.js');

chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ASK_AI') {
        handleOpenAIRequest(
            request.apiKey,
            request.question,
            request.metadata,
            request.history
        )
            .then(answer => sendResponse({ answer }))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Will respond asynchronously
    }
});


// --- Grok uses native web search, no external search API needed ---

// --- OpenAI Integration ---

async function handleOpenAIRequest(apiKey, question, metadata, history) {
    const OPENAI_API_KEY = CONFIG.OPENAI_API_KEY;
    // Use OpenRouter API endpoint
    const url = 'https://openrouter.ai/api/v1/chat/completions';

    // 1. Prepare Context
    const MAX_CONTEXT_LENGTH = 15000;
    const truncatedContent = metadata.mainContent ? metadata.mainContent.substring(0, MAX_CONTEXT_LENGTH) : "No content available.";

    const systemPrompt = `You are a smart, helpful assistant with full browsing ability using web search.
    
[CURRENT PAGE CONTEXT]
URL: ${metadata.url}
Title: ${metadata.pageTitle}
Content: ${truncatedContent}

[INSTRUCTIONS]
1. **Page Focus**: Use the provided webpage content when the user is asking about the current page.
2. **Missing Info**: If the information is missing from the page (e.g. location, release date, price), AUTOMATICALLY use your web search capability.
3. **General Questions**: If the question is unrelated to the page (e.g. "weather", "general knowledge"), ignore the page content and use web search.
4. **No Hallucinations**: Always confirm facts using search if not in the page.
5. **Format**: Present answers in clear, well-structured language. If you used search, cite your sources naturally.
`;

    // 2. Prepare Messages
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: question }
    ];

    // 3. Make API Call with Native Web Search Enabled
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: "x-ai/grok-4.1-fast:free",
            messages: messages,
            web_search_options: {}, // Enable Grok's native web search
            extra_body: {
                reasoning: {
                    enabled: false // Disable reasoning for faster responses
                }
            }
        })
    });

    const data = await response.json();

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || data.choices.length === 0) {
        throw new Error('Invalid API response: Missing choices. Response: ' + JSON.stringify(data));
    }

    const message = data.choices[0].message;
    return message.content;
}
