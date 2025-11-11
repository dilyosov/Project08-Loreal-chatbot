/* DOM elements */
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");

// Optional: configure a Cloudflare worker URL in `secrets.js` as `window.WORKER_URL = 'https://lorealchatbot.dilyosov.workers.dev/';`
// We intentionally read window.WORKER_URL dynamically so a missing secrets file
// doesn't cause a runtime exception at load time.
function getWorkerUrl() {
  // Prefer an explicitly set window.WORKER_URL (from secrets.local.js or secrets.js).
  // Fall back to the known Cloudflare Worker URL for this demo so the page works
  // even when a secrets file isn't present. This is safe because the Worker
  // holds the real OpenAI key server-side.
  // Always use the embedded Cloudflare Worker URL for this demo. The Worker
  // keeps secrets server-side; the client only needs the public endpoint.
  return "https://lorealchatbot.dilyosov.workers.dev/";
}

// Conversation history -- include a system instruction that constrains the assistant
const messages = [
  {
    role: "system",
    content:
      "You are L'Oréal's Smart Product Advisor. Answer questions only about L'Oréal products, cosmetics, beauty, skincare, haircare, and fragrances. If a user's query is unrelated to these topics, politely refuse and say you can't help with that topic. Always respond kindly to greetings (for example: hello, hi, bonjour) — greet the user and invite them to ask about L'Oréal products or routines.",
  },
];

// Track simple user context
let userName = null;
const pastQuestions = [];
const userNameDisplayEl = document.getElementById("userNameDisplay");
const editNameBtn = document.getElementById("editNameBtn");
const clearConvBtn = document.getElementById("clearConvBtn");

// Persistence helpers: save/restore conversation (do not store the system prompt)
function saveConversation() {
  try {
    // store messages excluding the first system prompt
    const store = messages.slice(1);
    localStorage.setItem("loreal_messages", JSON.stringify(store));
    localStorage.setItem("loreal_pastQuestions", JSON.stringify(pastQuestions));
  } catch (e) {
    console.error("Failed to save conversation:", e);
  }
}

function restoreConversation() {
  try {
    const raw = localStorage.getItem("loreal_messages");
    if (!raw) return false;
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr) || arr.length === 0) return false;

    // append restored messages after the system prompt
    arr.forEach((m) => {
      // push a shallow copy with expected shape
      messages.push({ role: m.role, content: m.content, time: m.time || null });
    });

    // Do not render any restored messages to the chat window on load.
    // We keep the full conversation in `messages` for context and persistence,
    // but the UI should always start with the assistant welcome message.

    // restore past questions if present
    const pq = localStorage.getItem("loreal_pastQuestions");
    if (pq) {
      const pqa = JSON.parse(pq);
      if (Array.isArray(pqa)) {
        pastQuestions.push(...pqa);
      }
    }

    return true;
  } catch (e) {
    console.error("Failed to restore conversation:", e);
    return false;
  }
}

// Restore conversation into memory (no UI rendering), then always show assistant welcome
restoreConversation();
// Always start UI with assistant welcome message
chatWindow.innerHTML = "";
renderAssistantMessage(
  "👋 Bonjour — I'm L'Oréal's Smart Product Advisor. Ask about products, routines, or personalized recommendations."
);

/**
 * Render helper: append a message to the chat window
 */
function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(role, text, timeISO = null) {
  const now = timeISO ? new Date(timeISO) : new Date();
  const timeStr = formatTime(now);

  // Create bubble content
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  const textNode = document.createElement("div");
  textNode.textContent = text;
  bubble.appendChild(textNode);

  const meta = document.createElement("span");
  meta.className = "meta";
  meta.textContent = timeStr;
  bubble.appendChild(meta);

  // Group messages from the same role if the last message has same role
  const last = chatWindow.lastElementChild;
  if (
    last &&
    last.classList &&
    last.classList.contains("msg") &&
    last.classList.contains(role)
  ) {
    last.appendChild(bubble);
    chatWindow.scrollTop = chatWindow.scrollHeight;
    return last;
  }

  // Create avatar element (only for new message blocks)
  const avatarEl = document.createElement("div");
  avatarEl.className = "avatar";
  // For the assistant (ai) use the avatar image in img/avatar.png.
  // For the user, do not show an emoji — leave the avatar visually empty.
  if (role === "ai") {
    const img = document.createElement("img");
    img.src = "img/avatar.png";
    img.alt = "L'Oréal Advisor";
    avatarEl.appendChild(img);
  } else {
    // no emoji for user; keep the avatar element as an empty circle
    avatarEl.textContent = "You";
  }

  const el = document.createElement("div");
  el.className = `msg ${role}`;
  // append avatar then bubble; CSS will reverse order for .msg.user
  el.appendChild(avatarEl);
  el.appendChild(bubble);
  chatWindow.appendChild(el);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  return el;
}

