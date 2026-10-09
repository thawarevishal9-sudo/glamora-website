let artists = {};
let selectedArtist = null;
let currentUser = null;
let authMode = 'login';
let pendingBooking = null;
let map = null;
let mapMarkers = [];
let userLocation = null;
let googleMapsMapId = 'DEMO_MAP_ID';

const fallbackArtists = {
  a1:{id:'a1',name:'Priya Makeup Studio',style:'Bridal / Festive',instagram:'makeupbypriya',lat:18.5204,lng:73.8567,bio:'Bridal and festive makeup services with a focus on personalised Indian beauty looks.',image:'https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=1100&q=85',portfolio:['https://images.unsplash.com/photo-1616683693504-3ea7e9ad6fec?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=900&q=85']},
  a2:{id:'a2',name:'Glow by Ananya',style:'Soft Glam',instagram:'glowbyananya',lat:18.5314,lng:73.8446,bio:'Soft-glam makeup services for parties, events and understated beauty looks.',image:'https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=1100&q=85',portfolio:['https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?auto=format&fit=crop&w=900&q=85']},
  a3:{id:'a3',name:'Makeup by Riya',style:'Party / Editorial',instagram:'makeupbyriya',lat:18.5074,lng:73.8077,bio:'Party and editorial makeup services for events, portraits and creative work.',image:'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1100&q=85',portfolio:['https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=85']}
};

function $(id){return document.getElementById(id)}

async function loadArtists(){
  try{const r=await fetch('/api/artists'); if(r.ok){const data=await r.json(); data.forEach(a=>{const fallback=fallbackArtists[a.id]||{}; artists[a.id]={...fallback,...a,instagram:normalizeInstagramHandle(a.instagram)||fallback.instagram||''};});}}catch(e){console.warn('Artist API unavailable; using demo profiles.',e)}
  artists={...fallbackArtists,...artists};
}

function openArtist(id){
  const a=artists[id]; if(!a)return;
  selectedArtist=id;
  $('modalArtist').textContent=a.name;
  $('modalStyle').textContent=a.style;
  $('modalStyleStat').textContent=a.style || 'Makeup artist';
  $('modalDistance').textContent=a.distance != null ? `${a.distance} km` : 'Use location';
  $('modalVerification').textContent=a.verified ? 'Verified' : 'Not verified';
  $('modalArtistImage').src=a.image;
  $('modalBio').textContent=a.bio; if($('modalInstagram')) $('modalInstagram').innerHTML=artistInstagramHTML(a);
  $('modalPortfolio').innerHTML=(a.portfolio||[]).map(src=>`<img src="${src}" alt="Portfolio work">`).join('');
  $('artistModal').classList.add('show');
}
function closeArtist(){$('artistModal').classList.remove('show')}
function startBooking(id){$('artistSelect').value=id; $('booking').scrollIntoView(); loadSlots()}
function bookFromModal(){closeArtist();startBooking(selectedArtist)}

function setAuthMode(mode){
  authMode=mode;
  $('authTitle').textContent=mode==='login'?'Welcome back.':'Create your Glamora account.';
  $('authSubmit').textContent=mode==='login'?'Login ':'Create account ';
  $('loginTab').classList.toggle('active',mode==='login'); $('signupTab').classList.toggle('active',mode==='signup');
  $('roleField').style.display=mode==='signup'?'block':'none'; if($('artistInstagramField'))$('artistInstagramField').style.display=(mode==='signup'&&$('authRole').value==='artist')?'block':'none'; $('authResult').textContent='';
}
function openAuth(mode='login'){setAuthMode(mode);$('authModal').classList.add('show')}
function closeAuth(){$('authModal').classList.remove('show')}

async function refreshUser(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'same-origin'});
    if(r.ok){currentUser=(await r.json()).user}
  }catch(e){}
  updateUserUI();
}
function updateUserUI(){
  $('bookingUserState').textContent=currentUser?`${currentUser.name} / ${currentUser.role}`:'Login required to confirm';
  $('reviewState').textContent=currentUser&&currentUser.role==='customer'?'Select a confirmed booking below':'Login as a customer to review';
  if(currentUser&&currentUser.role==='customer') loadReviewBookings();
  loadMyBookings();
  const login=document.querySelector('.nav-login');
  if(currentUser){
  login.textContent='Account';
  login.onclick=()=>currentUser.role==='artist' ? $('studioModal').classList.add('show') : openAccountPanel();
}else{
  login.textContent='Login';
  login.onclick=()=>openAuth('login');
}
}

