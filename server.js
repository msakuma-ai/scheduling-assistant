require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const {
  getAvailableTimes,
  getScheduledEvents,
  hasBuffer,
  createSchedulingLink,
  EVENT_TYPES,
  SCHEDULING_URLS,
} = require('./calendly');
const { sendFridayRequest } = require('./email');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Timezone helpers
function tzToIANA(tz) {
  const map = {
    'Eastern': 'America/New_York', 'Central': 'America/Chicago',
    'Mountain': 'America/Denver', 'Pacific': 'America/Los_Angeles',
    'Alaska': 'America/Anchorage', 'Hawaii': 'Pacific/Honolulu',
  };
  return map[tz] || 'America/New_York';
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${period}`;
}

function formatSlotTime(date, userTZ) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const etDate = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayName = days[etDate.getDay()];
  const month = months[etDate.getMonth()];
  const day = etDate.getDate();
  const hour = etDate.getHours();
  const minutes = etDate.getMinutes();
  const etTime = minutes === 0 ? formatHour(hour) : `${hour > 12 ? hour - 12 : hour}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;

  if (!userTZ || userTZ === 'Eastern') return `${dayName}, ${month} ${day} at ${etTime} ET`;

  const userDate = new Date(date.toLocaleString('en-US', { timeZone: tzToIANA(userTZ) }));
  const uHour = userDate.getHours();
  const uMin = userDate.getMinutes();
  const userTime = uMin === 0 ? formatHour(uHour) : `${uHour > 12 ? uHour - 12 : uHour}:${String(uMin).padStart(2, '0')} ${uHour >= 12 ? 'PM' : 'AM'}`;
  const tzAbbrev = userTZ.slice(0, 1) + 'T';
  return `${dayName}, ${month} ${day} at ${userTime} ${tzAbbrev} (${etTime} ET)`;
}

function getSlotTier(etDate) {
  const dow = etDate.getDay();
  const hour = etDate.getHours();
  if ((dow === 2 || dow === 4) && (hour === 11 || hour === 18))
    return { tier: 1, phoneOnly: true, label: 'driving' };
  if (dow === 3 && (hour === 11 || hour === 17))
    return { tier: 1, phoneOnly: true, label: 'driving' };
  if ((dow >= 2 && dow <= 4) && hour >= 12 && hour < 17)
    return { tier: 2, phoneOnly: false };
  if (dow === 1 && hour >= 15 && hour < 18)
    return { tier: 2.5, phoneOnly: false };
  if ((dow >= 1 && dow <= 4) && hour >= 17 && hour < 20)
    return { tier: 3, phoneOnly: false };
  if (dow === 5 && hour >= 9 && hour < 20)
    return { tier: 5, phoneOnly: false, friday: true };
  if (dow >= 1 && dow <= 4 && hour >= 9 && hour < 20)
    return { tier: 4, phoneOnly: false };
  return null;
}

