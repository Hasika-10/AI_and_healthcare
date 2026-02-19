const express = require('express');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'db.json');

const app = express();
app.use(express.json());

let db = { reminders: [] };

function loadDb() {
  if (fs.existsSync(DB_PATH)) {
    try {
      db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    } catch (e) {
      console.error('Failed to parse db.json, starting fresh', e);
      db = { reminders: [] };
    }
  } else {
    saveDb();
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

// Basic in-memory scheduler (server must stay running)
const scheduled = new Map();

function scheduleReminder(rem) {
  const now = Date.now();
  const t = new Date(rem.time).getTime();
  const delay = t - now;
  if (delay <= 0) return; // skip past reminders
  if (scheduled.has(rem.id)) clearTimeout(scheduled.get(rem.id));
  const id = setTimeout(() => {
    console.log(`Reminder: ${rem.name} (id:${rem.id}) - ${rem.type}`);
    // In a real app you'd notify clients (websockets/push), here we just log
    scheduled.delete(rem.id);
    // mark as fired
    rem.fired = true;
    saveDb();
  }, delay);
  scheduled.set(rem.id, id);
}

function scheduleAll() {
  db.reminders.forEach(r => {
    if (!r.fired) scheduleReminder(r);
  });
}

// Simple prescription parser: looks for lines like "Name x COUNT every N hours" or "Take X tablets at HH:MM"
function parsePrescription(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const results = [];
  for (const line of lines) {
    // examples: Paracetamol 2 tablets every 8 hours
    let m = line.match(/^(.*?)\s+(\d+)\s*(tablets|tabs|pills)?\s*(every\s*(\d+)\s*hours)?/i);
    if (m) {
      const name = m[1].trim();
      const count = parseInt(m[2], 10) || 1;
      const everyHours = m[5] ? parseInt(m[5], 10) : null;
      results.push({ name, count, everyHours });
      continue;
    }
    // fallback: try 'Take 1 tablet of Aspirin at 09:00'
    m = line.match(/take\s*(\d+)\s*.*of\s*(.*?)\s*(at\s*(\d{1,2}:\d{2}))?/i);
    if (m) {
      const count = parseInt(m[1], 10);
      const name = m[2].trim();
      const atTime = m[4] || null;
      results.push({ name, count, atTime });
    }
  }
  return results;
}

app.get('/api/reminders', (req, res) => {
  res.json(db.reminders);
});

app.post('/api/reminders', (req, res) => {
  const { name, time, type = 'alarm', tone = null } = req.body;
  if (!name || !time) return res.status(400).json({ error: 'name and time required' });
  const rem = { id: uuidv4(), name, time, type, tone, createdAt: new Date().toISOString(), fired: false };
  db.reminders.push(rem);
  saveDb();
  scheduleReminder(rem);
  res.status(201).json(rem);
});

app.post('/api/parse-prescription', (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  const parsed = parsePrescription(text);
  res.json({ parsed });
});

app.post('/api/prescription-to-reminders', (req, res) => {
  const { parsed, startDate } = req.body; // parsed from parse-prescription endpoint
  if (!parsed || !Array.isArray(parsed)) return res.status(400).json({ error: 'parsed array required' });
  const created = [];
  const base = startDate ? new Date(startDate) : new Date();
  parsed.forEach(item => {
    if (item.everyHours) {
      // schedule next 7 days occurrences
      const occurrences = 7 * Math.ceil(24 / item.everyHours);
      let next = new Date(base);
      for (let i = 0; i < occurrences; i++) {
        const time = new Date(next.getTime() + i * item.everyHours * 3600 * 1000);
        const rem = { id: uuidv4(), name: item.name, time: time.toISOString(), type: 'alarm', tone: null, createdAt: new Date().toISOString(), fired: false };
        db.reminders.push(rem);
        created.push(rem);
      }
    } else if (item.atTime) {
      // schedule for next 7 days at that time
      const [hh, mm] = item.atTime.split(':').map(n => parseInt(n, 10));
      for (let d = 0; d < 7; d++) {
        const dt = new Date(base);
        dt.setDate(dt.getDate() + d);
        dt.setHours(hh, mm, 0, 0);
        const rem = { id: uuidv4(), name: item.name, time: dt.toISOString(), type: 'alarm', tone: null, createdAt: new Date().toISOString(), fired: false };
        db.reminders.push(rem);
        created.push(rem);
      }
    }
  });
  saveDb();
  scheduleAll();
  res.json({ created });
});

// simple delete
app.delete('/api/reminders/:id', (req, res) => {
  const id = req.params.id;
  const idx = db.reminders.findIndex(r => r.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [rem] = db.reminders.splice(idx, 1);
  if (scheduled.has(id)) { clearTimeout(scheduled.get(id)); scheduled.delete(id); }
  saveDb();
  res.json({ removed: rem });
});

app.listen(PORT, () => {
  loadDb();
  scheduleAll();
  console.log(`Medicine reminder backend running on http://localhost:${PORT}`);
});
const express = require('express');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const schedule = require('node-schedule');
const webpush = require('web-push');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

const app = express();
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOAD_DIR));

// initialize DB
const db = new Database(path.join(__dirname, 'data.db'));
db.exec(`
CREATE TABLE IF NOT EXISTS reminders (
  id TEXT PRIMARY KEY,
  medName TEXT NOT NULL,
  time TEXT NOT NULL,
  type TEXT NOT NULL,
  tone TEXT,
  filePath TEXT,
  createdAt TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  keys TEXT NOT NULL,
  createdAt TEXT NOT NULL
);
`);

// web-push setup - require environment variables
const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@example.com';
if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
} else {
  console.warn('VAPID keys not provided. Web Push notifications will be disabled until you set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY.');
}

