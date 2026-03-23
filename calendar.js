const { google } = require('googleapis');

let calendarClient = null;

function getCalendar() {
  if (calendarClient) return calendarClient;

  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar.readonly']
  );

  calendarClient = google.calendar({ version: 'v3', auth });
  return calendarClient;
}

// Get busy times for a date range
async function getBusyTimes(startDate, endDate) {
  const calendar = getCalendar();
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      timeZone: 'America/New_York',
      items: [{ id: calendarId }],
    },
  });

  const busy = res.data.calendars[calendarId]?.busy || [];
  return busy.map(b => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

// Check if a specific time slot is available (with 5-min buffer between appointments)
const BUFFER_MS = 5 * 60 * 1000;

function isSlotFree(slotStart, slotEnd, busyTimes) {
  for (const busy of busyTimes) {
    const busyStartBuffered = new Date(busy.start.getTime() - BUFFER_MS);
    const busyEndBuffered = new Date(busy.end.getTime() + BUFFER_MS);
    if (slotStart < busyEndBuffered && slotEnd > busyStartBuffered) {
      return false;
    }
  }
  return true;
}

// Create a calendar event
async function createEvent({ summary, description, startTime, endTime, attendeeEmail }) {
  const auth = new google.auth.JWT(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );

  const calendar = google.calendar({ version: 'v3', auth });
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  const event = {
    summary,
    description,
    start: { dateTime: startTime.toISOString(), timeZone: 'America/New_York' },
    end: { dateTime: endTime.toISOString(), timeZone: 'America/New_York' },
  };

  const res = await calendar.events.insert({
    calendarId,
    requestBody: event,
  });

  return res.data;
}

module.exports = { getBusyTimes, isSlotFree, createEvent };
