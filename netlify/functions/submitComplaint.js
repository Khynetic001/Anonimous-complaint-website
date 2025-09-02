// netlify/functions/submitComplaint.js
// Node 18+ runtime recommended (Netlify default is fine)
// Dependencies: mongodb, validator, uuid

const { MongoClient } = require('mongodb');
const validator = require('validator');
const { v4: uuidv4 } = require('uuid');

// Environment variables (set in Netlify dashboard -> Site settings -> Build & deploy -> Environment)
const MONGODB_URI = process.env.MONGO_URI;      // uses your variable name
const MONGODB_DB = process.env.MONGODB_DB || 'univoice';
const MONGODB_COLLECTION = process.env.MONGODB_COLLECTION || 'complaints';
const FUNCTION_SECRET = process.env.FUNCTION_SECRET || ''; // optional shared secret header

if (!MONGODB_URI) {
  console.error('Missing MONGO_URI environment variable');
}

// Connection caching (important for serverless cold starts)
let cachedClient = null;
let cachedDb = null;

async function connectToDatabase() {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }
  const client = new MongoClient(MONGODB_URI, {
    // use unifiedTopology default -- Node driver v4
  });
  await client.connect();
  const db = client.db(MONGODB_DB);

  cachedClient = client;
  cachedDb = db;
  return { client, db };
}

function sanitizeString(input, maxLen = 2000) {
  if (typeof input !== 'string') return '';
  let s = validator.trim(input);
  // remove any NUL bytes etc
  s = s.replace(/\0/g, '');
  if (s.length > maxLen) s = s.slice(0, maxLen);
  return s;
}

function createComplaintId() {
  // Compact but unique: COMP-<timestamp>-<4char>
  const ts = Date.now().toString(36);
  const rnd = uuidv4().split('-')[0]; // 8 chars-ish
  return `COMP-${ts}-${rnd.toUpperCase()}`;
}

// Basic in-memory rate limiter per IP (serverless best-effort)
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 6; // max submissions per IP per window
const rateMap = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, first: now };
  if (now - entry.first > RATE_LIMIT_WINDOW_MS) {
    // reset
    entry.count = 1;
    entry.first = now;
    rateMap.set(ip, entry);
    return false;
  }
  entry.count += 1;
  rateMap.set(ip, entry);
  return entry.count > RATE_LIMIT_MAX;
}

// Basic CORS response builder
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'];

exports.handler = async function (event, context) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes('*') ? '*' : (ALLOWED_ORIGINS[0] || '*'),
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Function-Secret',
  };

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Optional: require a function-level secret
  if (FUNCTION_SECRET) {
    const provided = (event.headers['x-function-secret'] || event.headers['X-Function-Secret'] || '');
    if (provided !== FUNCTION_SECRET) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' }),
      };
    }
  }

  // Rate limit by IP
  const ip = (event.headers['x-nf-client-connection-ip'] || event.headers['x-forwarded-for'] || event.requestContext?.identity?.sourceIp || 'unknown');
  if (isRateLimited(ip)) {
    return {
      statusCode: 429,
      headers,
      body: JSON.stringify({ error: 'Too many submissions. Try again later.' }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid JSON' }),
    };
  }

  // Validate & sanitize inputs
  const department = sanitizeString(payload.department, 100);
  const program = sanitizeString(payload.program, 100);
  const title = sanitizeString(payload.title, 200);
  const details = sanitizeString(payload.details, 4000);

  // Optional reporter (keeps anonymity unless explicitly provided)
  let reporter = null;
  if (payload.reporter && typeof payload.reporter === 'object') {
    const rName = sanitizeString(payload.reporter.name, 100);
    const rEmail = sanitizeString(payload.reporter.email, 254);
    const rUsername = sanitizeString(payload.reporter.username, 100);
    if (rEmail && !validator.isEmail(rEmail)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid reporter email' }),
      };
    }
    reporter = {};
    if (rName) reporter.name = rName;
    if (rEmail) reporter.email = rEmail;
    if (rUsername) reporter.username = rUsername;
  }

  if (!department || !program || !title || !details) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing required fields' }),
    };
  }

  if (title.length < 5) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Complaint title too short' }),
    };
  }
  if (details.length < 10) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Complaint details too short' }),
    };
  }

  const complaintId = createComplaintId();
  const now = new Date();

  const complaintDoc = {
    complaintId,
    department,
    program,
    title,
    details,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    ...(reporter ? { reporter } : {}),
  };

  try {
    const { db } = await connectToDatabase();
    const coll = db.collection(MONGODB_COLLECTION);
    await coll.insertOne(complaintDoc);

    return {
      statusCode: 201,
      headers,
      body: JSON.stringify({
        success: true,
        complaintId,
        message: 'Complaint submitted successfully',
      }),
    };
  } catch (err) {
    console.error('DB Insert Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