function scheduleReminder(reminder) {
  const when = new Date(reminder.time);
  if (when <= new Date()) return;
  schedule.scheduleJob(reminder.id, when, async () => {
    console.log('Triggering reminder', reminder.id, reminder.medName);
    // send push to all subscriptions if available
    if (VAPID_PUBLIC && VAPID_PRIVATE) {
      const subs = db.prepare('SELECT * FROM subscriptions').all();
      const payload = JSON.stringify({
        title: 'Medicine Reminder',
        body: `Time to take: ${reminder.medName}`,
        data: { medName: reminder.medName, type: reminder.type, tone: reminder.tone, file: reminder.filePath ? `/uploads/${path.basename(reminder.filePath)}` : null }
      });
      for (const s of subs) {
        const sub = { endpoint: s.endpoint, keys: JSON.parse(s.keys) };
        try { await webpush.sendNotification(sub, payload); }
        catch (err) { console.warn('Push failed for', s.id, err && err.message); }
      }
    }

    // mark occurrence in logs (could extend to email or other channels)
    console.log(`Reminder fired: ${reminder.medName} (${reminder.type}) at ${new Date().toISOString()}`);
  });
}

// schedule any future reminders on startup
(function scheduleAll() {
  const rows = db.prepare('SELECT * FROM reminders').all();
  for (const r of rows) {
    const rem = { id: r.id, medName: r.medName, time: r.time, type: r.type, tone: r.tone, filePath: r.filePath };
    scheduleReminder(rem);
  }
})();

app.get('/api/reminders', (req, res) => {
  const rows = db.prepare('SELECT * FROM reminders ORDER BY time').all();
  res.json(rows);
});

app.post('/api/reminders', upload.single('toneFile'), (req, res) => {
  const id = uuidv4();
  const medName = req.body.medName;
  const time = req.body.time;
  const type = req.body.type || 'alarm';
  const tone = req.body.tone || 'tone1';
  const filePath = req.file ? req.file.path : null;
  if (!medName || !time) return res.status(400).json({ error: 'medName and time required' });
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO reminders (id, medName, time, type, tone, filePath, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, medName, time, type, tone, filePath, createdAt);
  const reminder = { id, medName, time, type, tone, filePath };
  scheduleReminder(reminder);
  res.json(reminder);
});

app.delete('/api/reminders/:id', (req, res) => {
  const id = req.params.id;
  const stmt = db.prepare('DELETE FROM reminders WHERE id = ?');
  const info = stmt.run(id);
  // cancel scheduled job
  const job = schedule.scheduledJobs[id];
  if (job) job.cancel();
  res.json({ deleted: info.changes });
});

app.post('/api/subscribe', (req, res) => {
  const sub = req.body;
  if (!sub || !sub.endpoint) return res.status(400).json({ error: 'Invalid subscription' });
  const id = uuidv4();
  const createdAt = new Date().toISOString();
  db.prepare('INSERT INTO subscriptions (id, endpoint, keys, createdAt) VALUES (?, ?, ?, ?)')
    .run(id, sub.endpoint, JSON.stringify(sub.keys || {}), createdAt);
  res.json({ id });
});

app.get('/api/vapidPublicKey', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