function renderAssistantMessage(text) {
  return renderMessage("ai", `L'Oréal Advisor: ${text}`);
}

function renderUserMessage(text) {
  return renderMessage("user", ` ${text}`);
}

/**
 * Basic heuristic to decide if a query is related to L'Oréal / beauty topics.
 * This is intentionally simple — the system instruction also asks the model
 * to respond "I don't know." for unrelated queries, but doing a local check
 * lets us short-circuit network calls and guarantee the required behavior.
 */
function isRelatedQuery(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const keywords = [
    "loreal",
    "l'oréal",
    "loreál",
    "makeup",
    "beauty",
    "skincare",
    "skin",
    "hair",
    "haircare",
    "fragrance",
    "perfume",
    "cosmetic",
    "product",
    "routine",
    "serum",
    "moisturizer",
    "foundation",
    "mascara",
    "shampoo",
    "conditioner",
    "styling",
    "color",
    "cream",
    "cleanser",
    "toner",
    "sunscreen",
    "spf",
  ];

  return keywords.some((k) => t.includes(k));
}

/**
 * Simple greeting detector. Returns true if the user's input looks like a greeting.
 */
function isGreeting(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  const greetings = [
    "hi",
    "hello",
    "hey",
    "bonjour",
    "good morning",
    "good afternoon",
    "good evening",
    "greetings",
  ];
  return greetings.some(
    (g) =>
      t === g ||
      t.startsWith(g + " ") ||
      t.includes(" " + g + " ") ||
      t.endsWith(" " + g)
  );
}

// Initialize stored name from localStorage (if present)
function setUserName(name) {
  userName = name ? name.trim() : null;
  if (userName) {
    localStorage.setItem("loreal_userName", userName);
    if (userNameDisplayEl) userNameDisplayEl.textContent = userName;
  } else {
    localStorage.removeItem("loreal_userName");
    if (userNameDisplayEl) userNameDisplayEl.textContent = "Guest";
  }
}

const storedName = localStorage.getItem("loreal_userName");
if (storedName) setUserName(storedName);

if (editNameBtn) {
  editNameBtn.addEventListener("click", () => {
    const name = prompt("Enter your name:", userName || "");
    if (name === null) return; // cancelled
    setUserName(name);
    // Optionally inform the conversation
    if (name && name.trim()) {
      const info = `Nice to meet you, ${name.trim()}! Ask me about L'Oréal products or routines.`;
      renderAssistantMessage(info);
      messages.push({ role: "assistant", content: info });
    }
  });
}

if (clearConvBtn) {
  clearConvBtn.addEventListener("click", () => {
    // Clear UI
    chatWindow.innerHTML = "";
    // Clear persisted conversation
    localStorage.removeItem("loreal_messages");
    localStorage.removeItem("loreal_pastQuestions");

    // Reset conversation history but keep system prompt
    if (messages && messages.length) {
      const system = messages[0];
      messages.length = 0;
      messages.push(system);
    }
    pastQuestions.length = 0;

    // Reset stored name to Guest per requirement
    setUserName(null);

    // Render initial assistant message
    renderAssistantMessage(
      "👋 Bonjour — I'm L'Oréal's Smart Product Advisor. Ask about products, routines, or personalized recommendations."
    );
  });
}

/**
 * Send messages array to the configured worker endpoint.
 * The worker is expected to forward messages to the OpenAI Chat Completions API
 * and return the response JSON.
 */
