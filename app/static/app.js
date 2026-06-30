// --- RunMate AI Client JavaScript ---

document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const searchForm = document.getElementById('searchForm');
  const locationInput = document.getElementById('locationInput');
  const groundingToggle = document.getElementById('groundingToggle');
  const submitBtn = document.getElementById('submitBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyList = document.getElementById('historyList');
  const welcomeBanner = document.getElementById('welcomeBanner');
  const resultsContainer = document.getElementById('resultsContainer');
  
  // Dynamic UI Control Elements
  const levelStarter = document.getElementById('levelStarter');
  const levelRunner = document.getElementById('levelRunner');
  const starterWarningText = document.getElementById('starterWarningText');
  const autocompleteSuggestions = document.getElementById('autocompleteSuggestions');
  const distanceChipsContainer = document.getElementById('distanceChips');
  const monthChipsContainer = document.getElementById('monthChips');
  const formToggleHeader = document.getElementById('formToggleHeader');
  const formCollapsibleBody = document.getElementById('formCollapsibleBody');
  const formToggleIcon = document.getElementById('formToggleIcon');

  // Leaflet Map Globals
  let mapInstance = null;
  let markerGroup = null;
  const geocodeCache = {};
  const markerMap = {};

  // States
  const loadingState = document.getElementById('loadingState');
  const billingError = document.getElementById('billingError');
  const generalError = document.getElementById('generalError');
  const errorMessageText = document.getElementById('errorMessageText');
  const reportContent = document.getElementById('reportContent');
  
  // SSE elements
  const statusTitle = document.getElementById('statusTitle');
  const statusDetail = document.getElementById('statusDetail');
  
  // Results details
  const resGuidanceCard = document.getElementById('resGuidanceCard');
  const resGuidanceText = document.getElementById('resGuidanceText');
  const parkrunFallbackBanner = document.getElementById('parkrunFallbackBanner');
  const recommendationsList = document.getElementById('recommendationsList');
  const resDisclaimer = document.getElementById('resDisclaimer');
  
  // Fallbacks
  const historicalSection = document.getElementById('historicalSection');
  const historicalInsightText = document.getElementById('historicalInsightText');
  const historicalRacesList = document.getElementById('historicalRacesList');
  const travelTipCard = document.getElementById('travelTipCard');
  const travelTipText = document.getElementById('travelTipText');
  const parkrunSection = document.getElementById('parkrunSection');
  const parkrunTableBody = document.getElementById('parkrunTableBody');

  // Sidebar inputs
  const profileInputs = [
    'profileName',
    'profileGoal',
    'profileDistance',
    'profilePace',
    'profileUpcoming'
  ];

  // --- Welcome Banner Carousel Auto-rotation & Navigation ---
  let currentSlideIdx = 0;
  const slides = document.querySelectorAll('.carousel-slide');
  const indicators = document.querySelectorAll('.carousel-indicators .indicator');
  const prevBtn = document.getElementById('carouselPrevBtn');
  const nextBtn = document.getElementById('carouselNextBtn');
  let carouselIntervalId = null;

  function showSlide(index) {
    if (slides.length === 0) return;
    
    // Wrap around index
    if (index >= slides.length) {
      currentSlideIdx = 0;
    } else if (index < 0) {
      currentSlideIdx = slides.length - 1;
    } else {
      currentSlideIdx = index;
    }

    // Update active slide states
    slides.forEach((slide, idx) => {
      if (idx === currentSlideIdx) {
        slide.style.display = 'block';
        // Force reflow for transform transition to trigger properly
        slide.offsetHeight;
        slide.classList.add('active');
        slide.style.opacity = '1';
      } else {
        slide.classList.remove('active');
        slide.style.opacity = '0';
        slide.style.display = 'none';
      }
    });

    // Update indicator states
    indicators.forEach((indicator, idx) => {
      if (idx === currentSlideIdx) {
        indicator.classList.add('active');
      } else {
        indicator.classList.remove('active');
      }
    });
  }

  function startCarouselAutoPlay() {
    stopCarouselAutoPlay();
    carouselIntervalId = setInterval(() => {
      showSlide(currentSlideIdx + 1);
    }, 6000); // rotate every 6 seconds
  }

  function stopCarouselAutoPlay() {
    if (carouselIntervalId) {
      clearInterval(carouselIntervalId);
      carouselIntervalId = null;
    }
  }

  // Event Listeners for Nav buttons
  if (prevBtn && nextBtn) {
    prevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSlide(currentSlideIdx - 1);
      startCarouselAutoPlay(); // Restart timer
    });

    nextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showSlide(currentSlideIdx + 1);
      startCarouselAutoPlay(); // Restart timer
    });
  }

  // Click indicators
  indicators.forEach((indicator, idx) => {
    indicator.addEventListener('click', (e) => {
      e.stopPropagation();
      showSlide(idx);
      startCarouselAutoPlay(); // Restart timer
    });
  });

  // Start rotation
  startCarouselAutoPlay();

  // 1. Mobile Sidebar Toggle Drawer
  if (menuBtn && sidebar) {
    menuBtn.addEventListener('click', () => sidebar.classList.add('open'));
  }
  if (closeSidebarBtn && sidebar) {
    closeSidebarBtn.addEventListener('click', () => sidebar.classList.remove('open'));
  }

  // 2. Generate Rolling 12 Months starting from current month/year dynamically
  generateMonthChips();

  function generateMonthChips() {
    if (!monthChipsContainer) return;
    monthChipsContainer.innerHTML = '';
    
    // Use the current system date context
    const now = new Date();
    const startMonth = now.getMonth(); // 0-11
    const startYear = now.getFullYear();
    
    const monthNames = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    for (let i = 0; i < 12; i++) {
      const currentMonthIndex = (startMonth + i) % 12;
      const yearOffset = Math.floor((startMonth + i) / 12);
      const year = startYear + yearOffset;
      
      const monthName = monthNames[currentMonthIndex];
      const displayAbbr = monthName.substring(0, 3);
      
      // Label next year's months clearly (e.g. "Jan '27")
      const displayLabel = year !== startYear 
        ? `${displayAbbr} '${String(year).substring(2)}`
        : displayAbbr;

      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.dataset.value = monthName;
      chip.textContent = displayLabel;
      chip.disabled = true; // disabled initially until level is selected
      
      monthChipsContainer.appendChild(chip);
    }
  }

  // 3. Level-Based UI Form Activation and Disabling flow
  if (levelStarter && levelRunner) {
    levelStarter.addEventListener('change', validateFormState);
    levelRunner.addEventListener('change', validateFormState);
  }
  if (locationInput) {
    locationInput.addEventListener('input', validateFormState);
  }
  validateFormState(); // Initialize states on page load

  function validateFormState() {
    const isStarterSelected = levelStarter.checked;
    const isRunnerSelected = levelRunner.checked;
    const hasLevel = isStarterSelected || isRunnerSelected;
    
    // Toggle active theme classes on the body element
    if (isStarterSelected) {
      document.body.classList.remove('theme-runner');
      document.body.classList.add('theme-starter');
    } else if (isRunnerSelected) {
      document.body.classList.remove('theme-starter');
      document.body.classList.add('theme-runner');
    } else {
      document.body.classList.remove('theme-starter', 'theme-runner');
    }
    
    const hasLocation = locationInput.value.trim().length > 0;
    const shouldEnableOthers = hasLevel && hasLocation;
    
    // 2. Enable/Disable Month chips
    monthChipsContainer.querySelectorAll('.chip').forEach(chip => {
      chip.disabled = !shouldEnableOthers;
      if (!shouldEnableOthers) {
        chip.classList.remove('active');
      }
    });

    // 3. Enable/Disable Distance chips
    distanceChipsContainer.querySelectorAll('.chip').forEach(chip => {
      const isAdvanced = chip.dataset.advanced === 'true';
      chip.disabled = !shouldEnableOthers;
      
      if (shouldEnableOthers) {
        if (isStarterSelected) {
          if (isAdvanced) {
            chip.classList.add('not-recommended');
            chip.title = "Not recommended for Starter level";
            
            // If it was standard active, transform to warning-active
            if (chip.classList.contains('active')) {
              chip.classList.remove('active');
              chip.classList.add('warning-active');
            }
          } else {
            chip.classList.remove('not-recommended', 'warning-active');
            chip.removeAttribute('title');
          }
        } else {
          // RUNNER selected - all options enabled normally, remove warning markings
          chip.classList.remove('not-recommended');
          chip.removeAttribute('title');
          
          // If it was warning-active, transform back to standard active
          if (chip.classList.contains('warning-active')) {
            chip.classList.remove('warning-active');
            chip.classList.add('active');
          }
        }
      } else {
        // If disabled, remove active states and warning markings so they don't look active when disabled
        chip.classList.remove('active', 'warning-active', 'not-recommended');
        chip.removeAttribute('title');
      }
    });

    // 4. Enable/Disable Grounding toggle and Submit button
    groundingToggle.disabled = !shouldEnableOthers;
    const toggleLabel = document.querySelector('.grounding-toggle-container label');
    if (toggleLabel) {
      if (shouldEnableOthers) {
        toggleLabel.classList.remove('disabled-label');
      } else {
        toggleLabel.classList.add('disabled-label');
      }
    }
    submitBtn.disabled = !shouldEnableOthers;

    // 5. Show/Hide Starter recommendation warning text
    if (isStarterSelected && shouldEnableOthers) {
      starterWarningText.classList.remove('hidden');
    } else {
      starterWarningText.classList.add('hidden');
    }
  }

  // Set up chip selection handler
  setupChips('distanceChips');
  setupChips('monthChips');

  function setupChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.addEventListener('click', (e) => {
      const chip = e.target;
      if (chip.classList.contains('chip')) {
        e.preventDefault();
        if (chip.disabled) return;
        
        if (chip.classList.contains('not-recommended')) {
          // Starter clicking an advanced distance chip - toggle warning-active state
          chip.classList.toggle('warning-active');
        } else {
          // Standard chip - toggle active state
          chip.classList.toggle('active');
        }
      }
    });
  }

  function getSelectedChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    // Collect both standard active and warning-active chips
    const activeChips = container.querySelectorAll('.chip.active, .chip.warning-active');
    return Array.from(activeChips).map(chip => chip.dataset.value);
  }

  function clearSelectedChips(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.querySelectorAll('.chip.active, .chip.warning-active').forEach(chip => {
      chip.classList.remove('active', 'warning-active');
    });
  }

  function setSelectedChips(containerId, values) {
    const container = document.getElementById(containerId);
    if (!container || !values) return;
    clearSelectedChips(containerId);
    container.querySelectorAll('.chip').forEach(chip => {
      if (values.includes(chip.dataset.value) && !chip.disabled) {
        if (chip.classList.contains('not-recommended')) {
          chip.classList.add('warning-active');
        } else {
          chip.classList.add('active');
        }
      }
    });
  }

  // 4. OpenStreetMap Autocomplete Location Suggest
  let debounceTimeout;
  if (locationInput) {
    locationInput.addEventListener('input', () => {
      clearTimeout(debounceTimeout);
      const query = locationInput.value.trim();
      
      if (query.length < 3) {
        autocompleteSuggestions.classList.add('hidden');
        return;
      }

      debounceTimeout = setTimeout(() => {
        fetchLocationSuggestions(query);
      }, 300);
    });

    // Hide dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (e.target !== locationInput && e.target !== autocompleteSuggestions) {
        autocompleteSuggestions.classList.add('hidden');
      }
    });
  }

  async function fetchLocationSuggestions(query) {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'RunMate-AI-Webapp/1.0'
        }
      });
      if (!response.ok) return;
      const data = await response.json();
      renderSuggestions(data);
    } catch (err) {
      console.error("Autocomplete fetch error:", err);
    }
  }

  function renderSuggestions(places) {
    if (!places || places.length === 0) {
      autocompleteSuggestions.classList.add('hidden');
      return;
    }

    autocompleteSuggestions.innerHTML = '';
    autocompleteSuggestions.classList.remove('hidden');

    const seenLabels = new Set();

    places.forEach(place => {
      const addr = place.address || {};
      const city = addr.city || addr.town || addr.city_district || addr.suburb || addr.municipality || addr.village || addr.hamlet;
      const county = addr.county || addr.state_district;
      const state = addr.state;
      let country = addr.country || place.display_name;
      
      if (!country) return;

      // Shorten common countries
      if (country === 'United Kingdom') country = 'UK';
      if (country === 'United States' || country === 'United States of America') country = 'USA';

      // Build a clean, clarified label parts list (e.g. York, City of York, UK)
      const labelParts = [];
      if (city) labelParts.push(city);
      
      if (county && county !== city && county !== country) {
        labelParts.push(county);
      } else if (state && state !== city && state !== country) {
        labelParts.push(state);
      }
      
      if (country) labelParts.push(country);

      const label = labelParts.join(', ');

      // De-duplicate matching labels
      if (seenLabels.has(label)) return;
      seenLabels.add(label);

      const item = document.createElement('div');
      item.className = 'autocomplete-suggestion';
      item.innerHTML = `📍 <span>${label}</span>`;
      
      item.addEventListener('click', () => {
        locationInput.value = label;
        autocompleteSuggestions.classList.add('hidden');
        validateFormState();
      });

      autocompleteSuggestions.appendChild(item);
    });
  }

  // 5. Persistent Runner Profile Settings (Local Storage)
  profileInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const stored = localStorage.getItem(id);
    if (stored !== null) el.value = stored;
    el.addEventListener('input', () => {
      localStorage.setItem(id, el.value);
    });
  });

  // 6. Search History Management
  let searchHistory = JSON.parse(localStorage.getItem('runmate_history') || '[]');
  renderHistoryList();
  updateHistoryHeaderBorder();

  function saveHistoryItem(item) {
    searchHistory = searchHistory.filter(h => 
      !(h.location.toLowerCase() === item.location.toLowerCase() && h.level === item.level)
    );
    searchHistory.unshift(item);
    if (searchHistory.length > 10) searchHistory.pop();
    localStorage.setItem('runmate_history', JSON.stringify(searchHistory));
    renderHistoryList();
  }

  function deleteHistoryItem(index, e) {
    e.stopPropagation();
    searchHistory.splice(index, 1);
    localStorage.setItem('runmate_history', JSON.stringify(searchHistory));
    renderHistoryList();
  }

  function renderHistoryList() {
    if (!historyList) return;
    if (searchHistory.length === 0) {
      historyList.innerHTML = '<div class="empty-history-text">No recent searches</div>';
      return;
    }

    historyList.innerHTML = '';
    searchHistory.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'history-item';
      
      const details = document.createElement('div');
      details.className = 'history-item-details';
      
      const loc = document.createElement('span');
      loc.className = 'history-item-loc';
      const itemFlag = getCountryFlagEmoji(item.location);
      loc.textContent = `${itemFlag} ${item.location}`;
      
      const meta = document.createElement('span');
      meta.className = 'history-item-meta';
      const dists = item.distance && item.distance.length ? ` • ${item.distance.join(', ')}` : '';
      meta.textContent = `${item.level}${dists}`;
      
      details.appendChild(loc);
      details.appendChild(meta);
      
      const delBtn = document.createElement('button');
      delBtn.className = 'history-item-del';
      delBtn.innerHTML = '×';
      delBtn.addEventListener('click', (e) => deleteHistoryItem(index, e));

      el.appendChild(details);
      el.appendChild(delBtn);
      
      el.addEventListener('click', () => loadHistoryItem(item));
      historyList.appendChild(el);
    });
  }

  function loadHistoryItem(item) {
    if (item.level === 'STARTER') {
      levelStarter.checked = true;
    } else {
      levelRunner.checked = true;
    }
    
    // Set location first so validation enables the chips properly
    locationInput.value = item.location;
    
    // Trigger activation of inputs and constraints
    validateFormState();

    setSelectedChips('distanceChips', item.distance);
    setSelectedChips('monthChips', item.month);
    
    // Instantly load cached report results if they exist in localStorage history item
    if (item.report) {
      welcomeBanner.classList.add('hidden');
      resultsContainer.classList.remove('hidden');
      loadingState.classList.add('hidden');
      billingError.classList.add('hidden');
      generalError.classList.add('hidden');
      
      renderReport(item.report);
    }
    
    searchForm.scrollIntoView({ behavior: 'smooth' });
    sidebar.classList.remove('open');
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      searchHistory = [];
      localStorage.removeItem('runmate_history');
      renderHistoryList();
    });
  }

  function updateHistoryHeaderBorder() {
    const historyHeader = document.querySelector('.history-header');
    if (historyHeader && formCollapsibleBody) {
      const isExpanded = formCollapsibleBody.classList.contains('expanded');
      if (isExpanded) {
        historyHeader.style.borderTop = '1px solid rgba(255, 255, 255, 0.08)';
        historyHeader.style.paddingTop = '8px';
        historyHeader.style.marginTop = '4px';
      } else {
        historyHeader.style.borderTop = 'none';
        historyHeader.style.paddingTop = '0';
        historyHeader.style.marginTop = '0';
      }
    }
  }

  // Collapsible Search Form header toggle
  if (formToggleHeader && formCollapsibleBody) {
    formToggleHeader.addEventListener('click', () => {
      const isExpanded = formCollapsibleBody.classList.contains('expanded');
      if (isExpanded) {
        formCollapsibleBody.classList.remove('expanded');
        if (formToggleIcon) formToggleIcon.textContent = '+';
      } else {
        formCollapsibleBody.classList.add('expanded');
        if (formToggleIcon) formToggleIcon.textContent = '−';
      }
      updateHistoryHeaderBorder();
    });
  }


  let currentSearchQuery = null;

  // 7. Submit Form & SSE Stream Handling
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const level = document.querySelector('input[name="level"]:checked').value;
    const location = locationInput.value.trim();
    const distance = getSelectedChips('distanceChips');
    const month = getSelectedChips('monthChips');
    const no_grounding = !groundingToggle.checked;

    if (!location) return;

    // Capture the current search query criteria to pair with results later
    currentSearchQuery = { level, location, distance, month };

    // Reset UI states
    welcomeBanner.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
    
    loadingState.classList.remove('hidden');
    billingError.classList.add('hidden');
    generalError.classList.add('hidden');
    reportContent.classList.add('hidden');

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    statusTitle.textContent = "Lacing up our running shoes...";
    statusDetail.textContent = "RunMate is getting ready to jog...";

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level, location, distance, month, no_grounding })
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawJson = line.slice(6);
            try {
              const event = JSON.parse(rawJson);
              handlePipelineEvent(event);
            } catch (err) {
              console.error("Failed to parse SSE event JSON:", err, rawJson);
            }
          }
        }
      }

    } catch (err) {
      console.error("Fetch/SSE stream error:", err);
      showGeneralError(`Network or connection failure: ${err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitBtn.classList.remove('loading');
    }
  });

  // 8. Handle SSE Events
  function handlePipelineEvent(event) {
    if (event.type === 'status') {
      statusDetail.textContent = event.message;
      if (event.message.includes('Searching')) {
        statusTitle.textContent = "🏃‍♀️🏃‍♂️ Jogging around the web to find the best local races...";
      } else if (event.message.includes('recommendations')) {
        statusTitle.textContent = "⭐ Designing the perfect outlines for you...";
      } else if (event.message.includes('parkrun')) {
        statusTitle.textContent = "🗺️ Mapping out free, friendly Saturday parkruns...";
      } else if (event.message.includes('Resolving') || event.message.includes('Analyzing')) {
        statusTitle.textContent = "🤔 Planning our route path together...";
      }
    } 
    else if (event.type === 'result') {
      loadingState.classList.add('hidden');
      renderReport(event.report);
      
      // Save search report and criteria parameters to history
      if (currentSearchQuery) {
        saveHistoryItem({
          level: currentSearchQuery.level,
          location: currentSearchQuery.location,
          distance: currentSearchQuery.distance,
          month: currentSearchQuery.month,
          report: event.report
        });
      }
    } 
    else if (event.type === 'error') {
      loadingState.classList.add('hidden');
      if (event.error_type === 'billing') {
        billingError.classList.remove('hidden');
      } else {
        showGeneralError(event.message || "An unexpected error occurred during search.");
      }
    }
  }

  function showGeneralError(msg) {
    generalError.classList.remove('hidden');
    errorMessageText.textContent = msg;
  }

  // Helper to identify and label Abbott Marathon Majors or SuperHalfs
  function getDestinationSeriesBadge(raceName, distance) {
    // Abbott World Marathon Majors (Strict matching of contiguous names, supporting spaces and hyphens)
    const majors = [
      { regex: /tokyo(-| )marathon/i },
      { regex: /boston(-| )marathon/i },
      { regex: /london(-| )marathon/i },
      { regex: /berlin(-| )marathon/i },
      { regex: /chicago(-| )marathon/i },
      { regex: /(new york city|nyc|new york)(-| )marathon/i }
    ];

    for (const major of majors) {
      if (major.regex.test(raceName)) {
        return {
          type: 'major',
          label: '⭐ World Major',
          desc: 'One of the prestigious 6 Abbott World Marathon Majors. Completing all six earns the coveted Six Star Finisher Medal!'
        };
      }
    }

    // SuperHalfs Series (Strict matching of contiguous names, supporting spaces and hyphens)
    const superHalfs = [
      { regex: /lisbon(-| )half(-| )marathon/i },
      { regex: /prague(-| )half(-| )marathon/i },
      { regex: /(copenhagen(-| )half(-| )marathon|cph(-| )half)/i },
      { regex: /cardiff(-| )half(-| )marathon/i },
      { regex: /valencia(-| )half( |-)(marathon|maratón)/i },
      { regex: /berlin(-| )half(-| )marathon/i }
    ];

    for (const sh of superHalfs) {
      if (sh.regex.test(raceName)) {
        return {
          type: 'superhalf',
          label: '⭐ SuperHalf',
          desc: 'Part of the SuperHalfs series—six iconic European half marathons. Finish all six to earn the SuperMedal!'
        };
      }
    }

    return null;
  }

  function getCountryFlagEmoji(locationStr) {
    if (!locationStr) return '';
    const clean = locationStr.toLowerCase().trim();
    
    const flagMap = {
      'uk': '🇬🇧',
      'united kingdom': '🇬🇧',
      'great britain': '🇬🇧',
      'england': '🇬🇧',
      'scotland': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
      'wales': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
      'usa': '🇺🇸',
      'united states': '🇺🇸',
      'united states of america': '🇺🇸',
      'north korea': '🇰🇵',
      'south korea': '🇰🇷',
      'korea': '🇰🇷',
      'germany': '🇩🇪',
      'france': '🇫🇷',
      'spain': '🇪🇸',
      'italy': '🇮🇹',
      'japan': '🇯🇵',
      'china': '🇨🇳',
      'canada': '🇨🇦',
      'australia': '🇦🇺',
      'netherlands': '🇳🇱',
      'belgium': '🇧🇪',
      'austria': '🇦🇹',
      'switzerland': '🇨🇭',
      'sweden': '🇸🇪',
      'norway': '🇳🇴',
      'finland': '🇫🇮',
      'denmark': '🇩🇰',
      'ireland': '🇮🇪',
      'brazil': '🇧🇷',
      'mexico': '🇲🇽',
      'south africa': '🇿🇦',
      'new zealand': '🇳🇿',
      'singapore': '🇸🇬',
      'kenya': '🇰🇪',
      'ethiopia': '🇪🇹'
    };
    
    for (const key in flagMap) {
      if (clean.includes(key)) {
        return flagMap[key];
      }
    }
    
    // Extract last token after comma as fallback check
    const parts = clean.split(',');
    if (parts.length > 1) {
      const countryPart = parts[parts.length - 1].trim();
      if (flagMap[countryPart]) {
        return flagMap[countryPart];
      }
    }
    
    return '🏳️';
  }

  // 9. Render Report Output HTML with Upgraded Styling & Shorter URLs
  function renderReport(report) {
    reportContent.classList.remove('hidden');
    
    // Automatically collapse the search form box to focus on map & results
    if (formCollapsibleBody) {
      formCollapsibleBody.classList.remove('expanded');
      if (formToggleIcon) formToggleIcon.textContent = '+';
      updateHistoryHeaderBorder();
    }

    initAndPlotMap(report);

    const p = report.profile;
    const cd = report.coach_decision;
    const flag = getCountryFlagEmoji(p.location);

    // Update recommendations header
    const recHeader = document.getElementById('recommendationsHeader');
    if (recHeader) {
      const h2 = recHeader.querySelector('h2');
      if (h2) {
        h2.textContent = `🏅 Recommended Races in ${p.location} ${flag}`;
      }
    }

  // Show Beginner Guidance
    if (cd.beginner_guidance) {
      resGuidanceCard.classList.remove('hidden');
      resGuidanceText.textContent = cd.beginner_guidance;
    } else {
      resGuidanceCard.classList.add('hidden');
    }

    // Recommendations list
    recommendationsList.innerHTML = '';
    
    const hasRecs = report.recommendations && report.recommendations.length > 0;
    const hasParkruns = report.parkrun_local_events && report.parkrun_local_events.length > 0;
    
    if (hasRecs || hasParkruns) {
      recommendationsList.classList.remove('hidden');
      document.getElementById('recommendationsHeader').classList.remove('hidden');
      
      const officialRecs = report.recommendations || [];
      const top3 = officialRecs.slice(0, 3);
      const remainder = officialRecs.slice(3);
      
      // Convert parkrun events to recommendation format
      const parkrunRecs = (report.parkrun_local_events || []).map((event) => ({
        rank: 'Parkrun',
        race: {
          name: event.name,
          location: event.location || report.profile.location,
          date: event.start_time || 'Weekly Saturday',
          distance: '5K',
          url: event.url || 'https://www.parkrun.com',
          is_parkrun: true
        },
        explanation: 'Completely free weekly timed 5K community run. Open to walkers, joggers, and runners of all speeds and backgrounds.'
      }));

      // Combined remainder list
      const combinedRemainder = [...remainder, ...parkrunRecs];
      
      // 1. Render Top 3 Carousel (Only for the top official recommendations)
      if (top3.length > 0) {
        const carouselWrapper = document.createElement('div');
        carouselWrapper.className = 'rec-carousel-wrapper';
        
        const track = document.createElement('div');
        track.className = 'rec-carousel-track';
        
        const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
        
        top3.forEach((rec, idx) => {
          const race = rec.race;
          const medal = medals[rec.rank] || `#${rec.rank}`;
          const destSeries = getDestinationSeriesBadge(race.name, race.distance);
          const runnerIcon = idx % 2 === 0 ? '🏃‍♀️' : '🏃‍♂️';
          
          const slide = document.createElement('div');
          slide.className = `rec-carousel-slide ${idx === 0 ? 'active' : ''}`;
          slide.style.display = idx === 0 ? 'block' : 'none';
          slide.style.opacity = idx === 0 ? '1' : '0';
          
          const card = document.createElement('div');
          card.className = `rec-card ${race.is_parkrun ? 'rec-parkrun' : 'rec-official'}`;
          card.style.margin = '0';
          
          // Header
          const header = document.createElement('div');
          header.className = 'rec-card-header';
          
          const titleArea = document.createElement('div');
          titleArea.className = 'rec-title-area';
          
          const rankSpan = document.createElement('span');
          rankSpan.className = 'rec-rank';
          rankSpan.textContent = medal;
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'rec-name';
          nameSpan.textContent = race.name;
          
          titleArea.appendChild(rankSpan);
          titleArea.appendChild(nameSpan);
          
          // Prepend Type Badge (parkrun or RACE) and cost indicator (Free or money bag) as separate tags
          const typeBadge = document.createElement('span');
          const costBadge = document.createElement('span');
          
          if (race.is_parkrun) {
            typeBadge.style.backgroundColor = 'transparent';
            typeBadge.style.border = '1.5px solid #f97316';
            typeBadge.style.color = '#f97316';
            typeBadge.style.fontSize = '9px';
            typeBadge.style.fontWeight = '700';
            typeBadge.style.textTransform = 'uppercase';
            typeBadge.style.padding = '1px 5px';
            typeBadge.style.borderRadius = '4px';
            typeBadge.style.marginLeft = '8px';
            typeBadge.style.display = 'inline-flex';
            typeBadge.style.alignItems = 'center';
            typeBadge.style.lineHeight = '1';
            typeBadge.textContent = 'parkrun';
            
            costBadge.style.backgroundColor = 'transparent';
            costBadge.style.border = '1.5px solid #10b981';
            costBadge.style.color = '#10b981';
            costBadge.style.fontSize = '9px';
            costBadge.style.fontWeight = '700';
            costBadge.style.textTransform = 'uppercase';
            costBadge.style.padding = '1px 5px';
            costBadge.style.borderRadius = '4px';
            costBadge.style.marginLeft = '6px';
            costBadge.style.display = 'inline-flex';
            costBadge.style.alignItems = 'center';
            costBadge.style.lineHeight = '1';
            costBadge.textContent = 'Free';
          } else {
            typeBadge.style.backgroundColor = 'transparent';
            typeBadge.style.border = '1.5px solid #ef4444';
            typeBadge.style.color = '#ef4444';
            typeBadge.style.fontSize = '9px';
            typeBadge.style.fontWeight = '700';
            typeBadge.style.textTransform = 'uppercase';
            typeBadge.style.padding = '1px 5px';
            typeBadge.style.borderRadius = '4px';
            typeBadge.style.marginLeft = '8px';
            typeBadge.style.display = 'inline-flex';
            typeBadge.style.alignItems = 'center';
            typeBadge.style.lineHeight = '1';
            typeBadge.textContent = 'RACE';
            
            costBadge.style.backgroundColor = 'transparent';
            costBadge.style.border = '1.5px solid #fbbf24';
            costBadge.style.color = '#fbbf24';
            costBadge.style.fontSize = '9px';
            costBadge.style.fontWeight = '700';
            costBadge.style.textTransform = 'uppercase';
            costBadge.style.padding = '1px 5px';
            costBadge.style.borderRadius = '4px';
            costBadge.style.marginLeft = '6px';
            costBadge.style.display = 'inline-flex';
            costBadge.style.alignItems = 'center';
            costBadge.style.lineHeight = '1';
            costBadge.textContent = 'Paid';
          }
          titleArea.appendChild(typeBadge);
          titleArea.appendChild(costBadge);
          
          if (destSeries) {
            const badge = document.createElement('span');
            badge.className = `badge-${destSeries.type}`;
            badge.style.marginLeft = '8px';
            badge.textContent = destSeries.label;
            titleArea.appendChild(badge);
          }
          
          header.appendChild(titleArea);
          card.appendChild(header);
          
          // Metadata Row
          const metaRow = document.createElement('div');
          metaRow.className = 'rec-meta-row';
          
          let metaHtml = '';
          if (race.date) {
            metaHtml += `<span class="rec-meta-item">📅 ${race.date}</span>`;
          }
          if (metaHtml) metaHtml += ` <span class="rec-meta-divider">|</span> `;
          metaHtml += `<span class="rec-meta-item">${runnerIcon} ${race.distance}</span>`;
          metaHtml += ` <span class="rec-meta-divider">|</span> `;
          metaHtml += `<span class="rec-meta-item">📍 ${race.location}</span>`;
          metaRow.innerHTML = metaHtml;
          
          // Actions
          const actionsWrapper = document.createElement('span');
          actionsWrapper.className = 'rec-meta-item';
          actionsWrapper.style.marginLeft = 'auto';
          actionsWrapper.style.display = 'inline-flex';
          actionsWrapper.style.gap = '8px';
          actionsWrapper.style.alignItems = 'center';
          
          if (race.url) {
            const urlBtn = document.createElement('a');
            urlBtn.href = race.url;
            urlBtn.target = '_blank';
            urlBtn.className = 'rec-action-link';
            urlBtn.style.padding = '4px 10px';
            urlBtn.style.fontSize = '11px';
            urlBtn.style.margin = '0';
            urlBtn.innerHTML = 'Link';
            actionsWrapper.appendChild(urlBtn);
          }
          
          const mapBtn = document.createElement('button');
          mapBtn.type = 'button';
          mapBtn.className = 'show-on-map-btn';
          mapBtn.style.padding = '4px 10px';
          mapBtn.style.fontSize = '11px';
          mapBtn.innerHTML = '📍 Map';
          mapBtn.addEventListener('click', () => focusMarker(race.name));
          actionsWrapper.appendChild(mapBtn);
          
          metaRow.appendChild(actionsWrapper);
          card.appendChild(metaRow);
          
          // Explanation
          const exp = document.createElement('p');
          exp.className = 'rec-explanation';
          exp.textContent = rec.explanation;
          card.appendChild(exp);
          
          // Destination Series Info
          if (destSeries) {
            const destBox = document.createElement('div');
            destBox.className = `destination-series-info ${destSeries.type}-info`;
            destBox.innerHTML = `<strong>${destSeries.label}:</strong> ${destSeries.desc}`;
            card.appendChild(destBox);
          }
          
          slide.appendChild(card);
          track.appendChild(slide);
        });
        
        carouselWrapper.appendChild(track);
        
        // Indicators and Controls (only render if there's more than 1 item)
        if (top3.length > 1) {
          const controls = document.createElement('div');
          controls.className = 'carousel-nav-container';
          controls.style.marginTop = '12px';
          
          const prevBtn = document.createElement('button');
          prevBtn.type = 'button';
          prevBtn.className = 'carousel-nav-btn';
          prevBtn.innerHTML = '‹';
          
          const indicatorsContainer = document.createElement('div');
          indicatorsContainer.className = 'carousel-indicators';
          
          const nextBtn = document.createElement('button');
          nextBtn.type = 'button';
          nextBtn.className = 'carousel-nav-btn';
          nextBtn.innerHTML = '›';
          
          top3.forEach((_, sIdx) => {
            const ind = document.createElement('span');
            ind.className = `indicator ${sIdx === 0 ? 'active' : ''}`;
            ind.addEventListener('click', (e) => {
              e.stopPropagation();
              showCarouselSlide(sIdx);
            });
            indicatorsContainer.appendChild(ind);
          });
          
          let activeIdx = 0;
          const slidesEls = track.querySelectorAll('.rec-carousel-slide');
          const indicatorsEls = indicatorsContainer.querySelectorAll('.indicator');
          
          function showCarouselSlide(index) {
            if (index >= slidesEls.length) {
              activeIdx = 0;
            } else if (index < 0) {
              activeIdx = slidesEls.length - 1;
            } else {
              activeIdx = index;
            }
            
            slidesEls.forEach((slideEl, idx) => {
              if (idx === activeIdx) {
                slideEl.style.display = 'block';
                slideEl.offsetHeight; // Force reflow
                slideEl.classList.add('active');
                slideEl.style.opacity = '1';
              } else {
                slideEl.classList.remove('active');
                slideEl.style.opacity = '0';
                slideEl.style.display = 'none';
              }
            });
            
            indicatorsEls.forEach((indEl, idx) => {
              if (idx === activeIdx) {
                indEl.classList.add('active');
              } else {
                indEl.classList.remove('active');
              }
            });
          }
          
          prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showCarouselSlide(activeIdx - 1);
          });
          
          nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showCarouselSlide(activeIdx + 1);
          });
          
          controls.appendChild(prevBtn);
          controls.appendChild(indicatorsContainer);
          controls.appendChild(nextBtn);
          carouselWrapper.appendChild(controls);
        }
        
        recommendationsList.appendChild(carouselWrapper);
      }

      // 2. Render Remainder List (with combined Parkruns)
      if (combinedRemainder.length > 0) {
        // Promote races belonging to Abbott Majors or SuperHalfs
        const promoted = [];
        const standard = [];
        combinedRemainder.forEach(rec => {
          const destSeries = getDestinationSeriesBadge(rec.race.name, rec.race.distance);
          if (destSeries) {
            promoted.push(rec);
          } else {
            standard.push(rec);
          }
        });
        const sortedRemainder = [...promoted, ...standard];

        const remainderSection = document.createElement('div');
        remainderSection.className = 'remainder-races-section';
        remainderSection.style.marginTop = '24px';
        
        const remainderTitle = document.createElement('h3');
        remainderTitle.className = 'card-title';
        remainderTitle.style.marginBottom = '12px';
        remainderTitle.style.fontSize = '14px';
        remainderTitle.style.textTransform = 'uppercase';
        remainderTitle.style.letterSpacing = '0.05em';
        remainderTitle.style.color = 'var(--text-muted)';
        remainderTitle.textContent = '⭐ Additional Recommended Races & Parkruns';
        remainderSection.appendChild(remainderTitle);

        const listWrapper = document.createElement('div');
        listWrapper.className = 'remainder-list-wrapper';
        listWrapper.style.display = 'flex';
        listWrapper.style.flexDirection = 'column';
        listWrapper.style.gap = '8px';

        sortedRemainder.forEach((rec) => {
          const race = rec.race;
          const destSeries = getDestinationSeriesBadge(race.name, race.distance);
          const isPromoted = destSeries !== null;

          const row = document.createElement('div');
          row.className = `remainder-row-card ${isPromoted ? 'promoted-row' : ''}`;
          
          // Prepend Type Badge (parkrun in orange, or RACE in red) and cost tag (Free or money bag)
          let typeBadgeHtml = '';
          if (race.is_parkrun) {
            typeBadgeHtml = `
              <span style="background-color: transparent; border: 1.5px solid #f97316; color: #f97316; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; line-height: 1; margin-right: 6px;">parkrun</span>
              <span style="background-color: transparent; border: 1.5px solid #10b981; color: #10b981; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; line-height: 1; margin-right: 8px;">Free</span>
            `;
          } else {
            typeBadgeHtml = `
              <span style="background-color: transparent; border: 1.5px solid #ef4444; color: #ef4444; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; line-height: 1; margin-right: 6px;">RACE</span>
              <span style="background-color: transparent; border: 1.5px solid #fbbf24; color: #fbbf24; font-size: 9px; font-weight: 700; text-transform: uppercase; padding: 1px 5px; border-radius: 4px; display: inline-flex; align-items: center; line-height: 1; margin-right: 8px;">Paid</span>
            `;
          }

          let seriesBadgeHtml = '';
          if (destSeries) {
            seriesBadgeHtml = `<span class="badge-${destSeries.type}" style="margin-left: 8px; font-size: 10px; padding: 2px 6px;">${destSeries.label}</span>`;
          }

          let urlHtml = '';
          if (race.url) {
            urlHtml = `<a href="${race.url}" target="_blank" class="rec-action-link" style="padding: 2px 8px; font-size: 10px; margin: 0;">Link</a>`;
          }

          const rankDisplay = race.is_parkrun ? '🌳' : `#${rec.rank}`;

          row.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; flex-wrap: wrap;">
                ${typeBadgeHtml}
                <span style="font-weight: 700; color: var(--text-color); font-size: 13px;">${rankDisplay} ${race.name}</span>
                ${seriesBadgeHtml}
              </div>
              <div style="display: flex; gap: 6px; align-items: center;">
                ${urlHtml}
                <button type="button" class="show-on-map-btn" style="padding: 2px 8px; font-size: 10px;">📍 Map</button>
              </div>
            </div>
            <div style="display: flex; gap: 12px; margin-top: 4px; font-size: 11px; color: var(--text-muted); flex-wrap: wrap;">
              <span>📅 ${race.date || 'Year-round'}</span>
              <span>•</span>
              <span>🏃 ${race.distance}</span>
              <span>•</span>
              <span>📍 ${race.location}</span>
            </div>
            <p style="margin: 4px 0 0 0; font-size: 12px; line-height: 1.5; color: var(--text-muted);">${rec.explanation}</p>
          `;

          // Handle map focus
          const mapBtn = row.querySelector('.show-on-map-btn');
          if (mapBtn) {
            mapBtn.addEventListener('click', () => focusMarker(race.name));
          }

          listWrapper.appendChild(row);
        });

        remainderSection.appendChild(listWrapper);
        recommendationsList.appendChild(remainderSection);
      }
    } else {
      recommendationsList.classList.add('hidden');
      document.getElementById('recommendationsHeader').classList.add('hidden');
    }

    // Historical Fallback (N Korea)
    if (report.historical_races && report.historical_races.length > 0) {
      historicalSection.classList.remove('hidden');
      
      if (report.historical_insight) {
        document.getElementById('historicalInsightCard').classList.remove('hidden');
        document.getElementById('historicalInsightText').textContent = report.historical_insight;
        const country = p.location.split(',').pop().trim();
        document.getElementById('historicalInsightTitle').textContent = `Running in ${country} ${flag}`;
      } else {
        document.getElementById('historicalInsightCard').classList.add('hidden');
      }

      const histHeader = historicalSection.querySelector('.section-header h2');
      if (histHeader) {
        histHeader.textContent = `📅 Races Typically Held Here in ${p.location} ${flag}`;
      }

      historicalRacesList.innerHTML = '';
      report.historical_races.forEach((race, idx) => {
        const card = document.createElement('div');
        card.className = 'hist-card';
        
        const name = document.createElement('h3');
        name.className = 'hist-name';
        name.textContent = race.name;
        card.appendChild(name);
        
        // Horizontal Metadata Row (Top row below title)
        const metaRow = document.createElement('div');
        metaRow.className = 'rec-meta-row';
        
        let metaHtml = '';
        if (race.date) {
          metaHtml += `<span class="rec-meta-item">📅 ${race.date}</span>`;
        }
        if (metaHtml) metaHtml += ` <span class="rec-meta-divider">|</span> `;
        const runnerIcon = idx % 2 === 0 ? '🏃‍♂️' : '🏃‍♀️'; // starting with man runner here to mix even more!
        metaHtml += `<span class="rec-meta-item">${runnerIcon} ${race.distance}</span>`;
        metaHtml += ` <span class="rec-meta-divider">|</span> `;
        metaHtml += `<span class="rec-meta-item">📍 ${race.location}</span>`;
        metaRow.innerHTML = metaHtml;

        // Action buttons wrapper (push to the right)
        const actionsWrapper = document.createElement('span');
        actionsWrapper.className = 'rec-meta-item';
        actionsWrapper.style.marginLeft = 'auto';
        actionsWrapper.style.display = 'inline-flex';
        actionsWrapper.style.gap = '8px';
        actionsWrapper.style.alignItems = 'center';

        if (race.url) {
          const urlBtn = document.createElement('a');
          urlBtn.href = race.url;
          urlBtn.target = '_blank';
          urlBtn.className = 'rec-action-link';
          urlBtn.style.padding = '4px 10px';
          urlBtn.style.fontSize = '11px';
          urlBtn.style.margin = '0'; // align inline
          urlBtn.innerHTML = 'Link';
          actionsWrapper.appendChild(urlBtn);
        }

        // No map button is appended for typical historical races since the map is hidden for these fallback queries
        
        metaRow.appendChild(actionsWrapper);
        card.appendChild(metaRow);

        // Description (Simple paragraph text)
        if (race.description) {
          const desc = document.createElement('p');
          desc.className = 'hist-desc';
          desc.textContent = race.description;
          card.appendChild(desc);
        }
        
        historicalRacesList.appendChild(card);
      });

      if (report.travel_tip) {
        travelTipCard.classList.remove('hidden');
        travelTipText.textContent = report.travel_tip;
      } else {
        travelTipCard.classList.add('hidden');
      }
    } else {
      historicalSection.classList.add('hidden');
    }

    // Parkrun local list (hidden since they are merged under the recommendations list)
    if (parkrunSection) {
      parkrunSection.classList.add('hidden');
    }

    resDisclaimer.textContent = report.disclaimer;
    
    if (report.used_parkrun_fallback && (!report.historical_races || report.historical_races.length === 0)) {
      parkrunFallbackBanner.classList.remove('hidden');
    } else {
      parkrunFallbackBanner.classList.add('hidden');
    }
    
    resultsContainer.scrollIntoView({ behavior: 'smooth' });
  }

  function createDetailItem(icon, labelText, valueNode) {
    const item = document.createElement('div');
    item.className = 'rec-detail-item';
    
    const iconSpan = document.createElement('span');
    iconSpan.className = 'rec-detail-icon';
    iconSpan.textContent = icon;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'rec-detail-text';
    
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = labelText;
    
    textSpan.appendChild(label);
    
    if (typeof valueNode === 'string') {
      textSpan.appendChild(document.createTextNode(' ' + valueNode));
    } else {
      textSpan.appendChild(document.createTextNode(' '));
      textSpan.appendChild(valueNode);
    }
    
    item.appendChild(iconSpan);
    item.appendChild(textSpan);
    return item;
  }

  // --- Dynamic Leaflet Mapping & Geocoding Logic ---

  async function geocodeAddress(address) {
    if (geocodeCache[address]) return geocodeCache[address];
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1`;
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'en-US,en;q=0.9',
          'User-Agent': 'RunMate-AI-Webapp/1.0'
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      if (data && data.length > 0) {
        const result = { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        geocodeCache[address] = result;
        return result;
      }
    } catch (err) {
      console.error("Geocoding error for:", address, err);
    }
    return null;
  }

  async function initAndPlotMap(report) {
    const mapEl = document.getElementById('map');
    const mapSectionWrapper = document.getElementById('mapSectionWrapper');
    if (!mapEl || !mapSectionWrapper) return;

    // Check if only historical fallback is shown
    const hasHistorical = report.historical_races && report.historical_races.length > 0;
    const hasUpcoming = report.recommendations && report.recommendations.length > 0;
    const hasParkrun = report.parkrun_local_events && report.parkrun_local_events.length > 0;

    if (hasHistorical && !hasUpcoming && !hasParkrun) {
      mapSectionWrapper.classList.add('hidden');
      return;
    }

    // Reset marker registry
    for (const key in markerMap) {
      delete markerMap[key];
    }

    // Reset map instance if already exists
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
    }

    // Show map container wrapper immediately so user sees loader
    mapSectionWrapper.classList.remove('hidden');

    // Show spinner loader inside map
    mapEl.innerHTML = `
      <div class="map-loader" id="mapLoader">
        <div class="map-spinner"></div>
        <span>Plotting events on map...</span>
      </div>
    `;

    const searchLocation = report.profile.location;
    const centerCoords = await geocodeAddress(searchLocation);
    
    const pointsToPlot = [];

    // 1. Geocode Recommended Races (Green Pins)
    if (report.recommendations && report.recommendations.length > 0) {
      for (const rec of report.recommendations) {
        const race = rec.race;
        // Search specific race location
        const coords = await geocodeAddress(race.location);
        if (coords) {
          pointsToPlot.push({
            lat: coords.lat,
            lon: coords.lon,
            name: race.name,
            info: `🏃 ${race.distance} • 📅 ${race.date || 'Date TBD'}`,
            is_parkrun: false
          });
        }
      }
    }

    // 2. Geocode Historical Races (Green Pins)
    if (report.historical_races && report.historical_races.length > 0) {
      for (const race of report.historical_races) {
        const coords = await geocodeAddress(race.location);
        if (coords) {
          pointsToPlot.push({
            lat: coords.lat,
            lon: coords.lon,
            name: race.name,
            info: `🏃 ${race.distance} • Typical Date: ${race.date || 'TBD'}`,
            is_parkrun: false
          });
        }
      }
    }

    // 3. Geocode Parkruns (Blue Pins)
    if (report.parkrun_local_events && report.parkrun_local_events.length > 0) {
      for (const event of report.parkrun_local_events) {
        // Clean name (strip "parkrun" suffix) to search for the physical park name
        const cleanName = event.name.replace(/parkrun/gi, '').trim();
        const searchContext = `${cleanName}, ${searchLocation}`;
        let coords = await geocodeAddress(searchContext);
        
        // Fallback to original name if clean name returns nothing
        if (!coords) {
          coords = await geocodeAddress(`${event.name}, ${searchLocation}`);
        }

        if (coords) {
          pointsToPlot.push({
            lat: coords.lat,
            lon: coords.lon,
            name: event.name,
            info: `📍 parkrun weekly 5K • 📅 ${event.start_time}`,
            is_parkrun: true
          });
        }
      }
    }

    // If no coordinates could be resolved, keep map hidden
    if (pointsToPlot.length === 0) {
      mapSectionWrapper.classList.add('hidden');
      return;
    }

    // Show map container
    mapSectionWrapper.classList.remove('hidden');

    // Initialize Map
    const defaultCenter = centerCoords || { lat: 54.0, lon: -2.0 }; // UK default center
    mapInstance = L.map('map').setView([defaultCenter.lat, defaultCenter.lon], centerCoords ? 11 : 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    markerGroup = L.featureGroup().addTo(mapInstance);

    // Ensure map tiles calculate correct grid dimensions
    setTimeout(() => {
      if (mapInstance) mapInstance.invalidateSize();
    }, 100);

    // Custom leaflet colored marker icons
    const greenMarkerIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    const orangeMarkerIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // Add points to map
    pointsToPlot.forEach(point => {
      const marker = L.marker([point.lat, point.lon], {
        icon: point.is_parkrun ? orangeMarkerIcon : greenMarkerIcon
      });

      // Save marker reference
      const markerKey = point.name.toLowerCase().trim();
      markerMap[markerKey] = marker;

      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: #091124; line-height: 1.4;">
          <strong style="font-family: 'Outfit', sans-serif; font-size: 14px; display: block; margin-bottom: 2px; color: ${point.is_parkrun ? '#e65100' : '#2e7d32'};">${point.name}</strong>
          <span>${point.info}</span>
        </div>
      `;

      marker.bindPopup(popupContent);
      marker.addTo(markerGroup);
    });

    // Automatically zoom/pan to fit all markers nicely
    try {
      mapInstance.fitBounds(markerGroup.getBounds(), { padding: [40, 40] });
    } catch (e) {
      console.error("Leaflet fitBounds error:", e);
    }
  }

  // --- Map Navigation & Popups focus helper ---
  function focusMarker(name) {
    const key = name.toLowerCase().trim();
    const marker = markerMap[key];
    const mapSectionWrapper = document.getElementById('mapSectionWrapper');
    if (marker && mapInstance && mapSectionWrapper) {
      mapSectionWrapper.scrollIntoView({ behavior: 'smooth' });
      setTimeout(() => {
        marker.openPopup();
        mapInstance.setView(marker.getLatLng(), 13);
      }, 500); // Wait for smooth scroll to finish
    }
  }
});
