# Scheduling Assistant — Setup Guide

## 1. Google Calendar API

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable the **Google Calendar API**
4. Go to **IAM & Admin > Service Accounts** and create a service account
5. Create a JSON key for the service account — download it
6. From the JSON key, copy `client_email` and `private_key` into your `.env`:
   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=your-sa@project.iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   GOOGLE_CALENDAR_ID=your-email@gmail.com
   ```
7. **Share your Google Calendar** with the service account email (give it "Make changes to events" permission)

## 2. Email (for Friday requests)

1. Use a Gmail account
2. Go to [Google App Passwords](https://myaccount.google.com/apppasswords) and generate one
3. Add to `.env`:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-specific-password
   EMAIL_TO=your-email@gmail.com
   ```

## 3. Run

```bash
cd scheduling-assistant
npm install
npm start
```

The app runs at `http://localhost:3000`.

## 4. Deploy (make it public)

To share the link with others, deploy to a hosting service:

- **Railway**: `railway up`
- **Render**: Connect your GitHub repo
- **Fly.io**: `fly launch && fly deploy`
- **Ngrok** (quick/temporary): `ngrok http 3000`

## Scheduling Rules Built In

| Priority | Days | Times (ET) | Notes |
|----------|------|------------|-------|
| 1 (highest) | Tue/Thu | 11am-12pm, 6-7pm | Driving — phone only |
| 1 (highest) | Wed | 11am-12pm, 5-6pm | Driving — phone only |
| 2 | Tue-Thu | 12-5pm | Phone preferred |
| 3 | Mon-Thu | 5-8pm (remaining) | Phone preferred |
| 4 | Mon | 3-6pm | Phone preferred |
| 5 (lowest) | Fri | Any time | Requires email approval |

- 5-minute buffer between all appointments
- All times capped at 8pm ET
- Phone is prioritized over Zoom (Zoom fatigue messaging)
- Non-Eastern time zones are auto-converted
- Friday meetings require your email approval
- Users are prompted to send materials before the meeting
