require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const path = require('path');
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
const HOST_NAME = process.env.HOST_NAME || 'Mike Sakuma';

// Timezone offset map (hours relative to ET)
const TZ_OFFSETS = {
  'Eastern': 0,
  'Central': -1,
  'Mountain': -2,
  'Pacific': -3,
  'Alaska': -4,
  'Hawaii': -5,
};

function toUserHour(easternHour, userTZ) {
  const offset = TZ_OFFSETS[userTZ] || 0;
  return easternHour + offset;
}

function formatHour(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:00 ${period}`;
}

function formatSlotTime(date, userTZ) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Get ET components
  const etStr = date.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const etDate = new Date(etStr);
  const dayName = days[etDate.getDay()];
  const month = months[etDate.getMonth()];
  const day = etDate.getDate();
  const hour = etDate.getHours();
  const minutes = etDate.getMinutes();
  const etTime = minutes === 0 ? formatHour(hour) : `${hour > 12 ? hour - 12 : hour}:${String(minutes).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;

  if (userTZ === 'Eastern') {
    return `${dayName}, ${month} ${day} at ${etTime} ET`;
  }

  // Show user's local time too
  const userDate = new Date(date.toLocaleString('en-US', { timeZone: tzToIANA(userTZ) }));
  const uHour = userDate.getHours();
  const uMin = userDate.getMinutes();
  const userTime = uMin === 0 ? formatHour(uHour) : `${uHour > 12 ? uHour - 12 : uHour}:${String(uMin).padStart(2, '0')} ${uHour >= 12 ? 'PM' : 'AM'}`;
  const tzAbbrev = userTZ.slice(0, 1) + 'T';
  return `${dayName}, ${month} ${day} at ${userTime} ${tzAbbrev} (${etTime} ET)`;
}

function tzToIANA(tz) {
  const map = {
    'Eastern': 'America/New_York',
    'Central': 'America/Chicago',
    'Mountain': 'America/Denver',
    'Pacific': 'America/Los_Angeles',
    'Alaska': 'America/Anchorage',
    'Hawaii': 'Pacific/Honolulu',
  };
  return map[tz] || 'America/New_York';
}

// Determine the tier/priority of a time slot based on ET hour and day of week
function getSlotTier(etDate) {
  const dow = etDate.getDay(); // 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
  const hour = etDate.getHours();

  // Tier 1: Driving times (phone only)
  // TU/TH 11-12, TU/TH 6-7pm (18), W 11-12, W 5-6pm (17)
  if ((dow === 2 || dow === 4) && (hour === 11 || hour === 18)) {
    return { tier: 1, phoneOnly: true, label: 'driving' };
  }
  if (dow === 3 && (hour === 11 || hour === 17)) {
    return { tier: 1, phoneOnly: true, label: 'driving' };
  }

  // Tier 2: TU-TH 12-5pm
  if ((dow >= 2 && dow <= 4) && hour >= 12 && hour < 17) {
    return { tier: 2, phoneOnly: false };
  }

  // Tier 3: M-TH evening (5-8pm, excluding driving slots)
  if ((dow >= 1 && dow <= 4) && hour >= 17 && hour < 20) {
    return { tier: 3, phoneOnly: false };
  }

  // Tier 4: Monday 3-6pm
  if (dow === 1 && hour >= 15 && hour < 18) {
    return { tier: 2.5, phoneOnly: false }; // Between tier 2 and 3 priority
  }

  // Tier 5: Friday
  if (dow === 5 && hour >= 9 && hour < 20) {
    return { tier: 5, phoneOnly: false, friday: true };
  }

  // Other valid times (M-TH before 8pm)
  if (dow >= 1 && dow <= 4 && hour >= 9 && hour < 20) {
    return { tier: 4, phoneOnly: false };
  }

  return null; // Not a valid scheduling time
}

// Pick the right Calendly event type based on duration
function pickEventType(durationMinutes) {
  // Phone Consultation supports 10, 30, 45
  // Office Hours is 30
  // General Meetings is 45
  // Default to phone consultation since we prioritize phone
  if (durationMinutes <= 10) return 'phone';
  if (durationMinutes <= 30) return 'phone';
  if (durationMinutes <= 45) return 'phone';
  return 'general'; // 60 min — use general
}

// API: Get available slots with priority sorting
app.post('/api/slots', async (req, res) => {
  try {
    const { duration, timeZone, timeframe } = req.body;
    const eventTypeKey = pickEventType(duration);
    const eventTypeUri = EVENT_TYPES[eventTypeKey];

    // Determine date range based on timeframe
    const now = new Date();
    const startDate = new Date(now);

    // Calculate how many days ahead to look based on timeframe
    let daysAhead = 14;
    if (timeframe === 'few_days') daysAhead = 4;
    else if (timeframe === 'this_week') daysAhead = 7;
    else if (timeframe === 'next_week') {
      // Start from next Monday
      const dayOfWeek = startDate.getDay();
      const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
      startDate.setDate(startDate.getDate() + daysUntilMonday);
      daysAhead = 7;
    } else if (timeframe === 'two_weeks') daysAhead = 21;

    // Query in weekly chunks (Calendly 7-day limit)
    const week1End = new Date(startDate);
    week1End.setDate(week1End.getDate() + Math.min(6, daysAhead));
    const week2Start = new Date(week1End);
    week2Start.setDate(week2Start.getDate() + 1);
    const week2End = new Date(week2Start);
    week2End.setDate(week2End.getDate() + Math.min(6, Math.max(0, daysAhead - 7)));
    const overallEnd = new Date(startDate);
    overallEnd.setDate(overallEnd.getDate() + daysAhead);

    // Fetch in weekly chunks (only query second/third week if needed)
    const fetches = [
      getAvailableTimes(eventTypeUri, startDate, week1End),
      getScheduledEvents(startDate, overallEnd),
    ];
    if (daysAhead > 7) {
      fetches.push(getAvailableTimes(eventTypeUri, week2Start, week2End));
    }
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

    // Filter to only available slots
    const available = availableTimes
      .filter(s => s.status === 'available')
      .filter(s => s.start > now);

    // Apply 5-min buffer check and priority tiers
    const scored = [];
    for (const slot of available) {
      const slotEnd = new Date(slot.start.getTime() + duration * 60 * 1000);

      // Check 5-min buffer
      if (!hasBuffer(slot.start, slotEnd, scheduledEvents)) continue;

      // Get ET time for tier calculation
      const etStr = slot.start.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const etDate = new Date(etStr);

      // Check 8pm ET cutoff
      const endEtStr = slotEnd.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const endEtDate = new Date(endEtStr);
      if (endEtDate.getHours() >= 20 && endEtDate.getMinutes() > 0) continue;
      if (endEtDate.getHours() > 20) continue;

      const tierInfo = getSlotTier(etDate);
      if (!tierInfo) continue;

      scored.push({
        start: slot.start,
        display: formatSlotTime(slot.start, timeZone || 'Eastern'),
        tier: tierInfo.tier,
        phoneOnly: tierInfo.phoneOnly || false,
        friday: tierInfo.friday || false,
        label: tierInfo.label || '',
        isoStart: slot.start.toISOString(),
      });
    }

    // Sort by tier (lower = higher priority), then by date
    scored.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier - b.tier;
      return a.start - b.start;
    });

    // Return top 6 slots
    // Return more slots so frontend can split into preferred + more
    const slots = scored.slice(0, 10);

    res.json({
      slots,
      schedulingUrl: SCHEDULING_URLS[eventTypeKey],
      eventTypeKey,
    });
  } catch (err) {
    console.error('Error finding slots:', err);
    res.status(500).json({ error: 'Unable to check availability right now. Please try again.' });
  }
});

// API: Create a one-off scheduling link for booking
app.post('/api/booking-link', async (req, res) => {
  try {
    const { eventTypeKey } = req.body;
    const eventTypeUri = EVENT_TYPES[eventTypeKey || 'phone'];
    const bookingUrl = await createSchedulingLink(eventTypeUri);
    res.json({ bookingUrl });
  } catch (err) {
    console.error('Booking link error:', err);
    // Fallback to regular scheduling URL
    res.json({ bookingUrl: SCHEDULING_URLS[eventTypeKey || 'phone'] });
  }
});

// API: Send Friday request via email
app.post('/api/friday-request', async (req, res) => {
  try {
    const { name, phone, reason, duration, timeZone, preferredTime } = req.body;
    await sendFridayRequest({ name, phone, reason, duration, timeZone, preferredTime });
    res.json({ success: true });
  } catch (err) {
    console.error('Email error:', err);
    res.status(500).json({ error: 'Unable to send the request. Please try again.' });
  }
});

app.listen(PORT, () => {
  console.log(`Scheduling assistant running at http://localhost:${PORT}`);
});
