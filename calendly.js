// dotenv loaded by server.js

const API_BASE = 'https://api.calendly.com';
const TOKEN = () => process.env.CALENDLY_API_TOKEN;
const USER_URI = 'https://api.calendly.com/users/bd91b6b2-e1be-47e2-8e3b-25ce08963ead';

// Event type URIs
const EVENT_TYPES = {
  phone: 'https://api.calendly.com/event_types/9830b921-bacc-419d-a5d3-938928c5cfd6',
  office: 'https://api.calendly.com/event_types/cb698f56-7f9a-4317-b6ad-3f0a9fbbb4e5',
  general: 'https://api.calendly.com/event_types/1dbfedab-e4d0-4ae7-af6c-f5370fdb1854',
};

// Scheduling URLs for redirect-based booking
const SCHEDULING_URLS = {
  phone: 'https://calendly.com/msakuma-jze/quick-check-in',
  office: 'https://calendly.com/msakuma-jze/office-hours-meeting',
  general: 'https://calendly.com/msakuma-jze/saybrook-meetings',
};

async function calendlyFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${TOKEN()}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Calendly API error ${res.status}: ${text}`);
  }
  return res.json();
}

// Get available time slots from Calendly for a date range
async function getAvailableTimes(eventTypeUri, startDate, endDate) {
  // Ensure start is in the future
  const now = new Date();
  const effectiveStart = startDate > now ? startDate : new Date(now.getTime() + 60000);
  const start = effectiveStart.toISOString();
  const end = endDate.toISOString();

  const data = await calendlyFetch(
    `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri)}` +
    `&start_time=${start}&end_time=${end}`
  );

  return data.collection.map(slot => ({
    start: new Date(slot.start_time),
    status: slot.status,
  }));
}

// Get scheduled events to check for conflicts (with 5-min buffer)
async function getScheduledEvents(startDate, endDate) {
  const data = await calendlyFetch(
    `/scheduled_events?user=${encodeURIComponent(USER_URI)}` +
    `&min_start_time=${startDate.toISOString()}` +
    `&max_start_time=${endDate.toISOString()}` +
    `&status=active`
  );

  return data.collection.map(evt => ({
    start: new Date(evt.start_time),
    end: new Date(evt.end_time),
    name: evt.name,
  }));
}

// Check if a slot has at least 5 min buffer from existing events
const BUFFER_MS = 5 * 60 * 1000;

function hasBuffer(slotStart, slotEnd, events) {
  for (const evt of events) {
    const evtStartBuf = new Date(evt.start.getTime() - BUFFER_MS);
    const evtEndBuf = new Date(evt.end.getTime() + BUFFER_MS);
    if (slotStart < evtEndBuf && slotEnd > evtStartBuf) {
      return false;
    }
  }
  return true;
}

// Create a one-off scheduling link for a specific time
async function createSchedulingLink(eventTypeUri) {
  const data = await calendlyFetch('/scheduling_links', {
    method: 'POST',
    body: JSON.stringify({
      max_event_count: 1,
      owner: eventTypeUri,
      owner_type: 'EventType',
    }),
  });

  return data.resource.booking_url;
}

module.exports = {
  getAvailableTimes,
  getScheduledEvents,
  hasBuffer,
  createSchedulingLink,
  EVENT_TYPES,
  SCHEDULING_URLS,
  USER_URI,
};
