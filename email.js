const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

async function sendFridayRequest({ name, phone, reason, duration, timeZone, preferredTime }) {
  const t = getTransporter();
  const hostName = process.env.HOST_NAME || 'Michael';

  const html = `
    <h2>Friday Meeting Request</h2>
    <p>Someone would like to schedule a Friday meeting. Please review and approve.</p>
    <table style="border-collapse:collapse; font-family:sans-serif;">
      <tr><td style="padding:6px 12px; font-weight:bold;">Name:</td><td style="padding:6px 12px;">${name}</td></tr>
      <tr><td style="padding:6px 12px; font-weight:bold;">Phone:</td><td style="padding:6px 12px;">${phone}</td></tr>
      <tr><td style="padding:6px 12px; font-weight:bold;">Reason:</td><td style="padding:6px 12px;">${reason}</td></tr>
      <tr><td style="padding:6px 12px; font-weight:bold;">Duration:</td><td style="padding:6px 12px;">${duration} minutes</td></tr>
      <tr><td style="padding:6px 12px; font-weight:bold;">Time Zone:</td><td style="padding:6px 12px;">${timeZone}</td></tr>
      <tr><td style="padding:6px 12px; font-weight:bold;">Preferred Time:</td><td style="padding:6px 12px;">${preferredTime}</td></tr>
    </table>
    <p style="margin-top:20px;">Reply to approve or suggest an alternative.</p>
  `;

  await t.sendMail({
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_TO,
    subject: `Friday Meeting Request from ${name}`,
    html,
  });
}

module.exports = { sendFridayRequest };
