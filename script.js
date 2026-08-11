// Replace with your OpenRouteService API key
const ORS_API_KEY = 'YOUR_OPENROUTESERVICE_API_KEY';

const map = L.map('map').setView([0,0], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

const statusEl = document.getElementById('status');
let userMarker, routeLayer;
let userCoords = null;

function setStatus(s){ statusEl.textContent = s; }

// get current location and center
function centerOnUser() {
  if (!navigator.geolocation) return setStatus('Geolocation unavailable');
  setStatus('Locating…');
  navigator.geolocation.getCurrentPosition(pos => {
    userCoords = [pos.coords.latitude, pos.coords.longitude];
    map.setView(userCoords, 15);
    if (!userMarker) userMarker = L.marker(userCoords).addTo(map);
    else userMarker.setLatLng(userCoords);
    setStatus('Located');
  }, err => setStatus('Location error: ' + err.message), { enableHighAccuracy:true });
}
document.getElementById('centerMe').onclick = centerOnUser;
centerOnUser();

// simple Nominatim geocode (light use only)
async function geocode(q){
  const url = 'https://nominatim.openstreetmap.org/search?format=json&q=' + encodeURIComponent(q);
  const res = await fetch(url, { headers: { 'Accept': 'application/json' }});
  const j = await res.json();
  if (!j.length) throw new Error('No results');
  return [parseFloat(j[0].lat), parseFloat(j[0].lon)];
}

// call OpenRouteService directions (driving-car)
async function getRoute(origin, dest){
  const coords = [
    [origin[1], origin[0]], // ORS expects [lng, lat]
    [dest[1], dest[0]]
  ];
  const body = { coordinates: coords };
  const res = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
    method: 'POST',
    headers: {
      'Authorization': ORS_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Routing error: ' + res.statusText);
  return await res.json();
}

// draw route and announce steps
function showRoute(geojson){
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(geojson, {
    style: { color: '#0077ff', weight: 5, opacity: 0.8 }
  }).addTo(map);
  map.fitBounds(routeLayer.getBounds(), { padding: [50,50] });

  // Try to extract turn-by-turn from properties if present
  const feat = geojson.features && geojson.features[0];
  if (feat && feat.properties && feat.properties.segments && feat.properties.segments[0]) {
    const steps = feat.properties.segments[0].steps || [];
    setStatus(`Route: ${(feat.properties.summary.distance/1000).toFixed(1)} km, ${(feat.properties.summary.duration/60).toFixed(0)} min — ${steps.length} steps`);
    // speak the first few instructions as a demo
    speakSequence(steps.slice(0,6).map(s => s.instruction + ' — ' + Math.round(s.distance) + ' m'));
  } else {
    setStatus('Route loaded');
  }
}

// simple speech queue
function speakSequence(lines){
  if (!('speechSynthesis' in window)) return;
  const u = window.speechSynthesis;
  lines.forEach(text => {
    const msg = new SpeechSynthesisUtterance(text);
    u.speak(msg);
  });
}

// wire UI
document.getElementById('go').onclick = async () => {
  const destQ = document.getElementById('dest').value.trim();
  if (!destQ) return setStatus('Enter destination');
  try {
    setStatus('Geocoding destination…');
    const destCoords = await geocode(destQ);
    if (!userCoords) {
      setStatus('No current location; using map center');
      userCoords = map.getCenter();
      userCoords = [userCoords.lat, userCoords.lng];
    }
    setStatus('Routing…');
    const geojson = await getRoute(userCoords, destCoords);
    showRoute(geojson);
  } catch (e) {
    setStatus('Error: ' + e.message);
    console.error(e);
  }
};
