// Listen for messages from the side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'GET_PAGE_CONTENT') {
    getPageContent()
      .then(metadata => sendResponse({ metadata }))
      .catch(error => {
        console.error('Content extraction error:', error);
        sendResponse({
            metadata: {
                url: window.location.href,
                domain: window.location.hostname,
                pageTitle: document.title,
                mainContent: "Error extracting content: " + error.message
            }
        });
      });
    return true; // Indicates async response
  }
});

async function getPageContent() {
    const url = window.location.href;
    const domain = window.location.hostname;
    
    // 1. Check for YouTube Video
    if ((domain.includes('youtube.com') || domain.includes('youtu.be')) && url.includes('/watch')) {
        const transcript = await getYouTubeTranscript();
        if (transcript) {
            return {
                url: url,
                domain: domain,
                pageTitle: document.title,
                mainContent: "Video Transcript:\n" + transcript
            };
        }
        // Fallback to Readability if transcript fails (e.g. no captions)
        console.warn("YouTube transcript not found, falling back to Readability.");
    }

    // 2. Check for PDF
    if (url.toLowerCase().endsWith('.pdf')) {
        const pdfText = await getPDFContent(url);
        return {
            url: url,
            domain: domain,
            pageTitle: document.title || url.split('/').pop(),
            mainContent: pdfText ? "PDF Content:\n" + pdfText : "Could not extract text from PDF."
        };
    }

    // 3. Default Readability Logic
    const documentClone = document.cloneNode(true);
    const article = new Readability(documentClone).parse();

    return {
        url: url,
        domain: domain,
        pageTitle: document.title,
        mainContent: (article && article.textContent) ? article.textContent : "No primary content detected."
    };
}

async function getPDFContent(url) {
    try {
        // Set worker source
        pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL('pdf.worker.min.js');

        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        let fullText = "";

        const maxPages = Math.min(pdf.numPages, 50); // Limit to 50 pages for performance

        for (let i = 1; i <= maxPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `[Page ${i}] ${pageText}\n\n`;
        }
        
        if (pdf.numPages > 50) {
            fullText += `\n[...Document truncated. Showing first 50 of ${pdf.numPages} pages...]`;
        }

        return fullText;

    } catch (error) {
        console.error("Error extracting PDF content:", error);
        return null;
    }
}

async function getYouTubeTranscript() {
    try {
        // Fetch the page content to find the player response data
        const response = await fetch(window.location.href);
        const html = await response.text();

        // Extract the "captionTracks" from the ytInitialPlayerResponse
        // This is usually embedded in a script tag: var ytInitialPlayerResponse = {...};
        const regex = /"captionTracks":\s*(\[.*?\])/;
        const match = regex.exec(html);

        if (!match) {
            console.log("No caption tracks found in page source.");
            return null;
        }

        const captionTracks = JSON.parse(match[1]);
        
        // Prioritize English ('en')
        // 1. Manually created English
        let track = captionTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr');
        // 2. Auto-generated English
        if (!track) track = captionTracks.find(t => t.languageCode === 'en');
        // 3. First available
        if (!track) track = captionTracks[0];

        if (!track || !track.baseUrl) return null;

        // Fetch the transcript XML
        const transcriptResp = await fetch(track.baseUrl);
        const transcriptXml = await transcriptResp.text();

        // Parse XML
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(transcriptXml, "text/xml");
        const textNodes = xmlDoc.getElementsByTagName("text");

        let fullText = "";
        // Combine text nodes
        for (let i = 0; i < textNodes.length; i++) {
            // Decode HTML entities if necessary, but textContent usually handles it
            fullText += textNodes[i].textContent + " ";
        }
        
        return fullText.trim();

    } catch (error) {
        console.error("Error fetching YouTube transcript:", error);
        return null;
    }
}
