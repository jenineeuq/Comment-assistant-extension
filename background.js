chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openAuth') {
    chrome.windows.create({
      url: request.url,
      type: 'popup',
      width: 500,
      height: 600
    });
  }
});

// Listen for installation
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open auth page after installation
    chrome.tabs.create({
      url: 'https://comment-lp.onrender.com/auth?from=store'
    });
  }
}); 