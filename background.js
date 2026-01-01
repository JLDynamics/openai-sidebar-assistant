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
            request.history,
            request.attachment
        )
            .then(answer => sendResponse({ answer }))
            .catch(error => sendResponse({ error: error.message }));
        return true; // Will respond asynchronously
    }
});


// --- Grok uses native web search, no external search API needed ---

// --- OpenAI Integration ---

async function handleOpenAIRequest(apiKey, question, metadata, history, attachment) {
    const OPENROUTER_API_KEY = apiKey;
    if (!OPENROUTER_API_KEY) {
        throw new Error('API key missing. Please set OPENROUTER_API_KEY in config.js.');
    }

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
1. **Page Focus**: Use the provided webpage content (or video transcript, or PDF text) when the user is asking about the current page.
2. **Video Transcripts**: If the content is a "Video Transcript", treat it as the spoken content of the video. Summarize or answer questions based on what was said.
3. **PDF Documents**: If the content is "PDF Content", treat it as the text of the document. Answer questions based on the document text.
4. **Missing Info**: If the information is missing from the page (e.g. location, release date, price), AUTOMATICALLY use your web search capability.
5. **General Questions**: If the question is unrelated to the page (e.g. "weather", "general knowledge"), ignore the page content and use web search.
6. **No Hallucinations**: Always confirm facts using search if not in the page.
7. **Format**: Present answers in clear, well-structured language. If you used search, cite your sources naturally.
`;

    // 2. Prepare User Message (Multi-modal)
    let userContent = [];

    // Add text question (or default if only image sent)
    if (question) {
        userContent.push({ type: "text", text: question });
    } else if (attachment) {
        userContent.push({ type: "text", text: "Analyze this file." });
    }

    // Add Attachment Logic
    if (attachment) {
        if (attachment.type === 'image') {
            userContent.push({
                type: "image_url",
                image_url: {
                    url: attachment.content
                }
            });
        } else if (attachment.type === 'text') {
            const fileContext = `\n\n[Attached File: ${attachment.name}]\n${attachment.content}\n`;

            if (userContent.length > 0 && userContent[0].type === 'text') {
                userContent[0].text += fileContext;
            } else {
                userContent.push({ type: "text", text: fileContext });
            }
        }
    }

    // 3. Prepare Full Message Chain
    const messages = [
        { role: 'system', content: systemPrompt },
        ...history,
        { role: 'user', content: userContent }
    ];

    // 4. Make API Call with Native Web Search Enabled
    let data;
    try {
        const response = await fetch(url, {
            method: 'POST',
            cache: 'no-store',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                // OpenRouter requires one of these for browser-based requests
                'X-Title': 'Grok Sidebar Assistant',
                'HTTP-Referer': metadata?.url || 'https://grok-sidebar'
            },
            body: JSON.stringify({
                model: "x-ai/grok-4.1-fast",
                messages: messages,
                web_search_options: {},
                extra_body: {
                    reasoning: {
                        enabled: false
                    }
                },
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Request failed (${response.status}): ${errorText || response.statusText}`);
        }

        data = await response.json();
    } catch (err) {
        console.error('OpenRouter fetch error:', err);
        throw new Error(`Network error contacting OpenRouter: ${err.message}`);
    }

    if (data.error) throw new Error(data.error.message);
    if (!data.choices || data.choices.length === 0) {
        throw new Error('Invalid API response: Missing choices. Response: ' + JSON.stringify(data));
    }

    const message = data.choices[0].message;
    return message.content;
}
