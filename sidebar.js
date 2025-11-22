const API_KEY = CONFIG.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash-preview-09-2025'; // Reverted due to quota limits

// State
let chats = [];
let currentChatId = null;
let isHistoryOpen = false;

// DOM Elements
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');
const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
const newChatBtn = document.getElementById('newChatBtn');
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    loadChats();
    if (chats.length === 0) {
        createNewChat();
    } else {
        // Load the most recent chat
        switchChat(chats[0].id);
    }

    setupEventListeners();
    setupInputAutoResize();
});

// Event Listeners
function setupEventListeners() {
    toggleHistoryBtn.addEventListener('click', toggleHistory);
    newChatBtn.addEventListener('click', createNewChat);

    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
}

// Input Auto-Resize
function setupInputAutoResize() {
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if (this.value === '') {
            this.style.height = 'auto';
        }
    });
}

// History Management
function loadChats() {
    const storedChats = localStorage.getItem('gemini_chats');
    if (storedChats) {
        chats = JSON.parse(storedChats);
    }
}

function saveChats() {
    localStorage.setItem('gemini_chats', JSON.stringify(chats));
    renderHistory();
}

function createNewChat() {
    const newChat = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        lastUpdated: Date.now()
    };

    chats.unshift(newChat);
    currentChatId = newChat.id;
    saveChats();
    renderMessages();

    // Close drawer on mobile/small screens if needed, or just keep open
    if (window.innerWidth < 600) {
        isHistoryOpen = false;
        updateHistoryDrawerToggle();
    }
}

function deleteChat(e, chatId) {
    e.stopPropagation(); // Prevent switching to chat when clicking delete

    if (confirm('Delete this chat?')) {
        chats = chats.filter(c => c.id !== chatId);

        if (chats.length === 0) {
            createNewChat();
        } else if (currentChatId === chatId) {
            currentChatId = chats[0].id;
            renderMessages();
        }

        saveChats();
    }
}

function switchChat(chatId) {
    currentChatId = chatId;
    renderMessages();
    renderHistory(); // To update active state

    // Close drawer on mobile
    if (window.innerWidth < 600 && isHistoryOpen) {
        toggleHistory();
    }
}

function updateChatTitle(chatId, firstMessage) {
    const chat = chats.find(c => c.id === chatId);
    if (chat && chat.title === 'New Chat') {
        // Simple title generation: first 30 chars of message
        chat.title = firstMessage.substring(0, 30) + (firstMessage.length > 30 ? '...' : '');
        saveChats();
    }
}

// UI Rendering
function toggleHistory() {
    isHistoryOpen = !isHistoryOpen;
    updateHistoryDrawerToggle();
}

function updateHistoryDrawerToggle() {
    if (isHistoryOpen) {
        historyDrawer.classList.add('open');
    } else {
        historyDrawer.classList.remove('open');
    }
}

function renderHistory() {
    historyList.innerHTML = '';

    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.onclick = () => switchChat(chat.id);

        const titleSpan = document.createElement('span');
        titleSpan.textContent = chat.title;
        item.appendChild(titleSpan);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-chat-btn';
        deleteBtn.innerHTML = '&times;'; // Simple X icon
        deleteBtn.onclick = (e) => deleteChat(e, chat.id);
        item.appendChild(deleteBtn);

        historyList.appendChild(item);
    });
}

function renderMessages() {
    chatContainer.innerHTML = '';

    const currentChat = chats.find(c => c.id === currentChatId);
    if (!currentChat) return;

    if (currentChat.messages.length === 0) {
        chatContainer.innerHTML = `
            <div class="welcome-message">
                <div class="welcome-icon">✨</div>
                <h2>How can I help you today?</h2>
            </div>
        `;
        return;
    }

    currentChat.messages.forEach(msg => {
        appendMessageToUI(msg.role, msg.content);
    });

    scrollToBottom();
}