function openAccountPanel(){
  const name=currentUser?.name || 'Account';
  const email=currentUser?.email || '';
  if(confirm(`${name}\n${email}\n\nChoose OK to log out.`)) logout();
}
async function logout(){
  try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});}catch(e){}
  currentUser=null;
  updateUserUI();
}
if($('authRole'))$('authRole').addEventListener('change',()=>{if($('artistInstagramField'))$('artistInstagramField').style.display=$('authRole').value==='artist'?'block':'none'});

$('authForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const payload={email:$('authEmail').value.trim(),password:$('authPassword').value};
  if(authMode==='signup'){payload.role=$('authRole').value;if(payload.role==='artist'&&$('artistInstagram'))payload.instagram=$('artistInstagram').value.trim();}
  try{
    const r=await fetch(`/api/auth/${authMode}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await r.json(); $('authResult').textContent=data.message;
    if(data.success){currentUser=data.user;closeAuth();updateUserUI();if(currentUser.role==='artist')$('studioModal').classList.add('show');}
  }catch(e){$('authResult').textContent='Glamora server is not running. Start it with npm install, then npm start, and open http://localhost:3000.'}
});

async function loadSlots(){
  const artistId=$('artistSelect').value,date=$('bookingDate').value;
  $('timeSelect').innerHTML='<option value="">Loading slots...</option>';
  if(!artistId||!date){$('timeSelect').innerHTML='<option value="">Choose artist and date</option>';return}
  try{const r=await fetch(`/api/artists/${artistId}/slots?date=${encodeURIComponent(date)}`);const data=await r.json();$('timeSelect').innerHTML=data.slots.length?'<option value="">Choose slot</option>'+data.slots.map(s=>`<option value="${s.time}">${s.time}  -  ${s.available?'Available':'Booked'}</option>`).join(''):'<option value="">No slots available</option>';Array.from($('timeSelect').options).forEach(o=>{if(o.textContent.includes('Booked'))o.disabled=true})}catch(e){$('timeSelect').innerHTML='<option value="">Unable to load slots</option>'}
}
$('artistSelect').addEventListener('change',loadSlots);$('bookingDate').addEventListener('change',loadSlots);
$('bookingDate').min=new Date().toISOString().split('T')[0];

$('bookingForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(!currentUser){openAuth('login');$('bookingResult').textContent='Please login as a customer before confirming a booking.';return}
  if(currentUser.role!=='customer'){ $('bookingResult').textContent='Artist accounts manage profiles; login as a customer to book.';return}
  const payload={artistId:$('artistSelect').value,service:$('serviceSelect').value,date:$('bookingDate').value,time:$('timeSelect').value};
  $('bookingResult').textContent='Checking availability...';
  try{const r=await fetch('/api/bookings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await r.json();if(!r.ok)throw new Error(data.message);pendingBooking=data.booking;$('bookingResult').textContent='Slot reserved. Continue to payment.';openPayment(data.booking)}catch(err){$('bookingResult').textContent=err.message||'Booking could not be created.'}
});

function openPayment(booking){
  const a=artists[booking.artistId]||fallbackArtists[booking.artistId];
  $('paymentArtist').textContent=a?.name||'Glamora Artist';
  $('paymentAmount').textContent=`₹${booking.amount}`;
  $('paymentDetails').textContent=`${booking.service} · ${booking.date} · ${booking.time}`;
  $('paymentResult').textContent='';
  $('payButton').disabled=false;
  $('paymentModal').classList.add('show');
}
let paymentScriptPromise=null;
function ensureRazorpayLoaded(){
  if(window.Razorpay)return Promise.resolve(true);
  if(paymentScriptPromise)return paymentScriptPromise;
  paymentScriptPromise=new Promise(resolve=>{
    const script=document.createElement('script');
    script.src='https://checkout.razorpay.com/v1/checkout.js';
    script.async=true;
    script.onload=()=>resolve(true);
    script.onerror=()=>resolve(false);
    document.head.appendChild(script);
  });
  return paymentScriptPromise;
}
async function closePayment(cancel=false){
  if(cancel && pendingBooking && pendingBooking.status==='pending_payment'){
    try{await fetch('/api/payments/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:pendingBooking.id})})}catch(e){}
  }
  $('paymentModal').classList.remove('show');
  if(cancel)pendingBooking=null;
}
async function payNow(){
  if(!pendingBooking||!currentUser)return;
  $('payButton').disabled=true;$('paymentResult').textContent='Preparing secure Razorpay checkout...';
  try{
    const r=await fetch('/api/payments/create-order',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:pendingBooking.id})});
    const data=await r.json();
    if(!r.ok)throw new Error(data.message||'Payment order could not be created.');
    if(data.gateway==='razorpay'){
      const loaded=await ensureRazorpayLoaded();
      if(!loaded)throw new Error('Razorpay Checkout could not load. Check your internet connection.');
      const options={key:data.key,amount:data.order.amount,currency:data.order.currency,name:'Glamora',description:`${pendingBooking.service} with ${$('paymentArtist').textContent}`,order_id:data.order.id,handler:async response=>{await verifyPayment(response)},prefill:{name:currentUser.name,email:currentUser.email},theme:{color:'#9a6b4b'}};
      $('paymentResult').textContent='Opening secure Razorpay checkout...';
      new Razorpay(options).open();
    }else{
      await demoPayment();
    }
  }catch(e){$('paymentResult').textContent=e.message||'Payment service unavailable.';$payButtonSafe();}
  finally{$('payButton').disabled=false}
}
function $payButtonSafe(){$('payButton').disabled=false}
async function demoPayment(){
  const r=await fetch('/api/payments/demo',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId:pendingBooking.id})});
  const data=await r.json();$('paymentResult').textContent=data.message;
  if(data.success){pendingBooking.status='confirmed';$('paymentResult').classList.add('success');setTimeout(()=>{closePayment(false);pendingBooking=null;$('bookingForm').reset();$('timeSelect').innerHTML='<option value="">Choose artist and date</option>';loadReviewBookings()},1100)}
}
async function verifyPayment(response){
  try{
    const r=await fetch('/api/payments/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...response,bookingId:pendingBooking.id})});
    const data=await r.json();$('paymentResult').textContent=data.message;
    if(data.success){$('paymentResult').classList.add('success');setTimeout(()=>{closePayment(false);pendingBooking=null;$('bookingForm').reset();$('timeSelect').innerHTML='<option value="">Choose artist and date</option>';loadReviewBookings()},1100)}
  }catch(e){$('paymentResult').textContent='Payment verification failed. Please contact Glamora support.'}
}

function useMyLocation(){
  if(!navigator.geolocation){$('locationHint').textContent='Geolocation is not supported by this browser.';return}
  $('locationHint').textContent='Requesting your location...';
  navigator.geolocation.getCurrentPosition(pos=>{userLocation={lat:pos.coords.latitude,lng:pos.coords.longitude};updateDistances();$('locationStatus').textContent='Artists sorted by your location';$('locationHint').textContent='Distance is calculated from your current browser location.';},()=>{$('locationHint').textContent='Location permission was not granted. Distances are unavailable.'});
}
function haversine(lat1,lon1,lat2,lon2){const R=6371,dLat=(lat2-lat1)*Math.PI/180,dLon=(lon2-lon1)*Math.PI/180;const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))}
function updateDistances(){if(!userLocation)return;Object.values(artists).forEach(a=>{if(a.lat==null||a.lng==null)return;a.distance=+haversine(userLocation.lat,userLocation.lng,a.lat,a.lng).toFixed(1);document.querySelectorAll(`[data-distance="${a.id}"]`).forEach(el=>el.textContent=a.distance+' km')});renderMapMarkers();if(map)map.panTo(userLocation);if(map)map.setZoom(13)}

async function initMap(){
  if(!window.google?.maps){$('mapMode').textContent='API KEY REQUIRED';return}
  try{
    const [{Map},{AdvancedMarkerElement}]=await Promise.all([
      google.maps.importLibrary('maps'),
      google.maps.importLibrary('marker')
    ]);
    map=new Map($('googleMap'),{center:userLocation||{lat:18.5204,lng:73.8567},zoom:userLocation?13:12,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,mapId:googleMapsMapId});
    window.GlamoraAdvancedMarker=AdvancedMarkerElement;
    renderMapMarkers();
    $('mapFallback').style.display='none';
    $('mapMode').textContent='LIVE GOOGLE MAPS';
  }catch(e){$('mapMode').textContent='MAP LOAD ERROR';console.error('Glamora map error',e)}
}
function renderMapMarkers(){
  if(!map||!window.GlamoraAdvancedMarker)return;
  mapMarkers.forEach(marker=>marker.map=null);mapMarkers=[];
  Object.values(artists).filter(a=>a.lat!=null&&a.lng!=null).forEach(a=>{
    const marker=new window.GlamoraAdvancedMarker({map,position:{lat:a.lat,lng:a.lng},title:a.name,gmpClickable:true});
    marker.addEventListener('gmp-click',()=>openArtist(a.id));
    mapMarkers.push(marker);
  });
}

function loadGoogleMaps(){
  fetch('/api/config').then(r=>r.json()).then(c=>{
    const live=!!c.razorpayKeyId;
    $('gatewayTitle').textContent=live?'Razorpay Secure Checkout':'Razorpay Checkout  -  Demo Mode';
    $('gatewayStatus').textContent=live?'UPI · Cards · Netbanking · Wallets':'Demo payment · Add Razorpay keys for live checkout';
    $('gatewayNote').textContent=live?'Your payment is processed through Razorpay and verified by the Glamora server.':'Demo mode is active. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env to enable the live Razorpay gateway.';
    $('gatewayStatus').classList.toggle('gateway-live',live);$('gatewayStatus').classList.toggle('gateway-demo',!live);
    googleMapsMapId=c.googleMapsMapId||'DEMO_MAP_ID';
    if(c.googleMapsApiKey){
      const s=document.createElement('script');
      s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(c.googleMapsApiKey)}&v=weekly&loading=async&callback=initMap`;
      s.async=true;s.defer=true;window.initMap=initMap;document.head.appendChild(s);
    }else{initMap()}
  }).catch(()=>initMap())
}



