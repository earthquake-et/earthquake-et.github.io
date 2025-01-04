/*
  Ethiopia Earthquake Tracker - Full Functionality Code
  Features:
  1. Dynamic user geolocation.
  2. Push notifications for earthquake alerts.
  3. Real-time earthquake monitoring for Ethiopia.
  4. Display list of previous and real-time earthquakes.
  5. Mark all real-time earthquake locations on the map.
  6. Show areas affected by seismic waves.
  7. Localization support for Amharic, Oromo, Tigrinya, and English.
  8. Safety instructions during alerts.
*/

// Ethiopia's geographical boundaries
const ETHIOPIA_BOUNDS = {
    north: 15.0,
    south: 3.4,
    east: 48.0,
    west: 33.0,
};

let userLocation = [9.145, 40.489673]; // Default location: Ethiopia's central coordinates
let currentLanguage = 'en'; // Default language
let map = null;
let notificationPermission = null;
let geolocationPermission = null;
const loadingMessage = document.getElementById('loading-message');
const alertSound = document.getElementById('alert-sound');
const alertContainer = document.getElementById('alert-container');
let isAlertActive = false;
let earthquakeLayerGroup = L.layerGroup(); // Initialize here
let audioContext;
const enableNotificationsButton = document.getElementById('enable-notifications-button');


// Check if an earthquake is within Ethiopia
function isInEthiopia(lat, lng) {
    return (
        lat >= ETHIOPIA_BOUNDS.south &&
        lat <= ETHIOPIA_BOUNDS.north &&
        lng >= ETHIOPIA_BOUNDS.west &&
        lng <= ETHIOPIA_BOUNDS.east
    );
}

// Initialize the map centered on Ethiopia
function initMap() {
    if (map) {
        return; // Do nothing if map is already initialized
    }

    map = L.map('map').setView([userLocation[0], userLocation[1]], 6); // Ethiopia coordinates
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
    }).addTo(map);
     earthquakeLayerGroup.addTo(map);
}

// Function to get user's real-time location
function getUserLocation() {
    if (!navigator.geolocation) {
      if(!map){
            initMap();
         }
        console.warn("Geolocation is not supported by this browser, using default location.");
        return;
    }
  navigator.permissions.query({ name: 'geolocation' })
        .then((permissionStatus) => {
          geolocationPermission = permissionStatus.state;
          handleGeolocationPermission(permissionStatus.state);
      });
}


 function handleGeolocationPermission(permissionState){
         if(permissionState === 'granted' || permissionState === 'prompt'){
               navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    userLocation = [latitude, longitude];
                    if(!map){
                       initMap();
                    }
                     map.setView(userLocation, 8);
                     console.log(`User location updated: ${userLocation}`);
                },
               (error) => {
                    console.error("Geolocation error:", error);
                     if(!map){
                         initMap();
                      }
                    // Optionally, display a message to the user
                    console.warn("Unable to get geolocation, using default location.");
                }
             );
          } else {
                if(!map){
                    initMap();
                 }
                console.warn("Geolocation is not supported, using default location.");
          }
 }

getUserLocation(); // Get user location on page load

// Fetch earthquake data from USGS
async function fetchEarthquakeData() {
    loadingMessage.style.display = 'block';
    try {
       const response = await fetch(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson'
        );
       if (!response.ok){
          throw new Error(`HTTP error! Status: ${response.status}`);
        }
    const data = await response.json();
    displayEthiopianEarthquakes(data.features);
    }catch (error){
        console.error("Fetch error:", error);
    } finally {
         loadingMessage.style.display = 'none';
    }
}

