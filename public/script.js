// State machine for the conversation
const state = {
  step: 'greeting',
  name: '',
  phone: '',
  reason: '',
  duration: 0,
  timeZone: 'Eastern',
  timeframe: 'this_week',
  slots: [],
  selectedSlot: null,
  format: '',
  schedulingUrl: '',
  eventTypeKey: '',
};

const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('userInput');
const inputArea = document.getElementById('inputArea');

// Start the conversation
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    addBotMessage(
      "Hi there! I'm Michael Sakuma's scheduling assistant. " +
      "I'd love to help you find a great time to connect with Mike. " +
      "Let's get you set up! To start, what's your name?"
    );
  }, 500);
});

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
  const text = inputEl.value.trim();
  if (!text) return;
  addUserMessage(text);
  inputEl.value = '';
  processInput(text);
}

function addUserMessage(text) {
  const div = document.createElement('div');
  div.className = 'message user-message';
  div.textContent = text;
  messagesEl.appendChild(div);
  scrollToBottom();
}

function addBotMessage(text, html) {
  const div = document.createElement('div');
  div.className = 'message bot-message';
  if (html) {
    div.innerHTML = html;
  } else {
    div.textContent = text;
  }
  messagesEl.appendChild(div);
  scrollToBottom();
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

function hideInput() {
  inputArea.classList.add('hidden');
}

function showInput(placeholder) {
  inputArea.classList.remove('hidden');
  inputEl.placeholder = placeholder || 'Type your response...';
  inputEl.focus();
}

function disableCurrentButtons() {
  const messages = messagesEl.querySelectorAll('.message');
  const lastBotIdx = Array.from(messages).findLastIndex(m => m.classList.contains('bot-message'));
  messages.forEach((m, i) => {
    if (i <= lastBotIdx) {
      m.querySelectorAll('.format-buttons, .slot-buttons').forEach(b => {
        b.style.pointerEvents = 'none';
        b.style.opacity = '0.5';
      });
    }
  });
}

function processInput(text) {
  showTyping();
  setTimeout(() => {
    hideTyping();
    switch (state.step) {
      case 'greeting':
        state.name = text;
        state.step = 'phone';
        addBotMessage(`Great to meet you, ${state.name}! What's the best phone or text number to reach you at?`);
        showInput('(555) 123-4567');
        break;

      case 'phone':
        state.phone = text;
        state.step = 'reason';
        addBotMessage("Got it! What would you like to meet with Mike about? Just a brief description is fine.");
        showInput('e.g., Project discussion, consultation...');
        break;

      case 'reason':
        state.reason = text;
        state.step = 'duration';
        addBotMessage(null,
          "How long would you like the meeting to be?" +
          '<div class="format-buttons" style="margin-top: 10px;">' +
            '<button class="format-btn" onclick="selectDuration(15)">15 min</button>' +
            '<button class="format-btn" onclick="selectDuration(30)">30 min</button>' +
            '<button class="format-btn" onclick="selectDuration(45)">45 min</button>' +
            '<button class="format-btn" onclick="selectDuration(60)">60 min</button>' +
          '</div>'
        );
        hideInput();
        break;

      case 'timezone':
        handleTimezone(text);
        break;

      case 'other_times':
        handleOtherTimesResponse(text);
        break;

      default:
        addBotMessage("Hmm, I'm not sure how to handle that. Let me start over. What's your name?");
        state.step = 'greeting';
        break;
    }
  }, 600 + Math.random() * 400);
}

function selectDuration(mins) {
  state.duration = mins;
  state.step = 'timeframe';
  addUserMessage(`${mins} minutes`);
  disableCurrentButtons();

  showTyping();
  setTimeout(() => {
    hideTyping();
    addBotMessage(null,
      "When are you looking to meet?" +
      '<div class="format-buttons" style="flex-wrap: wrap; margin-top: 10px;">' +
        '<button class="format-btn" onclick="selectTimeframe(\'few_days\')">The next few days</button>' +
        '<button class="format-btn" onclick="selectTimeframe(\'this_week\')">This week</button>' +
        '<button class="format-btn" onclick="selectTimeframe(\'next_week\')">Next week</button>' +
        '<button class="format-btn" onclick="selectTimeframe(\'two_weeks\')">2 weeks or later</button>' +
      '</div>'
    );
    hideInput();
  }, 600);
}

function selectTimeframe(tf) {
  state.timeframe = tf;
  const labels = {
    'few_days': 'The next few days',
    'this_week': 'This week',
    'next_week': 'Next week',
    'two_weeks': '2 weeks or later',
  };
  addUserMessage(labels[tf]);
  disableCurrentButtons();
  state.step = 'timezone';

  showTyping();
  setTimeout(() => {
    hideTyping();
    addBotMessage(null,
      "What time zone are you in?" +
      '<div class="format-buttons" style="flex-wrap: wrap; margin-top: 10px;">' +
        '<button class="format-btn" onclick="selectTimezone(\'Eastern\')">Eastern</button>' +
        '<button class="format-btn" onclick="selectTimezone(\'Central\')">Central</button>' +
        '<button class="format-btn" onclick="selectTimezone(\'Mountain\')">Mountain</button>' +
        '<button class="format-btn" onclick="selectTimezone(\'Pacific\')">Pacific</button>' +
      '</div>' +
      '<div style="margin-top:6px; font-size:12px; color:#888;">Or type your time zone if not listed</div>'
    );
    showInput('e.g., Alaska, Hawaii...');
  }, 600);
}

function selectTimezone(tz) {
  state.timeZone = tz;
  addUserMessage(tz);
  disableCurrentButtons();
  fetchSlots();
}

function handleTimezone(text) {
  const tzMap = {
    'eastern': 'Eastern', 'et': 'Eastern', 'est': 'Eastern', 'edt': 'Eastern',
    'central': 'Central', 'ct': 'Central', 'cst': 'Central', 'cdt': 'Central',
    'mountain': 'Mountain', 'mt': 'Mountain', 'mst': 'Mountain', 'mdt': 'Mountain',
    'pacific': 'Pacific', 'pt': 'Pacific', 'pst': 'Pacific', 'pdt': 'Pacific',
    'alaska': 'Alaska', 'akst': 'Alaska', 'akdt': 'Alaska',
    'hawaii': 'Hawaii', 'hst': 'Hawaii', 'hast': 'Hawaii',
  };
  const tz = tzMap[text.toLowerCase().trim()];
  if (tz) {
    state.timeZone = tz;
    fetchSlots();
  } else {
    addBotMessage("I didn't quite catch that time zone. Could you try again? Common ones are Eastern, Central, Mountain, or Pacific.");
  }
}

async function fetchSlots() {
  hideInput();
  showTyping();

  try {
    const res = await fetch('/api/slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration: state.duration, timeZone: state.timeZone, timeframe: state.timeframe }),
    });

    const data = await res.json();
    hideTyping();

    if (data.error) {
      addBotMessage("I'm having a little trouble checking the calendar right now. You can email Mike directly and he'll get back to you quickly!");
      return;
    }

    state.slots = data.slots;
    state.schedulingUrl = data.schedulingUrl;
    state.eventTypeKey = data.eventTypeKey;

    if (data.slots && data.slots.length > 0) {
      displaySlots(data.slots);
    } else {
      addBotMessage(
        "It looks like Mike's schedule is pretty full for that timeframe. " +
        "Would you like me to look further out, or would a Friday work? " +
        "Friday meetings just need Mike's quick approval."
      );
      state.step = 'other_times';
      showInput('Type your preference...');
    }
  } catch (err) {
    hideTyping();
    addBotMessage("I'm having a little trouble checking the calendar right now. You can email Mike directly and he'll get back to you quickly!");
  }
}

