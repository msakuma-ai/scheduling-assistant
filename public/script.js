// Conversation state — just messages
let conversationMessages = [];
let isWaiting = false;

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');

// Start with a greeting from the bot
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    // Send an empty first message to trigger the bot's greeting
    sendToServer([{ role: 'user', content: "Hi, I'd like to schedule a meeting with Michael." }], true);
  }, 300);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !isWaiting) sendMessage();
});

document.getElementById('sendBtn').addEventListener('click', () => {
  if (!isWaiting) sendMessage();
});

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;

  addUserMessage(text);
  inputEl.value = '';

  conversationMessages.push({ role: 'user', content: text });
  sendToServer(conversationMessages);
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addBotMessage(text) {
  const div = document.createElement('div');
  div.className = 'message bot-message';
  // Parse markdown-style links and bold
  div.innerHTML = formatMessage(text);
  messagesEl.appendChild(div);
  scrollToBottom();
}

function formatMessage(text) {
  // Convert **bold** to <strong>
  let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  // Convert [text](url) to clickable links
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g,
    '<a href="$2" target="_blank" class="chat-link">$1</a>');
  // Convert bare Calendly URLs to links
  html = html.replace(/(https:\/\/calendly\.com\/[^\s<]+)/g,
    '<a href="$1" target="_blank" class="chat-link">Book on Calendly</a>');
  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');
  return html;
}

function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.id = 'typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  scrollToBottom();
}

function hideTyping() {
  const el = document.getElementById('typing');
  if (el) el.remove();
}

function scrollToBottom() {
  setTimeout(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }, 50);
}

async function sendToServer(messages, isGreeting = false) {
  isWaiting = true;
  showTyping();

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    const data = await res.json();
    hideTyping();

    if (data.error) {
      addBotMessage("Hmm, I'm having a little trouble right now. Try again in a moment?");
    } else {
      // If this is the greeting, don't show the user message
      if (isGreeting) {
        // Remove the auto-sent user message from display — it was never shown
        conversationMessages = data.messages;
      } else {
        conversationMessages = data.messages;
      }
      addBotMessage(data.reply);
    }
  } catch (err) {
    hideTyping();
    addBotMessage("Something went wrong on my end. Give it another try?");
  }

  isWaiting = false;
  inputEl.focus();
}