async function loadMyBookings(){
  const target=$('myBookingsList'); if(!target)return;
  if(!currentUser){target.innerHTML='<p class="booking-empty">Log in to view your bookings and appointment updates.</p>';return;}
  target.innerHTML='<p class="booking-empty">Loading your bookings…</p>';
  try{
    const r=await fetch('/api/bookings/mine',{credentials:'same-origin'}); const data=await r.json();
    if(!r.ok)throw new Error(data.message||'Could not load bookings');
    if(!data.bookings||!data.bookings.length){target.innerHTML='<p class="booking-empty">No bookings yet. Choose an artist and book your first appointment.</p>';return;}
    target.innerHTML=data.bookings.map(b=>`<article class="booking-history-card"><div><small>${currentUser.role==='artist'?'INCOMING APPOINTMENT':'BOOKING'} · ${b.id}</small><h3>${escapeHTML(b.artist||'Artist')}</h3><p>${escapeHTML(b.service)} · ${escapeHTML(b.date)} · ${escapeHTML(b.time)}</p></div><div class="booking-history-status"><strong>₹${Number(b.amount).toLocaleString('en-IN')}</strong><span class="status-pill status-${String(b.status).replace(/[^a-z_]/g,'')}">${escapeHTML(b.status.replaceAll('_',' '))}</span></div></article>`).join('');
  }catch(e){target.innerHTML='<p class="booking-empty">Could not load bookings. Please sign in again and retry.</p>';}
}
function escapeHTML(value){return String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));}

