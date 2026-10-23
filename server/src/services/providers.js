// Delivery providers. Default logs to the console; set NOTIFY_WEBHOOK_URL to forward email/SMS/WhatsApp
// to any gateway (Twilio, SendGrid, a WhatsApp BSP...) through one small adapter service.

const consoleProvider = async (n) => {
  console.log(`[notify:${n.channel}] to=${n.to} :: ${n.body}`);
};

const webhookProvider = async (n, url) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ channel: n.channel, to: n.to, subject: n.subject, body: n.body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Gateway responded ${res.status}`);
};

export const deliver = async (notification) => {
  if (notification.channel === 'in_app') return; // stored notification is the delivery
  const url = process.env.NOTIFY_WEBHOOK_URL; // read per send so it can change without a restart
  return url ? webhookProvider(notification, url) : consoleProvider(notification);
};