function displaySlots(slots) {
  const intro = `Here are some times that work well. Mike has been making an effort to battle Zoom fatigue ` +
    `by scheduling more meetings over the phone — but Zoom is always an option too!`;

  // Show top 3 preferred slots first, rest behind "Show more"
  const showPreferred = slots.slice(0, 3);
  const showOthers = slots.slice(3);

  let buttonsHtml = '<div class="slot-buttons">';
  showPreferred.forEach((slot, i) => {
    let note = '';
    if (slot.phoneOnly) {
      note = '<span class="slot-note">Mike will be driving — phone only</span>';
    } else if (slot.friday) {
      note = '<span class="slot-note">Friday — requires confirmation</span>';
    }
    buttonsHtml += `<button class="slot-btn" onclick="selectSlot(${i})">${slot.display}${note}</button>`;
  });
  buttonsHtml += '</div>';

  if (showOthers.length > 0) {
    buttonsHtml += `<div style="margin-top:8px;">` +
      `<button class="format-btn" onclick="showMoreTimes()" id="showMoreBtn" ` +
      `style="width:100%; font-size:12px; padding:8px;">Show more times</button></div>`;

    buttonsHtml += `<div class="slot-buttons" id="moreSlots" style="display:none; margin-top:8px;">`;
    showOthers.forEach((slot, i) => {
      const globalIdx = showPreferred.length + i;
      let note = '';
      if (slot.phoneOnly) {
        note = '<span class="slot-note">Mike will be driving — phone only</span>';
      } else if (slot.friday) {
        note = '<span class="slot-note">Friday — requires confirmation</span>';
      }
      buttonsHtml += `<button class="slot-btn" onclick="selectSlot(${globalIdx})">${slot.display}${note}</button>`;
    });
    buttonsHtml += '</div>';
  }

  addBotMessage(null, intro + buttonsHtml);
  addBotMessage("If none of these work for you, just let me know and I can look at other options!");
  state.step = 'slot_selection';
  showInput("Or type 'more times' for other options");
}

