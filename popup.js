// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get({
    language: 'en'
  }, (items) => {
    document.getElementById('languageSelect').value = items.language;
  });
});

// Save settings
document.getElementById('saveButton').addEventListener('click', () => {
  const settings = {
    language: document.getElementById('languageSelect').value
  };

  chrome.storage.sync.set(settings, () => {
    // Reload all Twitter tabs to apply new settings
    chrome.tabs.query({ url: ['*://*.twitter.com/*', '*://*.x.com/*'] }, (tabs) => {
      tabs.forEach(tab => {
        chrome.tabs.reload(tab.id);
      });
    });

    // Visual feedback
    const saveButton = document.getElementById('saveButton');
    saveButton.textContent = 'Saved!';
    setTimeout(() => {
      saveButton.textContent = 'Save Settings';
    }, 1500);
  });
}); 