async function sendToApi(messagesArray) {
  // Prefer the worker endpoint (keeps API keys on the server/worker)
  const WORKER_URL = getWorkerUrl();
  if (WORKER_URL) {
    const resp = await fetch(WORKER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: messagesArray }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Worker responded with status ${resp.status}: ${text}`);
    }

    return resp.json();
  }

  // Fallback: if the developer placed an API key on window for local testing,
  // call OpenAI's Chat Completions API directly. This is NOT recommended for
  // production because it exposes the key in client-side code.
  const apiKey = window.OPENAI_API_KEY;
  if (apiKey) {
    const apiUrl = "https://api.openai.com/v1/chat/completions";
    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: messagesArray,
        max_tokens: 300,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${text}`);
    }

    return resp.json();
  }

  // If neither worker nor local key is configured, throw but calling code may
  // prefer to handle this condition more gracefully. We leave a clear error
  // message for debugging, but the submit handler below will avoid calling
  // sendToApi when configuration is missing so this path is rarely hit.
  throw new Error(
    "No WORKER_URL or OPENAI_API_KEY configured. Set window.WORKER_URL (recommended) or window.OPENAI_API_KEY for local testing."
  );
}

/* Handle form submit */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const text = userInput.value.trim();
  if (!text) return;

  // Clear input immediately (requirement)
  userInput.value = "";

  // Show only latest QA in the chat window: clear previous displayed bubbles
  chatWindow.innerHTML = "";

  // Render user message locally and add to conversation
  renderUserMessage(text);
  const nowISO = new Date().toISOString();
  messages.push({ role: "user", content: text, time: nowISO });
  saveConversation();

  // Detect a simple "my name is ..." pattern and store the name
  const nameMatch = text.match(
    /\b(?:my name is|i'm|i am|this is)\s+([A-Za-z][A-Za-z'\- ]{0,40})/i
  );
  if (nameMatch) {
    userName = nameMatch[1].trim();
  }

  // Keep past questions for context
  pastQuestions.push(text);

  // If the user greets the bot, respond locally with a friendly greeting
  if (isGreeting(text)) {
    const greet =
      "Bonjour! I'm L'Oréal's Smart Product Advisor. How can I help you with L'Oréal products, routines, or recommendations?";
    renderAssistantMessage(greet);
    messages.push({
      role: "assistant",
      content: greet,
      time: new Date().toISOString(),
    });
    saveConversation();
    return;
  }

  // Short-circuit unrelated queries: politely refuse and do not call the API
  if (!isRelatedQuery(text)) {
    const refuse =
      "I'm here to help with L'Oréal products, routines and beauty topics — I can't assist with that. Please ask about skincare, makeup, haircare, or fragrances.";
    renderAssistantMessage(refuse);
    messages.push({
      role: "assistant",
      content: refuse,
      time: new Date().toISOString(),
    });
    saveConversation();
    return;
  }

  // Show a temporary assistant typing placeholder (bubble)
  const loadingEl = document.createElement("div");
  loadingEl.className = "msg ai";
  const loadingBubble = document.createElement("div");
  loadingBubble.className = "bubble";
  loadingBubble.textContent = "L'Oréal Advisor: Thinking...";
  loadingEl.appendChild(loadingBubble);
  chatWindow.appendChild(loadingEl);
  chatWindow.scrollTop = chatWindow.scrollHeight;

  try {
    // Prevent an API call when neither a worker nor a local API key is configured.
    if (!getWorkerUrl() && !window.OPENAI_API_KEY) {
      loadingEl.remove();
      const cfgMsg =
        "This demo is not configured to talk to the API. For production, set up a Cloudflare Worker and add the worker URL to a gitignored `secrets.local.js` (example: `window.WORKER_URL = 'https://your-worker.example.workers.dev'`).\n\nFor local testing only, you can create `secrets.local.js` with `window.OPENAI_API_KEY = 'sk-...';` (not recommended to commit).";
      renderAssistantMessage(cfgMsg);
      messages.push({
        role: "assistant",
        content: cfgMsg,
        time: new Date().toISOString(),
      });
      saveConversation();
      return;
    }
    const data = await sendToApi(messages);

    // Remove loading placeholder
    loadingEl.remove();

    // Expect worker to return OpenAI response structure
    const assistantText =
      data && data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content
        : "(No response from API)";

    // Remove loading placeholder
    loadingEl.remove();

    // Render assistant response as bubble and add to conversation history
    renderAssistantMessage(assistantText);
    messages.push({
      role: "assistant",
      content: assistantText,
      time: new Date().toISOString(),
    });
    saveConversation();
  } catch (err) {
    // Log the error and show a friendly message to the user
    console.error("Chat error:", err);
    loadingEl.remove();
    const errMsg = "Sorry — something went wrong. Please try again later.";
    renderAssistantMessage(errMsg);
    messages.push({ role: "assistant", content: errMsg });
  }
});