function showMoreTimes() {
  const moreSlots = document.getElementById('moreSlots');
  const showMoreBtn = document.getElementById('showMoreBtn');
  if (moreSlots) moreSlots.style.display = 'flex';
  if (showMoreBtn) showMoreBtn.style.display = 'none';
  scrollToBottom();
}

function selectSlot(index) {
  const slot = state.slots[index];
  state.selectedSlot = index;
  addUserMessage(slot.display);
  disableCurrentButtons();

  showTyping();
  setTimeout(() => {
    hideTyping();

    if (slot.friday) {
      state.step = 'confirm_friday';
      addBotMessage(
        `Friday meetings need Mike's approval, but I'll send him the request right away! ` +
        `I'll let him know you'd like to meet on ${slot.display}. He typically responds within a day.`
      );
      addBotMessage(null,
        `<div>Before I send the request — is there anything you'd like Mike to review beforehand? ` +
        `Feel free to email any documents, links, or notes to Michael Sakuma ahead of time so he can prepare.</div>` +
        '<div class="format-buttons" style="margin-top:10px;">' +
          '<button class="format-btn" onclick="confirmFriday(true)">Send the request!</button>' +
          '<button class="format-btn" onclick="confirmFriday(false)">Pick a different time</button>' +
        '</div>'
      );
      hideInput();
    } else if (slot.phoneOnly) {
      // Driving slot — phone only, skip format selection
      state.format = 'Phone';
      addBotMessage(
        `This time slot is during Mike's commute, so it would be a phone call. Mike will call you at ${state.phone}.`
      );
      promptPreMeetingThenBook();
    } else {
      // Ask format preference — check if Farmingdale contact
      state.step = 'format';
      const isFarmingdale = state.reason.toLowerCase().includes('farmingdale') ||
        state.name.toLowerCase().includes('farmingdale');

      if (isFarmingdale) {
        // Farmingdale meetings are on Teams
        state.format = 'Teams';
        addBotMessage("Since this is a Farmingdale meeting, we'll set this up on Microsoft Teams.");
        promptPreMeetingThenBook();
      } else {
        addBotMessage(null,
          `Would you prefer a phone call or Zoom?` +
          '<div class="format-buttons" style="margin-top:10px;">' +
            '<button class="format-btn" onclick="selectFormat(\'Phone\')">Phone Call</button>' +
            '<button class="format-btn" onclick="selectFormat(\'Zoom\')">Zoom</button>' +
            '<button class="format-btn" onclick="selectFormat(\'Teams\')">Microsoft Teams</button>' +
          '</div>'
        );
        hideInput();
      }
    }
  }, 700);
}

function selectFormat(fmt) {
  state.format = fmt;
  addUserMessage(fmt);
  disableCurrentButtons();

  showTyping();
  setTimeout(() => {
    hideTyping();
    if (fmt === 'Phone') {
      addBotMessage(`Mike will call you at ${state.phone}.`);
    } else if (fmt === 'Teams') {
      addBotMessage("A Microsoft Teams link will be included in the calendar invite.");
    } else {
      addBotMessage("A Zoom link will be included in the calendar invite.");
    }
    promptPreMeetingThenBook();
  }, 500);
}

function promptPreMeetingThenBook() {
  showTyping();
  setTimeout(() => {
    hideTyping();
    addBotMessage(null,
      `<div>Is there anything you'd like to send Mike before the meeting? ` +
      `Documents, links, notes, or context are always helpful so he can prepare. ` +
      `Feel free to email materials to Michael Sakuma directly.</div>` +
      '<div class="format-buttons" style="margin-top:10px;">' +
        '<button class="format-btn" onclick="goToBooking()">Book it!</button>' +
        '<button class="format-btn" onclick="pickDifferentTime()">Pick a different time</button>' +
      '</div>'
    );
    hideInput();
  }, 500);
}

