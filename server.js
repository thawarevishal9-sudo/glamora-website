require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const multer = require('multer');
let DatabaseSync;
try { ({ DatabaseSync } = require('node:sqlite')); } catch (error) {
  console.error('Glamora requires Node.js 22.5+ because it uses Node’s built-in SQLite support. Current Node version:', process.version);
  process.exit(1);
}

let Razorpay = null;
try { Razorpay = require('razorpay'); } catch (_) {}

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const SESSION_DAYS = 30;
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, 'uploads');
const dbPath = process.env.SQLITE_DB_PATH || path.join(__dirname, 'glamora.sqlite');

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer','artist')),
  instagram TEXT DEFAULT '',
  verified INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE,
  name TEXT NOT NULL,
  style TEXT NOT NULL,
  bio TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  image TEXT DEFAULT '',
  lat REAL,
  lng REAL,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  service TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,
  payment_id TEXT DEFAULT '',
  payment_order_id TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_booking_slot
ON bookings(artist_id,date,time)
WHERE status IN ('reserved','confirmed','pending_payment');

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  booking_id TEXT NOT NULL UNIQUE,
  customer_id TEXT NOT NULL,
  artist_id TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY(customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  artist_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS site_stats (
  key TEXT PRIMARY KEY,
  value INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS slot_overrides (
  id TEXT PRIMARY KEY, artist_id TEXT NOT NULL, date TEXT NOT NULL, time TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(artist_id,date,time), FOREIGN KEY(artist_id) REFERENCES artists(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
  read_at TEXT DEFAULT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT OR IGNORE INTO site_stats(key,value) VALUES ('visits',100);
UPDATE site_stats SET value=100 WHERE key='visits' AND value < 100;
`);
for (const [column, definition] of [['is_admin','INTEGER NOT NULL DEFAULT 0'],['is_active','INTEGER NOT NULL DEFAULT 1']]) {
  try { db.exec(`ALTER TABLE users ADD COLUMN ${column} ${definition}`); } catch (e) { if (!String(e.message).includes('duplicate column')) throw e; }
}


const seedArtists = [
  {
    id:'a1', name:'Priya Makeup Studio', style:'Bridal / Festive',
    bio:'Bridal and festive makeup services with a focus on personalised Indian beauty looks.',
    instagram:'makeupbypriya',
    image:'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=1100&q=85',
    portfolio:[
      'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85'
    ],
    lat:18.5204,lng:73.8567
  },
  {
    id:'a2', name:'Glow by Ananya', style:'Soft Glam',
    bio:'Soft-glam makeup services for parties, events and understated beauty looks.',
    instagram:'glowbyananya',
    image:'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=1100&q=85',
    portfolio:[
      'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=85'
    ],
    lat:18.5314,lng:73.8446
  },
  {
    id:'a3', name:'Makeup by Riya', style:'Party / Editorial',
    bio:'Party and editorial makeup services for events, portraits and creative work.',
    instagram:'makeupbyriya',
    image:'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1100&q=85',
    portfolio:[
      'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=85',
      'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=85'
    ],
    lat:18.5074,lng:73.8077
  }
];

function normaliseInstagram(value='') {
  return String(value).trim()
    .replace(/^@/,'')
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i,'')
    .replace(/\/.*$/,'');
}

function seedDemoArtists() {
  const count = db.prepare('SELECT COUNT(*) AS count FROM artists').get().count;
  if (count > 0) return;
  const stmt = db.prepare(`
    INSERT INTO artists(id,name,style,bio,instagram,image,lat,lng,verified)
    VALUES(@id,@name,@style,@bio,@instagram,@image,@lat,@lng,0)
  `);
  for (const a of seedArtists) stmt.run({
    ...a, instagram: normaliseInstagram(a.instagram)
  });
}
seedDemoArtists();
// Backfill handles for seeded demo profiles if an older local database has empty values.
for (const [id, handle] of [['a1','makeupbypriya'],['a2','glowbyananya'],['a3','makeupbyriya']]) {
  db.prepare("UPDATE artists SET instagram=? WHERE id=? AND (instagram IS NULL OR trim(instagram)='')").run(handle,id);
}


async function seedDemoAccounts() {
  const demoAccounts = [
    { id:'demo-customer', name:'Demo Customer', email:'customer@Glamora.demo', password:'demo123', role:'customer', instagram:'' },
    { id:'demo-artist-user', name:'Demo Makeup Artist', email:'artist@Glamora.demo', password:'demo123', role:'artist', instagram:'makeupbypriya' }
  ];
  const insertUser = db.prepare(`INSERT INTO users(id,name,email,password_hash,role,instagram,verified) VALUES(?,?,?,?,?,?,?)`);
  for (const account of demoAccounts) {
    if (findUserByEmail(account.email)) continue;
    const passwordHash = await bcrypt.hash(account.password, 12);
    insertUser.run(account.id, account.name, account.email, passwordHash, account.role, account.instagram, 0);
    if (account.role === 'artist') {
      const artist = db.prepare('SELECT id FROM artists WHERE id=?').get('a1');
      if (artist) {
        db.prepare('UPDATE artists SET user_id=? WHERE id=?').run(account.id, artist.id);
      }
    }
  }
}

async function provisionAdmin() {
  const email=String(process.env.ADMIN_EMAIL||'').trim().toLowerCase();
  const password=String(process.env.ADMIN_PASSWORD||'');
  if(!email || password.length<12) return;
  let user=findUserByEmail(email);
  if(!user) {
    const id=`admin-${crypto.randomUUID()}`;
    db.prepare('INSERT INTO users(id,name,email,password_hash,role,verified,is_admin,is_active) VALUES(?,?,?,?,\'customer\',1,1,1)')
      .run(id,process.env.ADMIN_NAME||'Glamora Administrator',email,await bcrypt.hash(password,12));
  } else {
    db.prepare('UPDATE users SET is_admin=1,is_active=1 WHERE id=?').run(user.id);
  }
}

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(express.static(__dirname));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g,'_');
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits:{fileSize:5*1024*1024},
  fileFilter:(_,file,cb)=>cb(null,/^image\//.test(file.mimetype))
});

const slotTimes = ['10:00 AM','12:00 PM','02:00 PM','04:00 PM','06:00 PM'];
const priceByService = {
  'Bridal Makeup':4500,
  'Soft Glam':2800,
  'Party Makeup':3200,
  'Editorial Makeup':3500
};

function publicUser(user) {
  return {id:user.id,name:user.name,email:user.email,role:user.role,instagram:user.instagram || '',verified:!!user.verified,isAdmin:!!user.is_admin};
}
function publicArtist(row) {
  const portfolio = db.prepare('SELECT url FROM media WHERE artist_id=? ORDER BY created_at DESC').all(row.id).map(x=>x.url);
  if (!portfolio.length && row.image) portfolio.push(row.image);
  return {
    id:row.id,userId:row.user_id || null,name:row.name,style:row.style,bio:row.bio || '',
    instagram:row.instagram || '',image:row.image || '',portfolio,
    lat:row.lat,lng:row.lng,verified:!!row.verified
  };
}
function findUserById(id) { return db.prepare('SELECT * FROM users WHERE id=?').get(id); }
function findUserByEmail(email) { return db.prepare('SELECT * FROM users WHERE lower(email)=lower(?)').get(email); }

function createSession(userId) {
  const raw = crypto.randomBytes(48).toString('hex');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const expires = new Date(Date.now() + SESSION_DAYS*24*60*60*1000).toISOString();
  db.prepare('INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,?)')
    .run(`s-${crypto.randomUUID()}`,userId,hash,expires);
  return {raw,expires};
}
function sessionFromRequest(req) {
  const cookie = req.headers.cookie || '';
  const cookieMatch = cookie.match(/(?:^|;\s*)glamora_session=([^;]+)/);
  const token = cookieMatch ? decodeURIComponent(cookieMatch[1]) :
    (req.headers.authorization || '').replace(/^Bearer\s+/,'') ||
    req.headers['x-session-token'];
  if (!token) return null;
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const row = db.prepare(`
    SELECT s.*,u.id AS user_id,u.name,u.email,u.role,u.instagram,u.verified,u.is_admin
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=? AND s.expires_at > datetime('now')
  `).get(hash);
  if (!row) return null;
  return {token, session:row, user:{
    id:row.user_id,name:row.name,email:row.email,role:row.role,
    instagram:row.instagram || '',verified:!!row.verified,isAdmin:!!row.is_admin
  }};
}
function setSessionCookie(res, raw, expires) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie',`glamora_session=${encodeURIComponent(raw)}; Path=/; HttpOnly; Max-Age=${SESSION_DAYS*24*60*60}; SameSite=Lax${secure}`);
}
function auth(req,res,next) {
  const session = sessionFromRequest(req);
  if (!session) return res.status(401).json({success:false,message:'Please login first.'});
  req.user = session.user;
  req.sessionToken = session.token;
  next();
}
function optionalAuth(req,_,next) {
  const session = sessionFromRequest(req);
  if (session) { req.user=session.user; req.sessionToken=session.token; }
  next();
}

function requireAdmin(req,res,next) {
  if (!req.user?.isAdmin) return res.status(403).json({success:false,message:'Administrator access required.'});
  next();
}
function notify(userId,title,message) {
  if (!userId) return;
  db.prepare('INSERT INTO notifications(id,user_id,title,message) VALUES(?,?,?,?)')
    .run(`N-${crypto.randomUUID()}`,userId,title,message);
}

app.get('/',(_,res)=>res.sendFile(path.join(__dirname,'glamindex.html')));
app.get('/privacy-policy',(_,res)=>res.sendFile(path.join(__dirname,'privacy-policy.html')));
app.get('/terms-and-conditions',(_,res)=>res.sendFile(path.join(__dirname,'terms-and-conditions.html')));

app.get('/api/health',(_,res)=>res.json({ok:true,database:'sqlite',node:process.version}));

app.get('/api/config',(_,res)=>res.json({
  googleMapsApiKey:process.env.GOOGLE_MAPS_API_KEY || '',
  googleMapsMapId:process.env.GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID',
  razorpayKeyId:process.env.RAZORPAY_KEY_ID || '',
  publicBaseUrl:process.env.PUBLIC_BASE_URL || ''
}));

app.get('/api/artists',(_,res)=>{
  const rows = db.prepare('SELECT * FROM artists ORDER BY created_at ASC').all();
  res.json(rows.map(publicArtist));
});
app.get('/api/artists/:id',(req,res)=>{
  const row=db.prepare('SELECT * FROM artists WHERE id=?').get(req.params.id);
  if(!row) return res.status(404).json({message:'Artist not found'});
  res.json(publicArtist(row));
});

app.post('/api/auth/signup',async(req,res)=>{
  const email=String(req.body.email || '').trim();
  const password=String(req.body.password || '');
  const role=req.body.role === 'artist' ? 'artist' : 'customer';
  const instagram=role==='artist' ? normaliseInstagram(req.body.instagram || '') : '';
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length<6)
    return res.status(400).json({success:false,message:'Enter a valid email and a password of at least 6 characters.'});
  if(findUserByEmail(email))
    return res.status(409).json({success:false,message:'An account with this email already exists.'});

  const id=`u-${crypto.randomUUID()}`;
  const name=role==='artist' ? 'New Makeup Artist' : 'New Glamora Customer';
  const passwordHash=await bcrypt.hash(password,12);
  db.prepare(`
    INSERT INTO users(id,name,email,password_hash,role,instagram,verified)
    VALUES(?,?,?,?,?,?,?)
  `).run(id,name,email,passwordHash,role,instagram,0);

  if(role==='artist'){
    db.prepare(`
      INSERT INTO artists(id,user_id,name,style,bio,instagram,image,lat,lng,verified)
      VALUES(?,?,?,?,?,?,?,?,?,0)
    `).run(`artist-${id}`,id,name,'Makeup Artist','',instagram,'',null,null);
  }

  const user=findUserById(id);
  const session=createSession(id);
  setSessionCookie(res,session.raw,session.expires);
  res.json({success:true,message:'Account created successfully.',user:publicUser(user)});
});

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body.email || '').trim();
  const password=String(req.body.password || '');
  const user=findUserByEmail(email);
  if(!user || !user.is_active || !(await bcrypt.compare(password,user.password_hash)))
    return res.status(401).json({success:false,message:'Email or password is incorrect.'});
  const session=createSession(user.id);
  setSessionCookie(res,session.raw,session.expires);
  res.json({success:true,message:'Login successful.',user:publicUser(user)});
});

app.post('/api/auth/logout',optionalAuth,(req,res)=>{
  if(req.sessionToken){
    const hash=crypto.createHash('sha256').update(req.sessionToken).digest('hex');
    db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash);
  }
  res.setHeader('Set-Cookie','glamora_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
  res.json({success:true,message:'You have been logged out.'});
});

app.get('/api/auth/me',optionalAuth,(req,res)=>{
  if(!req.user) return res.status(401).json({message:'Not logged in'});
  res.json({user:req.user});
});

app.get('/api/artists/:id/slots',(req,res)=>{
  const artist=db.prepare('SELECT id FROM artists WHERE id=?').get(req.params.id);
  if(!artist) return res.status(404).json({message:'Artist not found'});
  const date=String(req.query.date || '');
  const used=new Set(db.prepare(`SELECT time FROM bookings WHERE artist_id=? AND date=? AND status IN ('reserved','confirmed','pending_payment')`).all(artist.id,date).map(x=>x.time));
  const overrides=db.prepare('SELECT time,available FROM slot_overrides WHERE artist_id=? AND date=?').all(artist.id,date);
  const overrideMap=new Map(overrides.map(x=>[x.time,!!x.available]));
  res.json({date,slots:slotTimes.map(time=>({time,available:!used.has(time) && (overrideMap.has(time)?overrideMap.get(time):true)}))});
});

app.post('/api/bookings',auth,(req,res)=>{
  if(req.user.role!=='customer')
    return res.status(403).json({success:false,message:'Only customer accounts can create bookings.'});
  const artist=db.prepare('SELECT * FROM artists WHERE id=?').get(req.body.artistId);
  const service=String(req.body.service || '');
  const date=String(req.body.date || '');
  const time=String(req.body.time || '');
  if(!artist || !service || !date || !time)
    return res.status(400).json({success:false,message:'Please complete artist, service, date and slot.'});
  if(!slotTimes.includes(time))
    return res.status(400).json({success:false,message:'Invalid appointment slot.'});
  const amount=priceByService[service];
  if(!amount) return res.status(400).json({success:false,message:'Invalid service.'});

  const booking={
    id:`BK-${crypto.randomUUID()}`,customerId:req.user.id,artistId:artist.id,
    artist:artist.name,service,date,time,amount,status:'pending_payment'
  };
  try {
    db.prepare(`
      INSERT INTO bookings(id,customer_id,artist_id,artist_name,service,date,time,amount,status)
      VALUES(?,?,?,?,?,?,?,?,?)
    `).run(booking.id,booking.customerId,booking.artistId,booking.artist,booking.service,booking.date,booking.time,booking.amount,booking.status);
  } catch (e) {
    if(String(e.message).includes('idx_active_booking_slot'))
      return res.status(409).json({success:false,message:'That slot was just booked. Please choose another time.'});
    throw e;
  }
  const artistOwner=db.prepare('SELECT user_id FROM artists WHERE id=?').get(artist.id);
  notify(artistOwner?.user_id,'New booking request',`${booking.service} requested for ${booking.date} at ${booking.time}.`);
  notify(req.user.id,'Booking started',`Your ${booking.service} booking is awaiting payment.`);
  res.json({success:true,message:'Slot reserved while payment is completed.',booking});
});

app.get('/api/bookings/mine',auth,(req,res)=>{
  const rows=req.user.role==='customer'
    ? db.prepare('SELECT * FROM bookings WHERE customer_id=? ORDER BY created_at DESC').all(req.user.id)
    : db.prepare('SELECT * FROM bookings WHERE artist_id=(SELECT id FROM artists WHERE user_id=?) ORDER BY created_at DESC').all(req.user.id);
  res.json({bookings:rows.map(b=>({
    id:b.id,artistId:b.artist_id,artist:b.artist_name,service:b.service,date:b.date,time:b.time,
    amount:b.amount,status:b.status,paymentId:b.payment_id
  }))});
});

app.post('/api/payments/create-order',auth,async(req,res)=>{
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND customer_id=?').get(req.body.bookingId,req.user.id);
  if(!booking) return res.status(404).json({success:false,message:'Booking not found.'});
  if(booking.status!=='pending_payment') return res.status(400).json({success:false,message:'This booking is no longer awaiting payment.'});

  if(Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET){
    try {
      const razorpay=new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});
      const order=await razorpay.orders.create({
        amount:booking.amount*100,currency:'INR',receipt:booking.id,
        notes:{bookingId:booking.id}
      });
      db.prepare('UPDATE bookings SET payment_order_id=? WHERE id=?').run(order.id,booking.id);
      return res.json({success:true,gateway:'razorpay',key:process.env.RAZORPAY_KEY_ID,order});
    } catch(e) {
      return res.status(502).json({success:false,message:'Payment gateway could not create the order.'});
    }
  }
  res.json({success:true,gateway:'demo',message:'Demo payment mode is active. No real money will be charged.'});
});

app.post('/api/payments/verify',auth,(req,res)=>{
  const {bookingId,razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body;
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND customer_id=?').get(bookingId,req.user.id);
  if(!booking) return res.status(404).json({success:false,message:'Booking not found.'});
  if(!process.env.RAZORPAY_KEY_SECRET)
    return res.status(400).json({success:false,message:'Live payment verification is not configured.'});
  const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
  if(expected!==razorpay_signature)
    return res.status(400).json({success:false,message:'Payment signature could not be verified.'});
  db.prepare('UPDATE bookings SET status=?,payment_id=?,payment_order_id=? WHERE id=?')
    .run('confirmed',razorpay_payment_id,razorpay_order_id,booking.id);
  const artistOwner=db.prepare('SELECT user_id FROM artists WHERE id=?').get(booking.artist_id);
  notify(req.user.id,'Booking confirmed',`Your booking ${booking.id} is confirmed.`); notify(artistOwner?.user_id,'Booking paid and confirmed',`Booking ${booking.id} is confirmed.`);
  res.json({success:true,message:'Payment verified. Your booking is confirmed.'});
});

app.post('/api/payments/demo',auth,(req,res)=>{
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND customer_id=?').get(req.body.bookingId,req.user.id);
  if(!booking) return res.status(404).json({success:false,message:'Booking not found.'});
  if(booking.status!=='pending_payment') return res.status(400).json({success:false,message:'Booking is not awaiting payment.'});
  db.prepare('UPDATE bookings SET status=?,payment_id=? WHERE id=?').run('confirmed','DEMO-'+crypto.randomUUID(),booking.id);
  const artistOwner=db.prepare('SELECT user_id FROM artists WHERE id=?').get(booking.artist_id);
  notify(req.user.id,'Booking confirmed',`Your booking ${booking.id} is confirmed in demo payment mode.`); notify(artistOwner?.user_id,'Booking confirmed',`Booking ${booking.id} is confirmed in demo mode.`);
  res.json({success:true,message:'Demo payment recorded. Booking confirmed for this project demo.'});
});

app.post('/api/payments/cancel',auth,(req,res)=>{
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND customer_id=?').get(req.body.bookingId,req.user.id);
  if(!booking) return res.status(404).json({success:false,message:'Booking not found.'});
  if(booking.status==='pending_payment')
    db.prepare('UPDATE bookings SET status=? WHERE id=?').run('cancelled',booking.id);
  res.json({success:true,message:'Payment hold cancelled and slot released.'});
});

app.post('/api/reviews',auth,(req,res)=>{
  if(req.user.role!=='customer') return res.status(403).json({success:false,message:'Only customers can publish reviews.'});
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND customer_id=?').get(req.body.bookingId,req.user.id);
  if(!booking || !['confirmed','completed'].includes(booking.status))
    return res.status(400).json({success:false,message:'A confirmed booking is required before leaving a review.'});
  const rating=Number(req.body.rating);
  const comment=String(req.body.comment || '').trim();
  if(!Number.isInteger(rating)||rating<1||rating>5||!comment)
    return res.status(400).json({success:false,message:'Please provide a rating and review.'});
  if(db.prepare('SELECT id FROM reviews WHERE booking_id=?').get(booking.id))
    return res.status(409).json({success:false,message:'This booking already has a review.'});
  db.prepare(`
    INSERT INTO reviews(id,booking_id,customer_id,artist_id,rating,comment)
    VALUES(?,?,?,?,?,?)
  `).run(`RV-${crypto.randomUUID()}`,booking.id,req.user.id,booking.artist_id,rating,comment);
  res.json({success:true,message:'Thank you. Your review has been published.'});
});

app.get('/api/artists/:id/reviews',(req,res)=>{
  const rows=db.prepare(`
    SELECT r.rating,r.comment,r.created_at,u.name
    FROM reviews r JOIN users u ON u.id=r.customer_id
    WHERE r.artist_id=? ORDER BY r.created_at DESC
  `).all(req.params.id);
  res.json({reviews:rows});
});

app.post('/api/artist/media',auth,upload.single('media'),(req,res)=>{
  if(req.user.role!=='artist') return res.status(403).json({success:false,message:'Artist account required.'});
  if(!req.file) return res.status(400).json({success:false,message:'Please upload an image.'});
  const artist=db.prepare('SELECT * FROM artists WHERE user_id=?').get(req.user.id);
  if(!artist) return res.status(404).json({success:false,message:'Artist profile not found.'});
  const url=`/uploads/${req.file.filename}`;
  db.prepare('INSERT INTO media(id,artist_id,filename,url) VALUES(?,?,?,?)')
    .run(`M-${crypto.randomUUID()}`,artist.id,req.file.filename,url);
  res.json({success:true,message:'Portfolio image uploaded.',url});
});

app.post('/api/artist/profile',auth,(req,res)=>{
  if(req.user.role!=='artist') return res.status(403).json({success:false,message:'Artist account required.'});
  const artist=db.prepare('SELECT * FROM artists WHERE user_id=?').get(req.user.id);
  if(!artist) return res.status(404).json({success:false,message:'Artist profile not found.'});
  const name=String(req.body.name || artist.name).trim();
  const style=String(req.body.style || artist.style).trim();
  const bio=String(req.body.bio || '').trim();
  const instagram=normaliseInstagram(req.body.instagram || '');
  db.prepare('UPDATE artists SET name=?,style=?,bio=?,instagram=? WHERE id=?').run(name,style,bio,instagram,artist.id);
  db.prepare('UPDATE users SET name=?,instagram=? WHERE id=?').run(name,instagram,req.user.id);
  res.json({success:true,message:'Artist profile updated.'});
});

// Artist availability management: artists can override standard slots for their own profile.
app.get('/api/artist/availability',auth,(req,res)=>{
  if(req.user.role!=='artist') return res.status(403).json({success:false,message:'Artist account required.'});
  const artist=db.prepare('SELECT id FROM artists WHERE user_id=?').get(req.user.id);
  if(!artist) return res.status(404).json({success:false,message:'Artist profile not found.'});
  const rows=db.prepare('SELECT date,time,available FROM slot_overrides WHERE artist_id=? AND date>=date(\'now\') ORDER BY date,time').all(artist.id);
  res.json({availability:rows});
});
app.post('/api/artist/availability',auth,(req,res)=>{
  if(req.user.role!=='artist') return res.status(403).json({success:false,message:'Artist account required.'});
  const artist=db.prepare('SELECT id FROM artists WHERE user_id=?').get(req.user.id);
  const date=String(req.body.date||''), time=String(req.body.time||''), available=req.body.available===false || req.body.available===0 ? 0 : 1;
  if(!artist || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !slotTimes.includes(time)) return res.status(400).json({success:false,message:'Choose a valid date and standard time slot.'});
  const existing=db.prepare("SELECT id FROM bookings WHERE artist_id=? AND date=? AND time=? AND status IN ('reserved','confirmed','pending_payment')").get(artist.id,date,time);
  if(!available && existing) return res.status(409).json({success:false,message:'This slot has an active booking and cannot be blocked.'});
  db.prepare(`INSERT INTO slot_overrides(id,artist_id,date,time,available) VALUES(?,?,?,?,?) ON CONFLICT(artist_id,date,time) DO UPDATE SET available=excluded.available,updated_at=CURRENT_TIMESTAMP`).run(`S-${crypto.randomUUID()}`,artist.id,date,time,available);
  res.json({success:true,message:available?'Slot made available.':'Slot blocked for this date.'});
});
app.post('/api/artist/bookings/:id/status',auth,(req,res)=>{
  if(req.user.role!=='artist') return res.status(403).json({success:false,message:'Artist account required.'});
  const artist=db.prepare('SELECT id FROM artists WHERE user_id=?').get(req.user.id);
  const booking=db.prepare('SELECT * FROM bookings WHERE id=? AND artist_id=?').get(req.params.id,artist?.id);
  const action=String(req.body.action||'');
  if(!booking) return res.status(404).json({success:false,message:'Booking not found for your artist profile.'});
  if(!['accept','reject','complete'].includes(action)) return res.status(400).json({success:false,message:'Action must be accept, reject or complete.'});
  if(action==='accept') {
    if(!['confirmed','reserved'].includes(booking.status)) return res.status(400).json({success:false,message:'Only paid/ reserved bookings can be accepted.'});
    db.prepare('UPDATE bookings SET status=? WHERE id=?').run('confirmed',booking.id);
    notify(booking.customer_id,'Artist accepted your booking',`${booking.artist_name} accepted booking ${booking.id}.`);
  } else if(action==='reject') {
    if(['cancelled','rejected','completed'].includes(booking.status)) return res.status(400).json({success:false,message:'This booking can no longer be rejected.'});
    db.prepare('UPDATE bookings SET status=? WHERE id=?').run('rejected',booking.id);
    notify(booking.customer_id,'Booking request declined',`${booking.artist_name} declined booking ${booking.id}. If you paid, contact support for refund handling.`);
  } else {
    if(booking.status!=='confirmed') return res.status(400).json({success:false,message:'Only confirmed bookings can be marked completed.'});
    db.prepare('UPDATE bookings SET status=? WHERE id=?').run('completed',booking.id);
    notify(booking.customer_id,'Appointment completed',`Booking ${booking.id} was marked completed. You can now leave a review.`);
  }
  res.json({success:true,message:`Booking ${action} action saved.`});
});
app.get('/api/notifications',auth,(req,res)=>{
  const rows=db.prepare('SELECT id,title,message,read_at,created_at FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(req.user.id);
  res.json({notifications:rows});
});
app.post('/api/notifications/:id/read',auth,(req,res)=>{
  const result=db.prepare("UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE id=? AND user_id=?").run(req.params.id,req.user.id);
  res.json({success:result.changes>0});
});
// Admin endpoints. The admin account is provisioned from environment variables at startup.
app.get('/api/admin/summary',auth,requireAdmin,(req,res)=>{
  res.json({users:db.prepare('SELECT COUNT(*) n FROM users').get().n,artists:db.prepare('SELECT COUNT(*) n FROM artists').get().n,bookings:db.prepare('SELECT COUNT(*) n FROM bookings').get().n,confirmed:db.prepare("SELECT COUNT(*) n FROM bookings WHERE status='confirmed'").get().n,revenue:db.prepare("SELECT COALESCE(SUM(amount),0) n FROM bookings WHERE status IN ('confirmed','completed')").get().n,pendingArtists:db.prepare('SELECT COUNT(*) n FROM artists WHERE verified=0').get().n});
});
app.get('/api/admin/users',auth,requireAdmin,(req,res)=>res.json({users:db.prepare('SELECT id,name,email,role,verified,is_active,created_at FROM users ORDER BY created_at DESC').all()}));
app.post('/api/admin/users/:id/status',auth,requireAdmin,(req,res)=>{
  if(req.params.id===req.user.id) return res.status(400).json({success:false,message:'You cannot deactivate your own admin account.'});
  const active=req.body.active?1:0; db.prepare('UPDATE users SET is_active=? WHERE id=? AND is_admin=0').run(active,req.params.id);
  if(!active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(req.params.id);
  res.json({success:true,message:active?'User activated.':'User deactivated and sessions revoked.'});
});
app.get('/api/admin/artists',auth,requireAdmin,(req,res)=>res.json({artists:db.prepare('SELECT a.id,a.name,a.style,a.verified,a.user_id,u.email FROM artists a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC').all()}));
app.post('/api/admin/artists/:id/verify',auth,requireAdmin,(req,res)=>{
  const verified=req.body.verified?1:0; const artist=db.prepare('SELECT * FROM artists WHERE id=?').get(req.params.id);
  if(!artist) return res.status(404).json({success:false,message:'Artist not found.'});
  db.prepare('UPDATE artists SET verified=? WHERE id=?').run(verified,artist.id);
  if(artist.user_id) { db.prepare('UPDATE users SET verified=? WHERE id=?').run(verified,artist.user_id); notify(artist.user_id,verified?'Artist profile verified':'Verification status updated',verified?'Your artist profile has been verified by the platform.':'Your artist profile is currently not verified.'); }
  res.json({success:true,message:verified?'Artist verified.':'Artist verification removed.'});
});
app.get('/api/admin/bookings',auth,requireAdmin,(req,res)=>res.json({bookings:db.prepare('SELECT id,customer_id,artist_id,artist_name,service,date,time,amount,status,created_at FROM bookings ORDER BY created_at DESC LIMIT 500').all()}));
app.get('/api/admin/reports',auth,requireAdmin,(req,res)=>{
  const byStatus=db.prepare('SELECT status,COUNT(*) count,COALESCE(SUM(amount),0) amount FROM bookings GROUP BY status').all();
  const monthly=db.prepare("SELECT substr(created_at,1,7) month,COUNT(*) bookings,COALESCE(SUM(CASE WHEN status IN ('confirmed','completed') THEN amount ELSE 0 END),0) paid_amount FROM bookings GROUP BY substr(created_at,1,7) ORDER BY month DESC LIMIT 12").all();
  res.json({byStatus,monthly,contacts:db.prepare('SELECT COUNT(*) n FROM contact_messages').get().n,reviews:db.prepare('SELECT COUNT(*) n FROM reviews').get().n});
});

app.post('/api/contact',(req,res)=>{
  const name=String(req.body.name || '').trim();
  const email=String(req.body.email || '').trim();
  const message=String(req.body.message || '').trim();
  if(!name||!email||!message) return res.status(400).json({success:false,message:'Please complete all contact fields.'});
  db.prepare('INSERT INTO contact_messages(id,name,email,message) VALUES(?,?,?,?)')
    .run(`MSG-${crypto.randomUUID()}`,name,email,message);
  res.json({success:true,message:'Your message has been received.'});
});

app.post('/api/counter',(req,res)=>{
  try {
    db.prepare("INSERT OR IGNORE INTO site_stats(key,value) VALUES('visits',100)").run();
    db.prepare("UPDATE site_stats SET value=CASE WHEN value < 100 THEN 101 ELSE value+1 END WHERE key='visits'").run();
    const row=db.prepare("SELECT value FROM site_stats WHERE key='visits'").get();
    return res.json({visits:Math.max(100,Number(row?.value)||100)});
  } catch (error) {
    console.error('Visitor counter update failed:',error.message);
    return res.status(500).json({visits:100,message:'Counter is temporarily unavailable.'});
  }
});
app.get('/api/counter',(_,res)=>{
  try {
    db.prepare("INSERT OR IGNORE INTO site_stats(key,value) VALUES('visits',100)").run();
    const row=db.prepare("SELECT value FROM site_stats WHERE key='visits'").get();
    return res.json({visits:Math.max(100,Number(row?.value)||100)});
  } catch (error) {
    console.error('Visitor counter read failed:',error.message);
    return res.status(500).json({visits:100,message:'Counter is temporarily unavailable.'});
  }
});

seedDemoAccounts()
  .then(provisionAdmin)
  .then(()=>app.listen(PORT,'0.0.0.0',()=>console.log(`Glamora running on http://0.0.0.0:${PORT}`)))
  .catch(error=>{ console.error('Glamora startup failed:', error); process.exit(1); });
