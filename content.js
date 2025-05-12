let isAuthenticated = false;
let commentCount = 0;
let isPremium = false;

// Check auth status before initializing
chrome.storage.sync.get(['authToken', 'commentCount', 'isPremium'], (result) => {
  if (result.authToken) {
    isAuthenticated = true;
    commentCount = result.commentCount || 0;
    isPremium = result.isPremium || false;
    initializeFeatures();
  } else {
    // Open auth page if not authenticated
    chrome.runtime.sendMessage({ 
      action: 'openAuth',
      url: 'https://comment-lp.onrender.com/auth?from=extension'
    });
  }
});

const PLATFORMS = {
  TWITTER: 'twitter',
  LINKEDIN: 'linkedin'
};

const API_KEY = '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';

let currentPlatform = window.location.hostname.includes('linkedin') ? PLATFORMS.LINKEDIN : PLATFORMS.TWITTER;

let extensionSettings = {
  aiEnabled: true,
  temperature: 0.7,
  language: 'en'
}

// Load settings before initializing
chrome.storage.sync.get({
  language: 'en'
}, (items) => {
  extensionSettings = items;
});

// Templates for different types of replies
const replyTemplates = {
  thumbsUp: [
    "Absolutely love this! 🎯 {{context}}",
    "Couldn't agree more! 💯 {{context}}",
    "This is spot on! 👏 {{context}}"
  ],
  thumbsDown: [
    "I respectfully disagree because {{context}}",
    "Have you considered that {{context}}?",
    "While I see your point, {{context}}"
  ],
  support: [
    "I'm here to support you! 🤝 {{context}}",
    "You've got this! 💪 {{context}}",
    "Standing with you on this! ✨ {{context}}"
  ],
  joke: [
    "Here's a light take: {{context}} 😄",
    "On a lighter note: {{context}} 😂",
    "Not to meme about it, but {{context}} 🤣"
  ],
  idea: [
    "Here's a thought: {{context}} 💭",
    "Building on this: {{context}} 🚀",
    "What if we {{context}}? 🤔"
  ],
  question: [
    "Curious to know: {{context}}?",
    "Quick question: {{context}}?",
    "I wonder: {{context}}?"
  ]
};

// Add after the extensionSettings object
let commentCount = 0;

// Load saved comment count
chrome.storage.sync.get(['commentCount'], (result) => {
  commentCount = result.commentCount || 0;
});

// Function to check and update comment count
async function checkCommentLimit() {
  if (isPremium) return true;
  
  if (commentCount >= 5) {
    showLimitReachedModal();
    return false;
  }
  
  commentCount++;
  await chrome.storage.sync.set({ commentCount });
  return true;
}

function createReplyButtons(tweetText, replyTextarea) {
  const buttonsContainer = document.createElement('div');
  buttonsContainer.className = 'ai-reply-buttons';
  
  // First row buttons
  const firstRowButtons = [
    { emoji: '📝', type: 'oneLiner', label: 'One-Liner' },
    { emoji: '👍', type: 'agree', label: 'Agree' },
    { emoji: '👎', type: 'disagree', label: 'Disagree' },
    { emoji: '😄', type: 'funny', label: 'Funny' }
  ];
  
  // Second row buttons
  const secondRowButtons = [
    { emoji: '❓', type: 'question', label: 'Question' },
    { emoji: '💡', type: 'answer', label: 'Answer' },
    { emoji: '🎉', type: 'congrats', label: 'Congrats' },
    { emoji: '🙏', type: 'thanks', label: 'Thanks' }
  ];

  // Create all buttons
  [...firstRowButtons, ...secondRowButtons].forEach(button => {
    const btn = document.createElement('button');
    btn.className = 'ai-reply-button';
    btn.innerHTML = `<span>${button.emoji}</span> ${button.label}`;
    btn.onclick = () => generateReply(button.type, tweetText, replyTextarea);
    buttonsContainer.appendChild(btn);
  });

  return buttonsContainer;
}

function injectTextIntoTweetBox(element, text) {
  if (!extensionSettings.aiEnabled) return;

  if (currentPlatform === PLATFORMS.LINKEDIN) {
    injectLinkedInComment(element, text);
  } else {
    // Twitter injection remains the same
    element.focus();
    if (document.execCommand) {
      document.execCommand('insertText', false, text);
    } else {
      element.textContent = text;
    }
    
    const events = [
      new InputEvent('input', { bubbles: true, cancelable: true, data: text }),
      new Event('change', { bubbles: true }),
      new KeyboardEvent('keyup', { bubbles: true })
    ];
    events.forEach(event => element.dispatchEvent(event));
  }
}