// Display earthquakes in Ethiopia and send alerts
function displayEthiopianEarthquakes(earthquakes) {
      // Clear existing markers and circles
    earthquakeLayerGroup.clearLayers();
    const historyContainer = document.getElementById('previous-earthquake-container');
    const realtimeContainer = document.getElementById('realtime-earthquake-container');

    const historyList = document.getElementById('earthquake-history');
    const realtimeList = document.getElementById('realtime-earthquake-list');

    historyList.innerHTML = '';
    realtimeList.innerHTML = '';

    earthquakes
        .filter((quake) => {
            const [lng, lat] = quake.geometry.coordinates;
            return isInEthiopia(lat, lng);
        })
        .forEach((earthquake) => {
            const { mag, place, time } = earthquake.properties;
            const [lng, lat] = earthquake.geometry.coordinates;

            // Add marker to map for real-time earthquake
            const marker = L.circleMarker([lat, lng], {
                radius: mag * 2,
                color: 'red',
            });
             marker.bindPopup(
                `<b>Location:</b> ${place}<br><b>Magnitude:</b> ${mag}<br><b>Time:</b> ${new Date(
                    time
                ).toLocaleString()}`
            );
            earthquakeLayerGroup.addLayer(marker)

            // Add to historical list
            const historyItem = document.createElement('li');
            historyItem.innerHTML = `<strong>${place}</strong><br>${translateText('Magnitude', currentLanguage)}: ${mag}<br>${translateText('Time', currentLanguage)}: ${new Date(
                time
            ).toLocaleString()}`;
            historyList.appendChild(historyItem);

             // Add to real-time list
            if (mag >= 4.0) {
                const currentTime = Date.now();
                 const radius = mag * 10;
                 const distance = calculateDistance(lat, lng, userLocation[0], userLocation[1]);
                  const timeUntilImpact = calculateTimeUntilImpact(lat, lng, currentTime);
                  const isUserInRadius = distance <= radius;


                const realtimeItem = document.createElement('li');
                 realtimeItem.innerHTML = `<strong>${place}</strong><br>${translateText('Magnitude', currentLanguage)}: ${mag}`;
                if (geolocationPermission === 'granted' || geolocationPermission === 'prompt') {
                  realtimeItem.innerHTML +=  `<br>${translateText('Estimated time until shaking', currentLanguage)}: ${timeUntilImpact} ${translateText('seconds', currentLanguage)}.`;
                }

                if (isUserInRadius) {
                    realtimeItem.innerHTML += `<br> ${translateText('You are within the affected radius.', currentLanguage)}`
                }

                  realtimeList.appendChild(realtimeItem);
                 if ((geolocationPermission === 'granted' || geolocationPermission === 'prompt') && isUserInRadius && timeUntilImpact > 0 && timeUntilImpact <= 60) {
                       if(!isAlertActive){
                            markAffectedArea(lat, lng, mag);
                            alertUser(place, mag, timeUntilImpact);
                         }
                    } else {
                           markAffectedArea(lat, lng, mag, false);
                        console.log("User is not within the radius or the time is out of range or they did not give geolocation access");
                    }
            }
        });
    // Update heading translations after data is updated
    updateHeadingTranslations();
}

// Mark affected area by seismic waves on the map
function markAffectedArea(lat, lng, magnitude, isAlert = true) {
    const radius = magnitude * 10; // Approximate radius affected in km
      const circleOptions = {
        color: isAlert ? 'orange' : 'gray',
        fillColor: isAlert ? '#f03' : 'gray',
        fillOpacity: isAlert ? 0.5 : 0.2,
        radius: radius * 1000, // Convert to meters
    };

    const circle = L.circle([lat, lng], circleOptions)
        .bindPopup(`${translateText('Affected Area', currentLanguage)}: ${radius} km radius`);
        earthquakeLayerGroup.addLayer(circle);
}

// Calculate time until shaking starts
function calculateTimeUntilImpact(lat, lng, currentTime) {
    const speedOfSeismicWaves = 5; // Approx. speed in km/s
    const distance = calculateDistance(lat, lng, userLocation[0], userLocation[1]);
    return Math.round(distance / speedOfSeismicWaves); // Time in seconds
}

// Calculate distance using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    const earthRadiusKm = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusKm * c; // Distance in km
}