async function loadReviewBookings(){
  try{const r=await fetch('/api/bookings/mine');if(!r.ok)return;const data=await r.json();const confirmed=data.bookings.filter(b=>b.status==='confirmed');$('reviewBooking').innerHTML=confirmed.length?'<option value="">Choose booking</option>'+confirmed.map(b=>`<option value="${b.id}">${b.artist} · ${b.service} · ${b.date}</option>`).join(''):'<option value="">No confirmed bookings yet</option>'}catch(e){}
}
async function submitReview(){
  if(!currentUser){openAuth('login');return}
  const bookingId=$('reviewBooking').value;if(!bookingId){$('reviewResult').textContent='Choose a confirmed booking first.';return}
  try{const r=await fetch('/api/reviews',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bookingId,rating:$('reviewRating').value,comment:$('reviewComment').value.trim()})});const data=await r.json();$('reviewResult').textContent=data.message;if(data.success){$('reviewComment').value='';loadReviewBookings()}}catch(e){$('reviewResult').textContent='Review service unavailable.'}
}

$('mediaForm').addEventListener('submit',async e=>{e.preventDefault();if(!currentUser||currentUser.role!=='artist'){return}const file=$('mediaFile').files[0];const fd=new FormData();fd.append('media',file);$('mediaResult').textContent='Uploading...';try{const r=await fetch('/api/artist/media',{method:'POST',body:fd});const data=await r.json();$('mediaResult').textContent=data.message}catch(e){$('mediaResult').textContent='Upload failed.'}});
function closeStudio(){$('studioModal').classList.remove('show')}

