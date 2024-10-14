function extractIframes(htmlContent) {
    try {
        const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
        const iframes = doc.querySelectorAll('iframe');

        if (!iframes.length) {
            throw new Error("No valid iframes found.");
        }

        return Array.from(iframes).map(iframe => iframe.src);
    } catch (error) {
        console.error("Error extracting iframes:", error.message);
        // Handle error gracefully; return empty array or a fallback
        return [];
    }
}