// Alert user of an earthquake
function alertUser(place, magnitude, timeUntilImpact) {
  if(isAlertActive){
    return;
  }
     isAlertActive = true;
    const messageEn = `⚠️ ${translateText('Earthquake Alert!',currentLanguage)} ⚠️\n${translateText('Location',currentLanguage)}: ${place}\n${translateText('Magnitude',currentLanguage)}: ${magnitude}`;
    const timeUntilShakingMessage = timeUntilImpact ? `\n${translateText('Estimated time until shaking',currentLanguage)}: ${timeUntilImpact} ${translateText('seconds',currentLanguage)}.` : '';
    const fullMessage = `${messageEn}${timeUntilShakingMessage}\n${translateText('Take immediate precautions!', currentLanguage)}`;
  console.log(fullMessage); // For debugging
    displayAlert(fullMessage);
    sendPushNotification(`${translateText('Earthquake Alert!', currentLanguage)}`, fullMessage);
     playSound();
}


// Push notification setup
if ('serviceWorker' in navigator && 'PushManager' in window) {
    navigator.serviceWorker.register('sw.js').then((registration) => {
        console.log('Service Worker registered:', registration);
    });
}

//Request permission for push notifications
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(permission => {
            notificationPermission = permission;
           updateButtonState();
            if (permission === 'granted') {
                console.log('Notification permission granted.');
            } else if (permission === 'denied') {
                console.warn('Notification permission denied.');
            } else {
                console.log('Notification permission closed.');
            }
        });
    } else {
        console.error('Notification API not supported.');
    }
}


 function updateButtonState() {
    if (notificationPermission === 'granted') {
      enableNotificationsButton.innerHTML = `${translateText('Disable Push Notifications', currentLanguage)} <i class="fa-solid fa-bell-slash"></i>`;
        enableNotificationsButton.style.backgroundColor = '#d9534f'; // Red for disable
    } else {
         enableNotificationsButton.innerHTML = `${translateText('Enable Push Notifications', currentLanguage)}  <i class="fa-solid fa-bell"></i>`;
        enableNotificationsButton.style.backgroundColor = '#5cb85c'; // Green for enable
    }
 }

enableNotificationsButton.addEventListener('click', () => {
       if (notificationPermission === 'granted') {
           // If permission is granted, we revoke it by setting notification permission to default
          notificationPermission = 'default';
            updateButtonState();
           navigator.serviceWorker.ready.then(registration => {
            registration.pushManager.getSubscription().then(subscription =>{
                if(subscription){
                  subscription.unsubscribe().then(()=>{
                       console.log("Push notification unsubscribed");
                       updateButtonState();
                  }).catch(error => console.error('Error unsubscribing', error));
                }
            })
         })
        } else {
            requestNotificationPermission();
        }

});

function sendPushNotification(title, message) {
    if(notificationPermission === 'granted') {
            navigator.serviceWorker.ready.then((registration) => {
                registration.showNotification(title, {
                    body: message,
                    icon: 'icon.png',
                    vibrate: [200, 100, 200], // Vibrate pattern
                });
            });
    }
    else if(notificationPermission === 'denied'){
        console.warn("Notification permission denied, cannot send push notification.")
    }
    else {
        console.log("Notification permission not yet granted.")
    }

}

// Function to play alert sound
function playSound() {
    if (audioContext && alertSound) {
         alertSound.play()
         .catch(error => {
               console.error("Audio playback failed:", error);
          });

       } else {
          console.error("Audio context or sound not initialized")
       }

}
function setupAudioContext() {
   if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
          console.log("Audio context is set")
        }
  }
