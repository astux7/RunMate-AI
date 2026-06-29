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
  const resLevel = document.getElementById('resLevel');
  const resLocation = document.getElementById('resLocation');
  const resDistances = document.getElementById('resDistances');
  const resMonths = document.getElementById('resMonths');
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

    places.forEach(place => {
      const city = place.address.city || place.address.town || place.address.municipality || place.address.village;
      const country = place.address.country || place.display_name;
      if (!country) return;

      const label = city ? `${city}, ${country}` : country;

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

    const p = report.profile;
    const cd = report.coach_decision;
    
    resLevel.textContent = p.level;
    resLevel.className = `detail-val ${p.level.toLowerCase() === 'starter' ? 'starter-badge' : 'runner-badge'}`;
    resLocation.textContent = p.location;
    resDistances.textContent = cd.distances.join(', ');
    resMonths.textContent = cd.months_to_search.join(', ') || 'Next 3 months';

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
          tag.className = 'rec-tag';
          tag.textContent = 'Parkrun';
          titleArea.appendChild(tag);
        }
        
        header.appendChild(titleArea);
        card.appendChild(header);
        
        // Details Grid
        const grid = document.createElement('div');
        grid.className = 'rec-details-grid';
        
        if (race.date) {
          grid.appendChild(createDetailItem('📅', 'Date:', race.date));
        }
        grid.appendChild(createDetailItem('📍', 'Location:', race.location));
        grid.appendChild(createDetailItem('🏃', 'Distance:', race.distance));
        
        if (race.url) {
          const urlBtn = document.createElement('a');
          urlBtn.href = race.url;
          urlBtn.target = '_blank';
          urlBtn.className = 'rec-action-link';
          urlBtn.innerHTML = `${race.is_parkrun ? 'Open parkrun' : 'Visit Official Website'} ↗`;
          
          grid.appendChild(createDetailItem('🔗', 'Registration:', urlBtn));
        }
        
        card.appendChild(grid);
        
        // Explanation
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
        
        const details = document.createElement('div');
        details.className = 'rec-details-grid';
        if (race.date) details.appendChild(createDetailItem('📅', 'Typical Date:', race.date));
        details.appendChild(createDetailItem('📍', 'Location:', race.location));
        details.appendChild(createDetailItem('🏃', 'Distance:', race.distance));
        if (race.url) {
          const l = document.createElement('a');
          l.href = race.url;
          l.target = '_blank';
          l.className = 'rec-action-link';
          l.innerHTML = 'Visit Event Page ↗';
          
          details.appendChild(createDetailItem('🔗', 'Website:', l));
        }
        card.appendChild(details);

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
        tdName.textContent = event.name;
        
        const tdStart = document.createElement('td');
        tdStart.textContent = event.start_time;
        
        const tdLink = document.createElement('td');
        const a = document.createElement('a');
        a.href = event.url;
        a.target = '_blank';
        a.className = 'rec-action-link';
        a.style.padding = '4px 10px';
        a.style.fontSize = '11px';
        a.innerHTML = 'View page ↗';
        
        tdLink.appendChild(a);
        
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
});