function appendMessageToUI(role, content, id = null) {
    // Remove welcome message if present
    const welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role.toLowerCase()}`;
    if (id) messageDiv.id = id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    if (role === 'System') {
        bubble.textContent = content; // System messages (like URL info)
        bubble.style.backgroundColor = 'transparent';
        bubble.style.color = '#888';
        bubble.style.fontSize = '12px';
        bubble.style.padding = '4px 12px';
    } else {
        // Parse Markdown
        bubble.innerHTML = marked.parse(content);
    }

    messageDiv.appendChild(bubble);
    chatContainer.appendChild(messageDiv);

    scrollToBottom();
}

function scrollToBottom() {
    chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Pending Action State
let pendingAction = null;

// Helper Functions for Intent
function isAffirmative(text) {
    return /^(yes|yeah|yep|sure|ok|okay|do it|go ahead|please do|yup|i would|yes please)$/i.test(text.trim());
}

function isNegative(text) {
    return /^(no|nah|nope|stop|cancel|don't|no thanks)$/i.test(text.trim());
}

// Detect Pending Action from AI Response
function detectPendingAction(aiText) {
    // Regex to capture various forms of offers to search
    // Matches:
    // "Would you like me to search for..."
    // "Should I check..."
    // "I can find that information for you with a quick search..."
    // "I can search for..."
    const searchRegex = /(?:would you like me to|should i|do you want me to|i can|i can certainly) (?:search|check|look up|find) (?:for )?(.+?)(\?|$|\.|,| with a quick search| if you'd like)/i;
    const match = aiText.match(searchRegex);

    if (match && match[1]) {
        let query = match[1].trim();
        // Clean up query common suffixes
        query = query.replace(/ for you$/i, '')
            .replace(/ with a quick search$/i, '')
            .replace(/ if you'd like$/i, '')
            .replace(/ that information$/i, '');

        // If the query is vague like "that" or "it", we might need to rely on the user's previous input or context.
        // But for now, let's try to capture the specific noun if possible.
        // If the regex captured "that information", it's not a good query.
        if (query.toLowerCase().includes('that information') || query.toLowerCase() === 'it' || query.toLowerCase() === 'that') {
            // Fallback: If the offer is vague ("I can find that"), we can't easily extract the query from the *answer*.
            // We might need to look at the *previous user message* or just set a generic "search" flag.
            // For this specific case "I can certainly find that information...", the "that information" refers to "Tesla headquarters".
            // A simple fix is to check if the query is too vague, and if so, use the *last user message* as the query context?
            // Or better: The AI usually repeats the topic.
            // Let's keep it simple: If vague, we might fail to extract a perfect query.
            // However, in the screenshot, the AI said: "It doesn't actually mention where Tesla's headquarters is located. I can certainly find that information..."
            // The regex might capture "that information". 
            // Let's refine the regex to capture the *intent* to search, even if the query is vague.
        }

        // Refined Regex for the specific case in the screenshot:
        // "I can certainly find that information for you with a quick search if you'd like!"
        // The regex above captures "that information".

        // If we capture "that information", we should probably use the *previous* user query if available?
        // Actually, if the user says "Yes", we can just send "Search for [Previous User Query]"?
        // Let's try to be smarter.

        pendingAction = {
            type: 'search_web',
            params: { query: query }
        };
        console.log('Pending Action Set:', pendingAction);
    } else {
        pendingAction = null;
    }
}

// Execute Pending Action
async function executePendingAction(action) {
    if (action.type === 'search_web') {
        let query = action.params.query;

        // Handle vague queries like "that information" or "it"
        const vagueTerms = ['that information', 'that', 'it', 'the info', 'this'];
        if (vagueTerms.includes(query.toLowerCase()) || query.length < 3) {
            // Fallback to the last user message if available
            // We need to find the last user message from the chat history
            const currentChat = chats.find(c => c.id === currentChatId);
            if (currentChat && currentChat.messages.length > 0) {
                // Find the last message that was from the User
                const lastUserMsg = [...currentChat.messages].reverse().find(m => m.role === 'User');
                if (lastUserMsg) {
                    query = lastUserMsg.content;
                    console.log('Refined vague query using history:', query);
                }
            }
        }

        appendMessageToUI('User', `Yes, search for "${query}"`); // Show confirmation

        // Trigger search via background script
        // We send the query as the question, but with a flag to force search
        await sendToAI(`Search for ${query}`, { forceSearchQuery: query });
    }
}

// Messaging Logic
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Check for Pending Action Interception
    if (pendingAction) {
        if (isAffirmative(text)) {
            const action = pendingAction;
            pendingAction = null; // Clear immediately
            await executePendingAction(action);
            return;
        } else if (isNegative(text)) {
            pendingAction = null;
            appendMessageToUI('User', text);
            setTimeout(() => appendMessageToUI('AI', "Okay, I won't do that."), 500);
            return;
        }
        // If ambiguous, fall through to normal sending but keep pendingAction? 
        // Prompt says: "Should NOT clear pendingAction" for unrelated questions.
        // But if we send a new request, the AI might change topic, so maybe we should clear it?
        // The prompt says "Should NOT clear pendingAction" for unrelated.
        // However, if the user asks a NEW question, the previous context might be lost.
        // For now, we'll keep it as per prompt instructions.
    }

    // Add user message
    const currentChat = chats.find(c => c.id === currentChatId);
    if (!currentChat) return;

    currentChat.messages.push({ role: 'User', content: text });
    currentChat.lastUpdated = Date.now();

    // Update title if needed
    updateChatTitle(currentChatId, text);

    saveChats();
    appendMessageToUI('User', text);

    await sendToAI(text);
}

async function sendToAI(text, options = {}) {
    const currentChat = chats.find(c => c.id === currentChatId);

    try {
        // Get Page Metadata
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        let metadata = { url: tab.url, title: tab.title };

        try {
            const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_CONTENT' });
            if (response && response.metadata) {
                metadata = response.metadata;
            }
        } catch (e) {
            console.log('Content script not ready or restricted page');
        }

        // Prepare History (Last 10 messages for context)
        // Map to OpenAI format { role: 'user'|'assistant', content: string }
        const history = currentChat.messages.slice(-10).map(m => ({
            role: m.role === 'User' ? 'user' : 'assistant',
            content: m.content
        }));

        // Send to Background
        // Show loading state
        const loadingId = 'loading-' + Date.now();
        appendMessageToUI('System', 'Thinking...', loadingId);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ASK_AI',
                apiKey: API_KEY,
                question: text,
                metadata: metadata,
                history: history
            });

            if (response.error) {
                appendMessageToUI('System', `Error: ${response.error}`);
            } else {
                const aiResponse = response.answer;
                currentChat.messages.push({ role: 'AI', content: aiResponse });
                saveChats();
                appendMessageToUI('AI', aiResponse);
            }
        } finally {
            // Always remove loading state, even if there's an error
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();
        }

    } catch (error) {
        console.error('Error sending message:', error);
        appendMessageToUI('System', 'Error communicating with AI.');
    }
}
