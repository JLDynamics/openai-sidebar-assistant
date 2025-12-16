const API_KEY = CONFIG.OPENROUTER_API_KEY;

// State
let chats = [];
let currentChatId = null;
let isHistoryOpen = false;

// PDF.js Worker Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';

// DOM Elements
const historyDrawer = document.getElementById('historyDrawer');
const historyList = document.getElementById('historyList');
const toggleHistoryBtn = document.getElementById('toggleHistoryBtn');
const historyCloseBtn = document.getElementById('historyCloseBtn');
const historyOverlay = document.getElementById('historyOverlay');
const newChatBtn = document.getElementById('newChatBtn');
const chatContainer = document.getElementById('chatContainer');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const imagePreviewContainer = document.getElementById('imagePreviewContainer');
const dragDropOverlay = document.getElementById('dragDropOverlay');
const inputContainer = document.getElementById('inputContainer');
const lightbox = document.getElementById('lightbox');
const lightboxImg = document.getElementById('lightboxImg');
const lightboxClose = document.querySelector('.lightbox-close');

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

// TTS Initialization
const tts = new GeminiTTS(CONFIG.GEMINI_TTS_API_KEY);

// Event Listeners
function setupEventListeners() {
    toggleHistoryBtn.addEventListener('click', toggleHistory);
    historyCloseBtn.addEventListener('click', toggleHistory); // Close from inside drawer
    historyOverlay.addEventListener('click', toggleHistory); // Close by clicking outside
    newChatBtn.addEventListener('click', createNewChat);

    sendBtn.addEventListener('click', sendMessage);

    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // File Upload (Click)
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', handleFileSelection);

    // Paste Support
    chatInput.addEventListener('paste', handlePaste);

    // Drag & Drop Support
    setupDragAndDrop();

    // Lightbox Controls
    lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
        if (e.target !== lightboxImg) closeLightbox();
    });

    // Delegate click for zoomable images
    chatContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('sent-image')) {
            openLightbox(e.target.src);
        }
    });
}

// Lightbox Logic
function openLightbox(src) {
    lightboxImg.src = src;
    lightbox.classList.add('active');
}

function closeLightbox() {
    lightbox.classList.remove('active');
    lightboxImg.src = '';
}

// Drag & Drop Logic
function setupDragAndDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        inputContainer.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    inputContainer.addEventListener('dragenter', highlight, false);
    inputContainer.addEventListener('dragover', highlight, false);
    inputContainer.addEventListener('dragleave', unhighlight, false);
    inputContainer.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight() {
    inputContainer.classList.add('drag-over');
    dragDropOverlay.classList.add('active');
}

function unhighlight() {
    inputContainer.classList.remove('drag-over');
    dragDropOverlay.classList.remove('active');
}

function handleDrop(e) {
    unhighlight();
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        processFile(files[0]);
    }
}

// Paste Logic
function handlePaste(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (const item of items) {
        if (item.kind === 'file') {
            const file = item.getAsFile();
            processFile(file);
        }
    }
}

// File Processing
function processFile(file) {
    // Re-use existing handleFileSelection logic by mocking event or extracting core logic
    // Refactoring handleFileSelection to processFileCore to share logic
    const mockEvent = { target: { files: [file] } };
    handleFileSelection(mockEvent);
}

// Input Auto-Resize
function setupInputAutoResize() {
    chatInput.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px'; // No max-height limit? CSS handles it? 
        if (this.value === '') {
            this.style.height = 'auto'; // Reset min h
        }
    });
}

// File Handling
async function handleFileSelection(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Reset current attachment
    currentAttachment = null;

    try {
        if (file.type.startsWith('image/')) {
            const base64 = await convertFileToBase64(file);
            currentAttachment = {
                type: 'image',
                content: base64,
                name: file.name
            };
        } else if (file.type === 'application/pdf') {
            // PDF handling
            const text = await extractTextFromPDF(file);
            currentAttachment = {
                type: 'text',
                content: text,
                name: file.name
            };
        } else {
            // Text/Code handling
            const text = await readFileAsText(file);
            currentAttachment = {
                type: 'text',
                content: text,
                name: file.name
            };
        }
        renderPreview();
    } catch (e) {
        console.error('File read error:', e);
        alert('Error reading file: ' + e.message);
    }

    // Reset input so same file can be selected again
    fileInput.value = '';
}

async function playTTS(text) {
    if (!text) return;

    // Wake up audio engine immediately on interaction
    await tts.prepare();

    const btn = document.querySelector('.speak-btn[data-playing="true"]');
    if (btn) btn.setAttribute('data-playing', 'false'); // Reset others

    try {
        await tts.generateSpeech(text);
        const audioBuffer = await tts.generateSpeech(text);
        tts.play(audioBuffer, () => {
            // On ended
            const activeBtn = document.querySelector(`.speak-btn[data-text="${text.substring(0, 20)}..."]`); // Simplified selector logic
            // In reality, we passed the button or managed state differently. 
            // We'll rely on the existing UI toggle if it was working, or add one.
        });
    } catch (e) {
        console.error("TTS Error", e);
        alert("Failed to play audio: " + e.message);
    }
}

function convertFileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
        reader.readAsText(file);
    });
}

async function extractTextFromPDF(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += pageText + '\n\n';
    }
    return fullText;
}

function renderPreview() {
    if (!currentAttachment) {
        imagePreviewContainer.style.display = 'none';
        imagePreviewContainer.innerHTML = '';
        return;
    }

    imagePreviewContainer.style.display = 'flex';
    imagePreviewContainer.innerHTML = '';

    const item = document.createElement('div');
    item.className = 'preview-item';

    if (currentAttachment.type === 'image') {
        const img = document.createElement('img');
        img.src = currentAttachment.content;
        item.appendChild(img);
    } else {
        const icon = document.createElement('div');
        icon.className = 'file-icon';
        icon.textContent = '📄'; // Generic doc icon
        item.appendChild(icon);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'preview-remove-btn';
    removeBtn.innerHTML = '&times;';
    removeBtn.onclick = () => {
        currentAttachment = null;
        renderPreview();
    };

    item.appendChild(removeBtn);
    imagePreviewContainer.appendChild(item);
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
        if (historyOverlay) historyOverlay.classList.add('open');
    } else {
        historyDrawer.classList.remove('open');
        if (historyOverlay) historyOverlay.classList.remove('open');
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
                <h2>How can Grok help you today?</h2>
            </div>
        `;
        return;
    }

    currentChat.messages.forEach(msg => {
        appendMessageToUI(msg.role, msg.content);
    });

    scrollToBottom();
}

function appendMessageToUI(role, content, id = null, attachment = null) {
    // Remove welcome message if present
    const welcome = chatContainer.querySelector('.welcome-message');
    if (welcome) welcome.remove();

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role.toLowerCase()}`;
    if (id) messageDiv.id = id;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    // Display Attachment if present (User only usually)
    if (attachment && attachment.type === 'image') {
        const img = document.createElement('img');
        img.src = attachment.content;
        img.className = 'sent-image';
        bubble.appendChild(img);
    }

    // Display Text Content
    if (content) {
        if (role === 'System') {
            bubble.textContent = content; // System messages (like URL info)
            bubble.style.backgroundColor = 'transparent';
            bubble.style.color = '#888';
            bubble.style.fontSize = '12px';
            bubble.style.padding = '4px 12px';
        } else {
            // Parse Markdown
            let parsedContent = marked.parse(content);

            // Code Block Injection for Copy Button
            // We use a temporary div to manipulate the HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = parsedContent;

            const preTags = tempDiv.querySelectorAll('pre');
            preTags.forEach(pre => {
                const codeContent = pre.innerText; // Get raw code

                // Create Wrapper
                const wrapper = document.createElement('div');
                wrapper.className = 'code-wrapper';

                // Create Header
                const header = document.createElement('div');
                header.className = 'code-header';
                header.innerHTML = `
                    <span class="code-lang">Code</span>
                    <button class="copy-btn" onclick="copyToClipboard(this)">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                        Copy
                    </button>
                `;

                // Wrap existing pre
                const newPre = pre.cloneNode(true);
                // Hide the original data property for potential recovery if needed, but innerText works
                newPre.dataset.code = codeContent;

                wrapper.appendChild(header);
                wrapper.appendChild(newPre);

                pre.replaceWith(wrapper);
            });

            // Append parsed text content after any images
            const textDiv = document.createElement('div');
            textDiv.innerHTML = tempDiv.innerHTML;
            bubble.appendChild(textDiv);
        }
    }

    messageDiv.appendChild(bubble);

    // Add Actions (Copy + TTS) for AI messages
    if (role === 'AI') {
        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'message-actions';

        // 1. Copy Button
        const copyMsgBtn = document.createElement('button');
        copyMsgBtn.className = 'action-btn copy-msg-btn';
        copyMsgBtn.title = 'Copy Message';
        copyMsgBtn.innerHTML = `
             <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
        `;
        copyMsgBtn.onclick = () => copyTextToClipboard(content, copyMsgBtn);

        // 2. TTS Button
        const ttsBtn = document.createElement('button');
        ttsBtn.className = 'action-btn tts-btn';
        ttsBtn.title = 'Read aloud';
        ttsBtn.innerHTML = `
            <span class="tts-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
            </span>
            <span class="tts-spinner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                </svg>
            </span>
        `;

        ttsBtn.onclick = async () => {
            if (ttsBtn.classList.contains('playing')) {
                tts.stop();
                ttsBtn.classList.remove('playing');
                ttsBtn.innerHTML = `
                    <span class="tts-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    </span>
                    <span class="tts-spinner">
                       <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
                        </svg>
                    </span>
                `;
            } else {
                // Wake up audio engine immediately on interaction
                await tts.prepare();

                // Stop any other buttons
                document.querySelectorAll('.tts-btn.playing').forEach(btn => {
                    btn.classList.remove('playing');
                    // Reset icon
                    btn.querySelector('.tts-icon').innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                        </svg>
                    `;
                });

                ttsBtn.classList.add('loading');

                try {
                    // Strip markdown for cleaner speech (basic)
                    // The tts model handles some markdown, but cleaning simple stuff helps.
                    // For now pass raw content, Gemini TTS is smart.

                    const audioBuffer = await tts.generateSpeech(content);

                    ttsBtn.classList.remove('loading');
                    ttsBtn.classList.add('playing');

                    // Change icon to Stop
                    ttsBtn.querySelector('.tts-icon').innerHTML = `
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                             <rect x="6" y="4" width="4" height="16"></rect>
                             <rect x="14" y="4" width="4" height="16"></rect>
                        </svg>
                    `;

                    tts.play(audioBuffer, () => {
                        ttsBtn.classList.remove('playing');
                        // Reset icon to Play
                        ttsBtn.querySelector('.tts-icon').innerHTML = `
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                            </svg>
                        `;
                    });
                } catch (e) {
                    console.error(e);
                    ttsBtn.classList.remove('loading');
                    // Show error state briefly
                    ttsBtn.style.color = '#ef4444';
                    setTimeout(() => ttsBtn.style.color = '', 2000);
                }
            }
        };

        actionsDiv.appendChild(copyMsgBtn);
        actionsDiv.appendChild(ttsBtn);
        messageDiv.appendChild(actionsDiv);
    }

    chatContainer.appendChild(messageDiv);

    scrollToBottom();
}

// Global Copy Function
window.copyToClipboard = function (btn) {
    const wrapper = btn.closest('.code-wrapper');
    const pre = wrapper.querySelector('pre');
    const code = pre.innerText;

    navigator.clipboard.writeText(code).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            Copied!
        `;
        btn.classList.add('copied');

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy class: ', err);
    });
};

// Helper for copying raw text
function copyTextToClipboard(text, btn) {
    navigator.clipboard.writeText(text).then(() => {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
        `;
        btn.classList.add('copied');

        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.remove('copied');
        }, 2000);
    }).catch(console.error);
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
    if (!text && !currentAttachment) return;

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Capture attachment and clear state
    const attachment = currentAttachment;
    currentAttachment = null;
    renderPreview();

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
    }

    // Add user message to state
    const currentChat = chats.find(c => c.id === currentChatId);
    if (!currentChat) return;

    // Store message in history (simplified for storage)
    // If it's a file content, we might append it to text or just store metadata?
    // For simplicity, if it's text file, append to content. If image, store separately or as base64?
    // Storing large base64 in local storage is risky (quota). 
    // Let's truncate image for history or just mark it.
    // For now, valid JSON history is crucial.

    let storedContent = text;
    if (attachment) {
        if (attachment.type === 'text') {
            storedContent += `\n\n[File: ${attachment.name}]\n${attachment.content}`;
        } else {
            // Image: For now, we won't store large base64 in localStorage history to avoid quota issues quickly.
            // We'll just note it.
            storedContent += `\n\n[Uploaded Image: ${attachment.name}]`;
        }
    }

    currentChat.messages.push({ role: 'User', content: storedContent });
    currentChat.lastUpdated = Date.now();

    // Update title if needed
    updateChatTitle(currentChatId, text || "File Upload");

    saveChats();

    // UI Display
    appendMessageToUI('User', text, null, attachment);

    // Send payload
    await sendToAI(text, { attachment });
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
        const history = currentChat.messages.slice(-10).map(m => ({
            role: m.role === 'User' ? 'user' : 'assistant',
            content: m.content
        }));

        // Send to Background
        const loadingId = 'loading-' + Date.now();
        appendMessageToUI('System', 'Thinking...', loadingId);

        try {
            const response = await chrome.runtime.sendMessage({
                type: 'ASK_AI',
                apiKey: API_KEY, // Still using config key
                question: text,
                metadata: metadata,
                history: history,
                attachment: options.attachment // Pass attachment to background
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
            const loadingMsg = document.getElementById(loadingId);
            if (loadingMsg) loadingMsg.remove();
        }

    } catch (error) {
        console.error('Error sending message:', error);
        appendMessageToUI('System', 'Error communicating with AI.');
    }
}