$('contactForm').addEventListener('submit',async e=>{e.preventDefault();try{const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('name').value.trim(),email:$('email').value.trim(),message:$('message').value.trim()})});const data=await r.json();alert(data.message);if(data.success)e.target.reset()}catch(e){alert('Something went wrong. Please try again.')}});

document.querySelectorAll('.filter').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.filter').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const selected=btn.dataset.filter;document.querySelectorAll('.artist-card').forEach(card=>{card.style.display=selected==='all'||card.dataset.style===selected?'':'none'})}));

document.querySelectorAll('.modal').forEach(m=>m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('show')}));




function normalizeInstagramHandle(value){
  if(!value) return '';
  const handle=String(value).trim().replace(/^@/,'').replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').split(/[/?#]/)[0].trim();
  return /^[a-zA-Z0-9._]{1,30}$/.test(handle) ? handle : '';
}
function artistInstagramHTML(a){
  const handle=normalizeInstagramHandle(a && a.instagram);
  if(!handle) return '';
  return `<a class="instagram-btn" href="https://www.instagram.com/${encodeURIComponent(handle)}/" target="_blank" rel="noopener noreferrer" aria-label="Open Instagram profile @${handle}">Instagram · @${handle}</a>`;
}
function enhanceArtistCardsWithInstagram(){
  document.querySelectorAll('.artist-card[data-artist-id]').forEach(card=>{
    const id=card.getAttribute('data-artist-id'); const a=artists[id]; if(!a)return;
    const actions=card.querySelector('.artist-actions');
    if(actions && !actions.querySelector('.instagram-btn')) actions.insertAdjacentHTML('beforeend',artistInstagramHTML(a));
  });
}
function incrementLocalVisitorCounter(){
  // Fallback for opening glamindex.html directly (file://) or when the API is unavailable.
  // This is a per-browser fallback, not a shared public visitor total.
  const key='GlamoraLocalVisitsV61';
  try{
    const previous=Number(localStorage.getItem(key))||100;
    const next=Math.max(100,previous)+1;
    localStorage.setItem(key,String(next));
    return next;
  }catch(_storageError){}
  try{
    const match=document.cookie.match(/(?:^|; )GlamoraLocalVisitsV61=(\d+)/);
    const next=Math.max(100,Number(match&&match[1])||100)+1;
    document.cookie='GlamoraLocalVisitsV61='+next+'; path=/; max-age=31536000; SameSite=Lax';
    return next;
  }catch(_cookieError){}
  try{
    const state=JSON.parse(window.name||'{}');
    const next=Math.max(100,Number(state.GlamoraLocalVisitsV61)||100)+1;
    state.GlamoraLocalVisitsV61=next;
    window.name=JSON.stringify(state);
    return next;
  }catch(_windowNameError){}
  return 101;
}
async function loadVisitorCounter(){
  const el=document.getElementById('hitCounter'); if(!el) return;
  const show=value=>{el.textContent=String(Math.max(100,Number(value)||100)).padStart(6,'0');};
  // A file:// page cannot call the Node/Express API. Use a local fallback instead.
  if(location.protocol==='file:'){
    show(incrementLocalVisitorCounter());
    return;
  }
  try{
    const r=await fetch('/api/counter',{method:'POST',cache:'no-store'});
    if(!r.ok) throw new Error('counter unavailable');
    const data=await r.json();
    show(data.visits);
  }catch(e){
    show(incrementLocalVisitorCounter());
    console.warn('Using local visitor counter because the server counter is unavailable.',e);
  }
}
(async function(){await loadArtists();enhanceArtistCardsWithInstagram();await refreshUser();loadGoogleMaps();await loadVisitorCounter();})();