// Fetch available slots
async function fetchAvailableSlots(durationMinutes, userTZ, timeframe) {
  const eventTypeKey = durationMinutes <= 45 ? 'phone' : 'general';
  const eventTypeUri = EVENT_TYPES[eventTypeKey];

  const now = new Date();
  const startDate = new Date(now);
  let daysAhead = 14;
  if (timeframe === 'few_days') daysAhead = 4;
  else if (timeframe === 'this_week') daysAhead = 7;
  else if (timeframe === 'next_week') {
    const dayOfWeek = startDate.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    startDate.setDate(startDate.getDate() + daysUntilMonday);
    daysAhead = 7;
  } else if (timeframe === 'two_weeks') daysAhead = 21;

  const week1End = new Date(startDate);
  week1End.setDate(week1End.getDate() + Math.min(6, daysAhead));
  const week2Start = new Date(week1End);
  week2Start.setDate(week2Start.getDate() + 1);
  const week2End = new Date(week2Start);
  week2End.setDate(week2End.getDate() + Math.min(6, Math.max(0, daysAhead - 7)));
  const overallEnd = new Date(startDate);
  overallEnd.setDate(overallEnd.getDate() + daysAhead);

  const fetches = [
    getAvailableTimes(eventTypeUri, startDate, week1End),
    getScheduledEvents(startDate, overallEnd),
  ];
  if (daysAhead > 7) fetches.push(getAvailableTimes(eventTypeUri, week2Start, week2End));
  if (daysAhead > 14) {
    const week3Start = new Date(week2End);
    week3Start.setDate(week3Start.getDate() + 1);
    const week3End = new Date(week3Start);
    week3End.setDate(week3End.getDate() + 6);
    fetches.push(getAvailableTimes(eventTypeUri, week3Start, week3End));
  }

  const results = await Promise.all(fetches);
  const scheduledEvents = results[1];
  const availableTimes = [results[0], ...results.slice(2)].flat();

  const available = availableTimes
    .filter(s => s.status === 'available')
    .filter(s => s.start > now);

  const scored = [];
  for (const slot of available) {
    const slotEnd = new Date(slot.start.getTime() + durationMinutes * 60 * 1000);
    if (!hasBuffer(slot.start, slotEnd, scheduledEvents)) continue;

    const etDate = new Date(slot.start.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const endEtDate = new Date(slotEnd.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    if (endEtDate.getHours() > 20 || (endEtDate.getHours() === 20 && endEtDate.getMinutes() > 0)) continue;

    const tierInfo = getSlotTier(etDate);
    if (!tierInfo) continue;

    scored.push({
      display: formatSlotTime(slot.start, userTZ),
      tier: tierInfo.tier,
      phoneOnly: tierInfo.phoneOnly || false,
      friday: tierInfo.friday || false,
      label: tierInfo.label || '',
      isoStart: slot.start.toISOString(),
    });
  }

  scored.sort((a, b) => a.tier !== b.tier ? a.tier - b.tier : new Date(a.isoStart) - new Date(b.isoStart));

  return {
    slots: scored.slice(0, 10),
    schedulingUrl: SCHEDULING_URLS[eventTypeKey],
    eventTypeKey,
  };
}

// System prompt for the conversational assistant
const SYSTEM_PROMPT = `You are Michael Sakuma's friendly scheduling assistant. Your job is to help people find a time to meet with Michael (Mike). You're warm, casual, and helpful — like a real person texting, not a corporate bot.

PERSONALITY:
- Casual and warm. Use contractions. Be brief.
- Don't say things like "Nice to meet you" — you haven't met them.
- Sound like a friendly human assistant, not a chatbot.
- Keep responses SHORT — 1-3 sentences max. This is a chat, not email.

INFORMATION TO COLLECT (in natural conversation, not as a rigid form):
1. Their name
2. Phone/text number
3. What they want to meet about (brief)
4. How long they need (15, 30, 45, or 60 min)
5. Their time zone
6. When they're looking to meet (next few days, this week, next week, 2 weeks out)

Don't ask all of these at once. Weave them into conversation naturally. If someone asks a question, answer it before continuing to collect info.

SCHEDULING RULES (know these but don't recite them):
- Mike is available Monday through Thursday, up to 8pm Eastern
- Fridays require Mike's approval — if someone wants Friday, note that you'll send Mike a request
- Monday meetings: typically 3-6pm
- Best times: Tuesday-Thursday afternoons (12-5pm)
- Mike has some commute times where he can only do phone: Tue/Thu 11am-12pm and 6-7pm, Wed 11am-12pm and 5-6pm
- Mike prefers phone calls over Zoom — he's been trying to cut back on Zoom fatigue. Mention this naturally once, don't repeat it.
- If someone mentions Farmingdale, meetings will be on Microsoft Teams
- Always allow 5 minutes between appointments
- If someone is not in Eastern time, convert times for them

WHEN YOU HAVE ENOUGH INFO:
Call the get_available_slots tool to fetch real availability. Then present the TOP 3 preferred slots. If they want more options, show additional slots.

AFTER THEY PICK A TIME:
- Ask phone or Zoom (or Teams for Farmingdale). Mention casually that Mike's been doing more phone meetings lately to cut back on screen time.
- Remind them they can email Mike any materials beforehand
- Provide the Calendly booking link
- Ask if they'd like a follow-up meeting in 2 weeks at the same time

IMPORTANT:
- You can answer questions about Mike's availability naturally ("Yes, Mike does have some Wednesday availability!")
- If someone goes off-topic, gently steer back
- Never make up availability — always use the tool to check
- Today's date is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}`;

// Tool definitions for Claude
const TOOLS = [
  {
    name: 'get_available_slots',
    description: 'Fetch available meeting slots from the calendar. Call this when you have enough information about duration and preferred timeframe.',
    input_schema: {
      type: 'object',
      properties: {
        duration: { type: 'number', description: 'Meeting duration in minutes (15, 30, 45, or 60)' },
        timeZone: { type: 'string', description: 'User timezone: Eastern, Central, Mountain, Pacific, Alaska, or Hawaii. Default Eastern.' },
        timeframe: { type: 'string', enum: ['few_days', 'this_week', 'next_week', 'two_weeks'], description: 'When they want to meet' },
      },
      required: ['duration'],
    },
  },
  {
    name: 'get_booking_link',
    description: 'Generate a Calendly booking link for a specific slot the user has chosen.',
    input_schema: {
      type: 'object',
      properties: {
        schedulingUrl: { type: 'string', description: 'The base Calendly scheduling URL' },
        isoStart: { type: 'string', description: 'ISO start time of the chosen slot' },
        name: { type: 'string', description: 'The person\'s name' },
        reason: { type: 'string', description: 'Meeting reason/topic' },
      },
      required: ['schedulingUrl', 'isoStart', 'name'],
    },
  },
  {
    name: 'send_friday_request',
    description: 'Send an email to Michael requesting approval for a Friday meeting.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        phone: { type: 'string' },
        reason: { type: 'string' },
        duration: { type: 'number' },
        timeZone: { type: 'string' },
        preferredTime: { type: 'string' },
      },
      required: ['name', 'reason', 'preferredTime'],
    },
  },
];