// Function to display custom alerts
function displayAlert(message) {
    const alertBox = document.createElement('div');
    alertBox.classList.add('alert-box');
    alertBox.innerHTML = message;
    alertContainer.appendChild(alertBox);

    // Show the alert
    setTimeout(() => {
        alertBox.classList.add('show');
    }, 10); // Small delay to ensure the class is toggled.

     // Hide and remove the alert after a delay (e.g., 5 seconds)
    setTimeout(() => {
      alertBox.classList.remove('show');
      setTimeout(() => {
        alertBox.remove();
        isAlertActive = false; // Reset the flag after the alert is removed
      }, 300); // Wait for transition to finish

    }, 5000);
}
// Translation data
const translations = {
    en: {
        'Ethiopia Earthquake Tracker': 'Ethiopia Earthquake Tracker',
        'Earthquake Alert!': 'Earthquake Alert!',
        'Location': 'Location',
        'Magnitude': 'Magnitude',
        'Time': 'Time',
        'Estimated time until shaking': 'Estimated time until shaking',
        'seconds': 'seconds',
        'Take immediate precautions!': 'Take immediate precautions!',
        'Previous Earthquakes': 'Previous Earthquakes',
        'Realtime Earthquakes': 'Realtime Earthquakes',
        'Safety Instructions': 'Safety Instructions',
        'Affected Area' : 'Affected Area',
        'Stay calm and move to a safe location.' : 'Stay calm and move to a safe location.',
        'Drop, Cover, and Hold on.' : 'Drop, Cover, and Hold on.',
        'Avoid windows and outer walls.' : 'Avoid windows and outer walls.',
        'Check for injuries and help others.' : 'Check for injuries and help others.',
         'You are within the affected radius.' : 'You are within the affected radius.',
         'Enable Push Notifications' : 'Enable Push Notifications',
         'Disable Push Notifications': 'Disable Push Notifications'


    },
    am: {
        'Ethiopia Earthquake Tracker': 'የኢትዮጵያ የመሬት መንቀጥቀጥ መከታተያ',
        'Earthquake Alert!': 'የመሬት መንቀጥቀጥ ማስጠንቀቂያ!',
        'Location': 'ቦታ',
        'Magnitude': 'የሬክተር መጠን',
        'Time': 'ጊዜ',
        'Estimated time until shaking': 'እስኪንቀጠቀጥ የሚገመት ጊዜ',
        'seconds': 'ሰከንዶች',
        'Take immediate precautions!': 'አስቸኳይ ጥንቃቄዎችን ያድርጉ!',
        'Previous Earthquakes': 'ያለፉ የመሬት መንቀጥቀጦች',
        'Realtime Earthquakes': 'የአሁኑ የመሬት መንቀጥቀጦች',
        'Safety Instructions': 'የደህንነት መመሪያዎች',
        'Affected Area' : 'የተጎዳ አካባቢ',
        'Stay calm and move to a safe location.' : 'ረጋ ብለው ወደ ደህንነቱ የተጠበቀ ቦታ ይሂዱ።',
        'Drop, Cover, and Hold on.' : 'አጎንብሱ፣ ሸፍኑ እና ያዙ።',
        'Avoid windows and outer walls.' : 'መስኮቶችን እና ውጫዊ ግድግዳዎችን ያስወግዱ።',
        'Check for injuries and help others.' : 'ጉዳቶችን ይፈትሹ እና ሌሎችን ያግዙ።',
         'You are within the affected radius.' : 'እርስዎ በተጎዳው ራዲየስ ውስጥ ነዎት።',
           'Enable Push Notifications' : 'መልዕክት ማሳወቂያ አብራ',
           'Disable Push Notifications': 'መልዕክት ማሳወቂያ አጥፋ'

    },
    or: {
       'Ethiopia Earthquake Tracker': 'Hordoffii Sochii Lafaa Itoophiyaa',
        'Earthquake Alert!': 'Akeekkachiisa Sochii lafaa!',
        'Location': 'Bakka',
        'Magnitude': 'Guddina',
        'Time': 'Yeroo',
        'Estimated time until shaking': 'Yeroo hamma sochoon',
        'seconds': 'sekondii',
        'Take immediate precautions!': 'Of eeggannoo hatattamaa godhaa!',
        'Previous Earthquakes': 'Sochii lafaa kan duraanii',
        'Realtime Earthquakes': 'Sochii lafaa kan amma',
        'Safety Instructions': 'Qajeelfamoota Nageenyaa',
        'Affected Area' : 'Bakka Miidhame',
        'Stay calm and move to a safe location.' : 'Tasgabbaa’aa ta’aa gara bakka nagaa deemaa.',
        'Drop, Cover, and Hold on.' : 'Gadi bu’aa, Haguugaa, fi Qabaadhaa.',
        'Avoid windows and outer walls.' : 'Foddaa fi dallaa alaati irraa fagaadhaa.',
        'Check for injuries and help others.' : 'Miidhaa jiraachuu isaa mirkaneeffadhaa fi warra kaaniif gargaaraa.',
          'You are within the affected radius.' : 'Ati raadiyaasii miidhamaa keessa jirta.',
           'Enable Push Notifications' : 'Beeksisa Dhiibbaa Aktiveessaa',
           'Disable Push Notifications': 'Beeksisa Dhiibbaa Dhaamsaa'

    },
    ti: {
        'Ethiopia Earthquake Tracker': 'ኢትዮጵያ ምንቅጥቃጥ ምድሪ መከታተሊ',
        'Earthquake Alert!': 'ምንቅጥቃጥ ምድሪ ኣጠንቅቖ!',
        'Location': 'ቦታ',
        'Magnitude': 'ዓቐን',
        'Time': 'ግዜ',
        'Estimated time until shaking': 'ግዜ ክሳብ ምንቅጥቃጥ',
        'seconds': 'ሰከንዶች',
        'Take immediate precautions!': 'ቅልጡፍ ጥንቃቐታት ግበሩ!',
        'Previous Earthquakes': 'ዝሓለፈ ምንቅጥቃጥ ምድሪ',
        'Realtime Earthquakes': 'ናይ ሕጂ ምንቅጥቃጥ ምድሪ',
        'Safety Instructions': 'መምርሒታት ድሕንነት',
        'Affected Area' : 'ዝተጎድአ ከባቢ',
        'Stay calm and move to a safe location.' : 'ህድእ ኢልኩም ናብ ድሕንቲ ቦታ ውሰዱ።',
        'Drop, Cover, and Hold on.' : 'ጎብለል በሉ ፡ ክትመቱ ፡ ሓዝዎ።',
        'Avoid windows and outer walls.' : 'መስኮትን ናይ ወጻኢ መንደራትን ተዓቀቡ።',
        'Check for injuries and help others.' : 'ጉድኣት እንተሃልዩ ፈትሹ ንኻልኦት ሓግዙ።',
        'You are within the affected radius.' : 'ኣብ ዉሽጢ ራድዮስ ተጽዕኖ ኣለኻ።',
           'Enable Push Notifications' : 'ናይ መግፋሕቲ መፍለጢ ኣነቓቕሑ',
           'Disable Push Notifications': 'ናይ መግፋሕቲ መፍለጢ ኣጥፍእ'
    }
};