async function goToBooking() {
  disableCurrentButtons();
  showTyping();

  const slot = state.slots[state.selectedSlot];

  // Build the Calendly URL with pre-filled info
  const params = new URLSearchParams({
    name: state.name,
    a1: state.reason,
  });

  // Add the selected date/time
  const slotDate = new Date(slot.isoStart);
  const month = String(slotDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(slotDate.getUTCDate()).padStart(2, '0');
  const year = slotDate.getUTCFullYear();
  const dateStr = `${year}-${month}-${day}`;

  // Calendly URL with date pre-selected
  const bookingUrl = `${state.schedulingUrl}/${dateStr}?${params.toString()}`;

  hideTyping();

  addBotMessage(null,
    `<div>Awesome! Click below to finalize your booking. The time and your info will be pre-filled!</div>` +
    `<div style="margin-top:12px;">` +
      `<a href="${bookingUrl}" target="_blank" class="format-btn" ` +
      `style="display:inline-block; text-decoration:none; text-align:center; background:#667eea; color:white; border:none; padding:12px 24px;">` +
      `Complete Booking on Calendly</a>` +
    `</div>`
  );

  setTimeout(() => {
    addBotMessage(
      `A quick reminder: feel free to email Michael Sakuma any materials or context ahead ` +
      `of the meeting so he can be prepared.`
    );
    // Offer follow-up meeting
    setTimeout(() => {
      addBotMessage(null,
        `<div>Would you also like to schedule a follow-up meeting in two weeks at the same time?</div>` +
        '<div class="format-buttons" style="margin-top:10px;">' +
          '<button class="format-btn" onclick="scheduleFollowUp(true)">Yes, schedule a follow-up!</button>' +
          '<button class="format-btn" onclick="scheduleFollowUp(false)">No thanks, all set!</button>' +
        '</div>'
      );
      hideInput();
    }, 800);
  }, 800);
}

async function scheduleFollowUp(wantFollowUp) {
  disableCurrentButtons();

  if (!wantFollowUp) {
    addUserMessage("No thanks, all set!");
    addBotMessage(`No problem! Thanks, ${state.name}! Looking forward to connecting.`);
    hideInput();
    return;
  }

  addUserMessage("Yes, schedule a follow-up!");
  showTyping();

  const slot = state.slots[state.selectedSlot];
  const originalDate = new Date(slot.isoStart);

  // Calculate 2 weeks later
  const followUpDate = new Date(originalDate);
  followUpDate.setDate(followUpDate.getDate() + 14);

  const month = String(followUpDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(followUpDate.getUTCDate()).padStart(2, '0');
  const year = followUpDate.getUTCFullYear();
  const dateStr = `${year}-${month}-${day}`;

  const params = new URLSearchParams({
    name: state.name,
    a1: `Follow-up: ${state.reason}`,
  });

  const followUpUrl = `${state.schedulingUrl}/${dateStr}?${params.toString()}`;

  // Format the follow-up date for display
  const followUpDisplay = followUpDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  hideTyping();

  addBotMessage(null,
    `<div>I've set up a follow-up for <strong>${followUpDisplay}</strong> at the same time. ` +
    `Click below to confirm the follow-up booking!</div>` +
    `<div style="margin-top:12px;">` +
      `<a href="${followUpUrl}" target="_blank" class="format-btn" ` +
      `style="display:inline-block; text-decoration:none; text-align:center; background:#667eea; color:white; border:none; padding:12px 24px;">` +
      `Book Follow-Up on Calendly</a>` +
    `</div>`
  );

  setTimeout(() => {
    addBotMessage(`Thanks, ${state.name}! Looking forward to both meetings!`);
  }, 600);

  hideInput();
}

async function confirmFriday(sendIt) {
  disableCurrentButtons();
  if (!sendIt) {
    pickDifferentTime();
    return;
  }

  showTyping();
  try {
    const slot = state.slots[state.selectedSlot];
    const res = await fetch('/api/friday-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: state.name,
        phone: state.phone,
        reason: state.reason,
        duration: state.duration,
        timeZone: state.timeZone,
        preferredTime: slot.display,
      }),
    });

    hideTyping();
    const data = await res.json();

    if (data.success) {
      addBotMessage(
        `I've sent the request to Mike! He'll get back to you about the Friday ` +
        `meeting on ${slot.display}. In the meantime, feel free to email Michael Sakuma ` +
        `any materials or context for the meeting. Thanks, ${state.name}!`
      );
    } else {
      addBotMessage("I had trouble sending the request. You can email Mike directly to request a Friday meeting.");
    }
  } catch (err) {
    hideTyping();
    addBotMessage("I had trouble sending the request. You can email Mike directly to request a Friday meeting.");
  }
  hideInput();
}

function pickDifferentTime() {
  addUserMessage("Pick a different time");
  fetchSlots();
}

function handleOtherTimesResponse(text) {
  const lower = text.toLowerCase();
  if (lower.includes('friday') || lower.includes('yes') || lower.includes('sure') || lower.includes('further')) {
    fetchSlots();
  } else {
    addBotMessage(
      `No problem! You can always email Mike directly and he'll find a time that works. ` +
      `Thanks for reaching out, ${state.name}!`
    );
    hideInput();
  }
}