// Handle tool calls
async function handleToolCall(toolName, toolInput) {
  switch (toolName) {
    case 'get_available_slots': {
      const data = await fetchAvailableSlots(
        toolInput.duration || 30,
        toolInput.timeZone || 'Eastern',
        toolInput.timeframe || 'this_week'
      );
      return JSON.stringify(data);
    }
    case 'get_booking_link': {
      const slotDate = new Date(toolInput.isoStart);
      const month = String(slotDate.getUTCMonth() + 1).padStart(2, '0');
      const day = String(slotDate.getUTCDate()).padStart(2, '0');
      const year = slotDate.getUTCFullYear();
      const dateStr = `${year}-${month}-${day}`;
      const params = new URLSearchParams({ name: toolInput.name || '' });
      if (toolInput.reason) params.set('a1', toolInput.reason);
      const bookingUrl = `${toolInput.schedulingUrl}/${dateStr}?${params.toString()}`;
      return JSON.stringify({ bookingUrl });
    }
    case 'send_friday_request': {
      try {
        await sendFridayRequest(toolInput);
        return JSON.stringify({ success: true });
      } catch (e) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }
    default:
      return JSON.stringify({ error: 'Unknown tool' });
  }
}

// API: Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { messages } = req.body;

    // Call Claude with tools
    let response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    // Handle tool use loops
    while (response.stop_reason === 'tool_use') {
      const assistantMessage = { role: 'assistant', content: response.content };
      const toolResults = [];

      for (const block of response.content) {
        if (block.type === 'tool_use') {
          const result = await handleToolCall(block.name, block.input);
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      const updatedMessages = [
        ...messages,
        assistantMessage,
        { role: 'user', content: toolResults },
      ];

      response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: updatedMessages,
      });

      // Update messages for potential next loop
      messages.push(assistantMessage);
      messages.push({ role: 'user', content: toolResults });
    }

    // Extract text response
    const textContent = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n');

    res.json({ reply: textContent, messages: [...messages, { role: 'assistant', content: response.content }] });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Keep the slots endpoint for direct access if needed
app.post('/api/slots', async (req, res) => {
  try {
    const { duration, timeZone, timeframe } = req.body;
    const data = await fetchAvailableSlots(duration || 30, timeZone || 'Eastern', timeframe || 'this_week');
    res.json(data);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Unable to check availability.' });
  }
});

app.post('/api/friday-request', async (req, res) => {
  try {
    await sendFridayRequest(req.body);
    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Unable to send request.' });
  }
});

app.listen(PORT, () => {
  console.log(`Scheduling assistant running at http://localhost:${PORT}`);
});