// Function to translate text
function translateText(key, language) {
    return translations[language] && translations[language][key] || translations['en'][key] || key;
}


// Function to update heading translations
function updateHeadingTranslations() {
    document.querySelector('header h1').textContent = translateText('Ethiopia Earthquake Tracker', currentLanguage);
    document.querySelector('#previous-earthquake-container h2').textContent = translateText('Previous Earthquakes', currentLanguage);
    document.querySelector('#realtime-earthquake-container h2').textContent = translateText('Realtime Earthquakes', currentLanguage);
    document.querySelector('.safety-instructions h2').textContent = translateText('Safety Instructions', currentLanguage);
    updateButtonState();


      document.querySelectorAll('#safety-list li').forEach((li, index) => {
        switch (index){
            case 0:
                li.innerHTML = translateText('Stay calm and move to a safe location.', currentLanguage);
                break;
            case 1:
                li.innerHTML = translateText('Drop, Cover, and Hold on.', currentLanguage);
                break;
            case 2:
                li.innerHTML = translateText('Avoid windows and outer walls.', currentLanguage);
                break;
            case 3:
                li.innerHTML = translateText('Check for injuries and help others.', currentLanguage);
                break;
        }
    });

}

// Language change event listener
document.getElementById('language-dropdown').addEventListener('change', (event) => {
    currentLanguage = event.target.value;
    updateHeadingTranslations();
    fetchEarthquakeData(); // Re-fetch data to update translations in feed
});

// Update heading translations on page load
updateHeadingTranslations();
 // Set initial button state
    navigator.permissions.query({ name: 'notifications' }).then(permissionStatus => {
        notificationPermission = permissionStatus.state;
        updateButtonState();
    });

// Fetch and display data every 30 seconds
fetchEarthquakeData();
setInterval(fetchEarthquakeData, 30000);
setupAudioContext();
