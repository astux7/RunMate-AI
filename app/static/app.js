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
    levelStarter.addEventListener('change', handleLevelChange);
    levelRunner.addEventListener('change', handleLevelChange);
  }

  function handleLevelChange() {
    const isStarterSelected = levelStarter.checked;
    const isRunnerSelected = levelRunner.checked;
    
    if (isStarterSelected || isRunnerSelected) {
      // Enable location, grounding, and submit button
      locationInput.disabled = false;
      locationInput.placeholder = "e.g. Leeds, United Kingdom or Germany";
      groundingToggle.disabled = false;
      document.querySelector('.grounding-toggle-container label').classList.remove('disabled-label');
      submitBtn.disabled = false;

      // Enable Month chips
      monthChipsContainer.querySelectorAll('.chip').forEach(chip => {
        chip.disabled = false;
      });

      // Handle distance chips based on level
      distanceChipsContainer.querySelectorAll('.chip').forEach(chip => {
        const isAdvanced = chip.dataset.advanced === 'true';
        chip.disabled = false; // Always enabled for both Starter and Runner
        
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
      });

      // Show/Hide Starter recommendation warning text
      if (isStarterSelected) {
        starterWarningText.classList.remove('hidden');
      } else {
        starterWarningText.classList.add('hidden');
      }
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
      loc.textContent = item.location;
      
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
    
    // Trigger activation of inputs and constraints first
    handleLevelChange();

    locationInput.value = item.location;
    setSelectedChips('distanceChips', item.distance);
    setSelectedChips('monthChips', item.month);
    
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

  // 7. Submit Form & SSE Stream Handling
  searchForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const level = document.querySelector('input[name="level"]:checked').value;
    const location = locationInput.value.trim();
    const distance = getSelectedChips('distanceChips');
    const month = getSelectedChips('monthChips');
    const no_grounding = !groundingToggle.checked;

    if (!location) return;

    // Reset UI states
    welcomeBanner.classList.add('hidden');
    resultsContainer.classList.remove('hidden');
    
    loadingState.classList.remove('hidden');
    billingError.classList.add('hidden');
    generalError.classList.add('hidden');
    reportContent.classList.add('hidden');

    submitBtn.disabled = true;
    submitBtn.classList.add('loading');

    statusTitle.textContent = "RunMate is thinking...";
    statusDetail.textContent = "Spinning up agents";

    saveHistoryItem({ level, location, distance, month });

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
        statusTitle.textContent = "🔍 Crawling running databases...";
      } else if (event.message.includes('recommendations')) {
        statusTitle.textContent = "⭐ Evaluating best options...";
      } else if (event.message.includes('parkrun')) {
        statusTitle.textContent = "🗺️ Mapping local weekly 5Ks...";
      } else if (event.message.includes('Resolving') || event.message.includes('Analyzing')) {
        statusTitle.textContent = "🤔 Planning search paths...";
      }
    } 
    else if (event.type === 'result') {
      loadingState.classList.add('hidden');
      renderReport(event.report);
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

  // 9. Render Report Output HTML with Upgraded Styling & Shorter URLs
  function renderReport(report) {
    reportContent.classList.remove('hidden');
    initAndPlotMap(report);

    const p = report.profile;
    const cd = report.coach_decision;

    // Show Beginner Guidance
    if (cd.beginner_guidance) {
      resGuidanceCard.classList.remove('hidden');
      resGuidanceText.textContent = cd.beginner_guidance;
    } else {
      resGuidanceCard.classList.add('hidden');
    }

    // Recommendations list
    recommendationsList.innerHTML = '';
    
    if (report.recommendations && report.recommendations.length > 0) {
      recommendationsList.classList.remove('hidden');
      document.getElementById('recommendationsHeader').classList.remove('hidden');
      
      const medals = { 1: '🥇', 2: '🥈', 3: '🥉' };
      
      report.recommendations.forEach(rec => {
        const race = rec.race;
        const medal = medals[rec.rank] || `#${rec.rank}`;
        
        const card = document.createElement('div');
        card.className = `rec-card ${race.is_parkrun ? 'rec-parkrun' : 'rec-official'}`;
        
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
        
        if (race.is_parkrun) {
          const tag = document.createElement('span');
          tag.className = 'badge-parkrun';
          tag.textContent = 'Parkrun';
          tag.style.marginLeft = '8px';
          
          const freeTag = document.createElement('span');
          freeTag.className = 'badge-free';
          freeTag.textContent = 'Free';
          freeTag.style.marginLeft = '6px';
          
          titleArea.appendChild(tag);
          titleArea.appendChild(freeTag);
        }
        
        header.appendChild(titleArea);
        card.appendChild(header);
        
        // Horizontal Metadata Row (Top row below title)
        const metaRow = document.createElement('div');
        metaRow.className = 'rec-meta-row';
        
        let metaHtml = '';
        if (race.date) {
          metaHtml += `<span class="rec-meta-item">📅 ${race.date}</span>`;
        }
        if (metaHtml) metaHtml += ` <span class="rec-meta-divider">|</span> `;
        metaHtml += `<span class="rec-meta-item">🏃 ${race.distance}</span>`;
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
          urlBtn.innerHTML = 'Link ↗';
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
        
        // Explanation (Simple paragraph text)
        const exp = document.createElement('p');
        exp.className = 'rec-explanation';
        exp.textContent = rec.explanation;
        
        card.appendChild(exp);
        
        recommendationsList.appendChild(card);
      });
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
        document.getElementById('historicalInsightTitle').textContent = `Running in ${country}`;
      } else {
        document.getElementById('historicalInsightCard').classList.add('hidden');
      }

      historicalRacesList.innerHTML = '';
      report.historical_races.forEach(race => {
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
        metaHtml += `<span class="rec-meta-item">🏃 ${race.distance}</span>`;
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
          urlBtn.innerHTML = 'Link ↗';
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

    // Parkrun local list
    if (report.parkrun_local_events && report.parkrun_local_events.length > 0) {
      parkrunSection.classList.remove('hidden');
      const city = p.location.split(',')[0].trim();
      document.getElementById('parkrunTitle').textContent = `🏃 parkrun events in ${city}`;
      
      parkrunTableBody.innerHTML = '';
      report.parkrun_local_events.forEach((event, idx) => {
        const tr = document.createElement('tr');
        
        const tdIdx = document.createElement('td');
        tdIdx.textContent = idx + 1;
        
        const tdName = document.createElement('td');
        tdName.style.fontWeight = '600';
        
        const nameSpan = document.createElement('span');
        nameSpan.textContent = event.name;
        
        const tag = document.createElement('span');
        tag.className = 'badge-parkrun';
        tag.style.fontSize = '9px';
        tag.style.padding = '1px 4px';
        tag.style.marginLeft = '8px';
        tag.textContent = 'parkrun';
        
        const freeTag = document.createElement('span');
        freeTag.className = 'badge-free';
        freeTag.style.fontSize = '9px';
        freeTag.style.padding = '1px 4px';
        freeTag.style.marginLeft = '4px';
        freeTag.textContent = 'Free';
        
        tdName.appendChild(nameSpan);
        tdName.appendChild(tag);
        tdName.appendChild(freeTag);
        
        const tdStart = document.createElement('td');
        tdStart.textContent = event.start_time;
        
        const tdLink = document.createElement('td');
        tdLink.style.display = 'flex';
        tdLink.style.gap = '6px';
        
        const a = document.createElement('a');
        a.href = event.url;
        a.target = '_blank';
        a.className = 'rec-action-link';
        a.style.padding = '4px 10px';
        a.style.fontSize = '11px';
        a.innerHTML = 'Link ↗';
        
        const mapBtn = document.createElement('button');
        mapBtn.type = 'button';
        mapBtn.className = 'show-on-map-btn';
        mapBtn.style.padding = '4px 10px';
        mapBtn.style.fontSize = '11px';
        mapBtn.innerHTML = '📍 Map';
        mapBtn.addEventListener('click', () => focusMarker(event.name));
        
        tdLink.appendChild(a);
        tdLink.appendChild(mapBtn);
        
        tr.appendChild(tdIdx);
        tr.appendChild(tdName);
        tr.appendChild(tdStart);
        tr.appendChild(tdLink);
        
        parkrunTableBody.appendChild(tr);
      });
    } else {
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
    if (pointsToPlot.length === 0) return;

    // Show map container
    mapSectionWrapper.classList.remove('hidden');

    // Initialize Map
    const defaultCenter = centerCoords || { lat: 54.0, lon: -2.0 }; // UK default center
    mapInstance = L.map('map').setView([defaultCenter.lat, defaultCenter.lon], centerCoords ? 11 : 6);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors'
    }).addTo(mapInstance);

    markerGroup = L.featureGroup().addTo(mapInstance);

    // Custom leaflet colored marker icons
    const greenMarkerIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    const blueMarkerIcon = new L.Icon({
      iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
      shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
      iconSize: [25, 41],
      iconAnchor: [12, 41],
      popupAnchor: [1, -34],
      shadowSize: [41, 41]
    });

    // Add points to map
    pointsToPlot.forEach(point => {
      const marker = L.marker([point.lat, point.lon], {
        icon: point.is_parkrun ? blueMarkerIcon : greenMarkerIcon
      });

      // Save marker reference
      const markerKey = point.name.toLowerCase().trim();
      markerMap[markerKey] = marker;

      const popupContent = `
        <div style="font-family: 'Inter', sans-serif; font-size: 13px; color: #091124; line-height: 1.4;">
          <strong style="font-family: 'Outfit', sans-serif; font-size: 14px; display: block; margin-bottom: 2px; color: #0044ff;">${point.name}</strong>
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