async function generateReply(type, originalText, textElement) {
  if (!extensionSettings.aiEnabled) {
    return;
  }

  showLoadingState(textElement);
  
  try {
    const prompt = getPromptForType(type, originalText);
    const languageName = getLanguageName(extensionSettings.language);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are an assistant that generates replies in ${languageName}. Keep responses under 150 characters, using simple and clear language.`
          },
          {
            role: 'user',
            content: `Generate a reply in ${languageName}: ${prompt}`
          }
        ],
        max_tokens: 100,
        temperature: extensionSettings.temperature
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'API request failed');
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error('Invalid API response');
    }

    const reply = data.choices[0].message.content;
    removeLoadingState(textElement);
    
    // Handle different platforms
    if (currentPlatform === PLATFORMS.LINKEDIN) {
      // For LinkedIn
      if (textElement.classList.contains('ql-editor')) {
        textElement.innerHTML = `<p>${reply}</p>`;
      } else {
        textElement.value = reply;
      }

      // Trigger LinkedIn's UI updates
      const events = [
        new Event('input', { bubbles: true }),
        new Event('change', { bubbles: true }),
        new InputEvent('input', { bubbles: true, data: reply })
      ];
      events.forEach(event => textElement.dispatchEvent(event));

      // Enable submit button if exists
      const form = textElement.closest('form');
      if (form) {
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    } else {
      // For Twitter
      const tweetBox = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (!tweetBox) {
        throw new Error('Could not find tweet box');
      }

      const editableElement = tweetBox.querySelector('[contenteditable="true"]') || 
                            tweetBox.querySelector('[role="textbox"]') ||
                            tweetBox;

      if (!editableElement) {
        throw new Error('Could not find editable element');
      }

      injectTextIntoTweetBox(editableElement, reply);
    }
    
  } catch (error) {
    console.error('Failed to generate reply:', error);
    removeLoadingState(textElement);
    
    if (error.message.includes('rate limit')) {
      showError('Rate limit exceeded. Please try again in a moment.');
    } else if (error.message.includes('insufficient_quota')) {
      showError('API quota exceeded. Please try again later.');
    } else {
      showError('Failed to generate reply. Please try again.');
    }
  }
}

function getPromptForType(type, tweet) {
  const baseStyle = `Closely follow this writing style:
Use clear, direct language and avoid complex terminology.
Aim for a Flesch reading score of 80 or higher.
Use the active voice.
Avoid adverbs.
Avoid buzzwords and instead use plain English.
Use jargon where relevant.
Avoid being salesy or overly enthusiastic and instead express calm confidence.
Respond as if your responses were to be posted on Reddit, use Reddit's language.
dont use emojis.
use only small case letters.

Based on these guidelines, `;

  const prompts = {
    oneLiner: `${baseStyle}Craft a witty one-liner reply to the following message, ensuring it is clever, engaging, and concise (maximum 150 characters): "${tweet}"`,
    agree: `${baseStyle}Compose a supportive reply agreeing with the following message, keeping it positive, concise, and within 150 characters: "${tweet}"`,
    disagree: `${baseStyle}Draft a respectful reply disagreeing with the following message, ensuring it remains courteous, clear, and within 150 characters: "${tweet}"`,
    funny: `${baseStyle}Create a humorous reply to the following message, keeping it lighthearted, witty, and within 150 characters: "${tweet}"`,
    question: `${baseStyle}Formulate a thought-provoking question about the following message, ensuring it is engaging, insightful, and within 150 characters: "${tweet}"`,
    answer: `${baseStyle}Provide a helpful and concise answer to the following message, ensuring it is clear, informative, and within 150 characters: "${tweet}"`,
    congrats: `${baseStyle}Compose a congratulatory response to the following message, ensuring it is warm, celebratory, and within 150 characters: "${tweet}"`,
    thanks: `${baseStyle}Draft a grateful response to the following message, ensuring it conveys appreciation sincerely and stays within 150 characters: "${tweet}"`
  };
  
  return prompts[type] || prompts.oneLiner;
}

// Observer to watch for new reply boxes
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const replyBox = node.querySelector('[data-testid="tweetTextarea_0"]');
        if (replyBox && !replyBox.parentElement.querySelector('.ai-reply-buttons')) {
          const tweetText = document.querySelector('[data-testid="tweetText"]')?.textContent || '';
          const buttons = createReplyButtons(tweetText, replyBox);
          replyBox.parentElement.appendChild(buttons);
        }
      }
    });
  });
});

// Start observing the document
observer.observe(document.body, {
  childList: true,
  subtree: true
});

function showLoadingState(element) {
  let loadingIndicator = document.querySelector('.ai-loading-indicator');
  if (!loadingIndicator) {
    loadingIndicator = document.createElement('div');
    loadingIndicator.className = `ai-loading-indicator ${currentPlatform}`;
    loadingIndicator.textContent = 'Generating reply...';
    
    if (currentPlatform === PLATFORMS.LINKEDIN) {
      const container = element.closest('.comments-comment-box__form-container');
      if (container) {
        container.appendChild(loadingIndicator);
      }
    } else {
      element.parentElement.appendChild(loadingIndicator);
    }
  }
}

function removeLoadingState(element) {
  const loadingIndicator = document.querySelector('.ai-loading-indicator');
  if (loadingIndicator) {
    loadingIndicator.remove();
  }
}

function showError(message) {
  const existingError = document.querySelector('.ai-error-message');
  if (existingError) {
    existingError.remove();
  }

  const errorDiv = document.createElement('div');
  errorDiv.className = `ai-error-message ${currentPlatform}`;
  errorDiv.textContent = message;

  if (currentPlatform === PLATFORMS.LINKEDIN) {
    const commentBox = document.querySelector('.comments-comment-box__form-container');
    if (commentBox) {
      commentBox.appendChild(errorDiv);
    }
  } else {
    const replyBox = document.querySelector('[data-testid="tweetTextarea_0"]');
    if (replyBox) {
      replyBox.parentElement.appendChild(errorDiv);
    }
  }

  setTimeout(() => {
    errorDiv.remove();
  }, 5000);
}

function initializeFeatures() {
  if (!isAuthenticated) {
    return;
  }
  
  chrome.storage.sync.get({
    language: 'en'
  }, (items) => {
    extensionSettings = items;
    
    if (extensionSettings.aiEnabled) {
      setupPlatformFeatures();
    } else {
      cleanupFeatures();
    }
  });
}

function setupPlatformFeatures() {
  if (currentPlatform === PLATFORMS.TWITTER) {
    setupTwitterObserver();
  } else if (currentPlatform === PLATFORMS.LINKEDIN) {
    setupLinkedInObserver();
  }
}

function cleanupFeatures() {
  // Remove all extension elements
  document.querySelectorAll('.ai-reply-buttons, .ai-loading-indicator, .ai-error-message').forEach(el => el.remove());
  
  // Disconnect existing observer
  if (observer) {
    observer.disconnect();
  }
}

// LinkedIn specific functions
function setupLinkedInObserver() {
  // Initial check for existing comment boxes
  setTimeout(() => {
    findAndProcessLinkedInComments();
  }, 1000);

  // Create new observer with modern configuration
  const observer = new MutationObserver(() => {
    findAndProcessLinkedInComments();
  });

  // Configure observer
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}

function findAndProcessLinkedInComments() {
  // Find all comment boxes on the current LinkedIn page
  const commentBoxes = document.querySelectorAll('form.comments-comment-box__form');

  commentBoxes.forEach((box, index) => {
    if (!box.querySelector('.ai-reply-buttons')) {
      const textEditor = box.querySelector('div.ql-editor[contenteditable="true"]');
      
      if (textEditor) {
        console.log(`Found text editor in comment box ${index + 1}`);
        addButtonsToLinkedInComment(box, textEditor);
      }
    }
  });
}

function addButtonsToLinkedInComment(commentBox, textEditor) {
  const postText = getLinkedInPostText(commentBox);
  const buttons = createReplyButtons(postText, textEditor);

  // Create wrapper with LinkedIn styling
  const buttonWrapper = document.createElement('div');
  buttonWrapper.className = 'ai-reply-buttons-wrapper linkedin';
  buttonWrapper.appendChild(buttons);

  // Insert before the editor container
  const editorContainer = textEditor.closest('.comments-comment-box__form-container');
  if (editorContainer) {
    editorContainer.insertBefore(buttonWrapper, editorContainer.firstChild);
  } else {
    commentBox.insertBefore(buttonWrapper, commentBox.firstChild);
  }
}

function injectLinkedInComment(element, text) {
  if (!element) return;

  // Handle the contenteditable div
  if (element.classList.contains('ql-editor')) {
    element.innerHTML = `<p>${text}</p>`;
  } else {
    element.value = text;
  }

  // Trigger necessary events
  const events = [
    new Event('input', { bubbles: true }),
    new Event('change', { bubbles: true }),
    new InputEvent('input', { bubbles: true, data: text }),
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
  ];

  events.forEach(event => element.dispatchEvent(event));

  // Enable submit button
  const form = element.closest('form');
  if (form) {
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

// Add LinkedIn specific styles
const linkedInStyles = document.createElement('style');
linkedInStyles.textContent = `
  .ai-reply-buttons-wrapper.linkedin {
    margin: 8px 0 !important;
    padding: 8px 16px !important;
    background-color: #fff !important;
    display: block !important;
    width: calc(100% - 32px) !important;
    border-radius: 4px !important;
    border: 1px solid rgba(0,0,0,0.08) !important;
    z-index: 100 !important;
  }

  .linkedin .ai-reply-buttons {
    display: grid !important;
    grid-template-columns: repeat(4, 1fr) !important;
    gap: 8px !important;
    width: 100% !important;
    margin: 0 !important;
  }

  .linkedin .ai-reply-button {
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    padding: 6px 12px !important;
    border: 1px solid #0a66c2 !important;
    border-radius: 16px !important;
    color: #0a66c2 !important;
    background: transparent !important;
    font-size: 12px !important;
    cursor: pointer !important;
    white-space: nowrap !important;
    min-width: 60px !important;
    transition: background-color 0.2s !important;
    position: relative !important;
    z-index: 101 !important;
  }

  .linkedin .ai-reply-button:hover {
    background-color: rgba(10, 102, 194, 0.1) !important;
  }
`;

// Ensure styles are added only once
if (!document.head.querySelector('#linkedin-ai-styles')) {
  linkedInStyles.id = 'linkedin-ai-styles';
  document.head.appendChild(linkedInStyles);
}

function getLinkedInPostText(element) {
  const selectors = [
    '.feed-shared-update-v2__description-wrapper',
    '.feed-shared-text',
    '.feed-shared-text-view',
    '.comments-comment-item__main-content'
  ];

  const post = element.closest('.feed-shared-update-v2') || 
               element.closest('.feed-shared-post') ||
               element.closest('.comments-comment-item');

  if (post) {
    for (const selector of selectors) {
      const content = post.querySelector(selector)?.textContent?.trim();
      if (content) return content;
    }
  }

  return '';
}

function getLanguageName(code) {
  const languages = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'ko': 'Korean',
    'zh': 'Chinese'
  };
  return languages[code] || 'English';
}

// Initialize features when settings change
chrome.storage.onChanged.addListener((changes) => {
  if (changes.aiEnabled) {
    if (changes.aiEnabled.newValue) {
      setupPlatformFeatures();
    } else {
      cleanupFeatures();
    }
  }
});

// Initial setup
initializeFeatures(); 

// Add this check before generating comments
async function generateComment(type, context) {
  const canProceed = await checkCommentLimit();
  if (!canProceed) {
    return;
  }
  // Rest of your comment generation code
} 

// Add this function to show the upgrade modal
function showLimitReachedModal() {
  const modal = document.createElement('div');
  modal.className = 'limit-reached-modal';
  modal.innerHTML = `
    <div class="modal-content">
      <h2>Free Trial Limit Reached</h2>
      <p>You've used all 5 free comments. Upgrade to continue using Comment Assistant!</p>
      <button onclick="window.open('https://comment-lp.onrender.com/pricing', '_blank')">
        Upgrade Now - Lifetime Deal $29
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Add this function to handle premium upgrade
async function handlePremiumUpgrade() {
  await chrome.storage.sync.set({ 
    isPremium: true,
    commentCount: 0 
  });
  isPremium = true;
  commentCount = 0;
} 