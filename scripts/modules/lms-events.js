// ========== LMS Events Module ==========
// Fetch and display upcoming events from LMS HCM calendar

const LMS_CALENDAR_URL = 'https://lms-hcm.fpt.edu.vn/calendar/view.php?view=upcoming';
const LMS_CACHE_KEY = 'cache_lms_events';
const LMS_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Parse LMS events from HTML
function parseLMSEventsHtml(html) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const events = [];
  
  const eventElements = doc.querySelectorAll('div[data-type="event"]');
  
  eventElements.forEach(el => {
    try {
      const eventId = el.getAttribute('data-event-id') || '';
      const title = el.getAttribute('data-event-title') || '';
      const courseId = el.getAttribute('data-course-id') || '';
      const component = el.getAttribute('data-event-component') || '';
      
      // Get course name
      const courseLink = el.querySelector('a[href*="course/view.php"]');
      const courseName = courseLink ? courseLink.textContent.trim() : '';
      const courseUrl = courseLink ? courseLink.href : '';
      
      // Get date/time - look for the first col-11 with time info
      const timeRows = el.querySelectorAll('.description .row .col-11');
      let dateText = '';
      let timeText = '';
      
      if (timeRows.length > 0) {
        const fullDateTime = timeRows[0].textContent.trim();
        // Format: "Thursday, 22 January, 7:00 AM"
        const parts = fullDateTime.split(',');
        if (parts.length >= 2) {
          dateText = parts.slice(0, -1).join(',').trim();
          timeText = parts[parts.length - 1].trim();
        }
      }
      
      // Get action link
      const actionLink = el.querySelector('.card-footer a.card-link');
      const actionUrl = actionLink ? actionLink.href : '';
      const actionText = actionLink ? actionLink.textContent.trim() : '';
      
      // Parse date for countdown
      const dateLink = el.querySelector('a[href*="calendar/view.php?view=day"]');
      let timestamp = null;
      if (dateLink) {
        const href = dateLink.href;
        const timeMatch = href.match(/time=(\d+)/);
        if (timeMatch) {
          timestamp = parseInt(timeMatch[1]) * 1000;
        }
      }
      
      events.push({
        id: eventId,
        title: title,
        courseId: courseId,
        courseName: courseName,
        courseUrl: courseUrl,
        component: component,
        dateText: dateText,
        timeText: timeText,
        timestamp: timestamp,
        actionUrl: actionUrl,
        actionText: actionText
      });
    } catch (err) {
      console.warn('[LMS] Error parsing event:', err);
    }
  });
  
  return events;
}

// Fetch LMS events via background script
async function fetchLMSEvents(forceRefresh = false) {
  try {
    // Check cache first
    if (!forceRefresh) {
      const cached = await window.cacheGet?.(LMS_CACHE_KEY, LMS_CACHE_TTL);
      if (cached && cached.events && cached.events.length > 0) {
        return { events: cached.events, fromCache: true };
      }
    }
    
    // Request background to fetch
    const response = await chrome.runtime.sendMessage({
      type: 'FETCH_LMS_EVENTS',
      force: forceRefresh
    });
    
    if (response && response.error) {
      throw new Error(response.error);
    }
    
    if (response && response.html) {
      const events = parseLMSEventsHtml(response.html);
      
      // Cache the result
      await window.cacheSet?.(LMS_CACHE_KEY, { events, ts: Date.now() });
      
      return { events, fromCache: false };
    }
    
    return { events: [], fromCache: false };
  } catch (err) {
    console.error('[LMS] Error fetching events:', err);
    
    // Try to return cached data on error
    const cached = await window.cacheGet?.(LMS_CACHE_KEY, Infinity);
    if (cached && cached.events) {
      return { events: cached.events, fromCache: true, error: err.message };
    }
    
    return { events: [], error: err.message };
  }
}

// Calculate countdown badge
function getCountdownBadge(timestamp) {
  if (!timestamp) return null;
  
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff < 0) {
    return { type: 'overdue', text: 'Đã qua' };
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (hours < 24) {
    return { type: 'urgent', text: `${hours}h nữa` };
  } else if (days <= 3) {
    return { type: 'soon', text: `${days} ngày` };
  } else if (days <= 7) {
    return { type: 'normal', text: `${days} ngày` };
  }
  
  return null;
}

// Render LMS events to UI
function renderLMSEvents(events, searchQuery = '') {
  const container = document.getElementById('lmsEventsList');
  if (!container) return;
  
  // Filter by search
  let filtered = events;
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = events.filter(e => 
      e.title.toLowerCase().includes(q) ||
      e.courseName.toLowerCase().includes(q)
    );
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="no-class">
      ${searchQuery ? 'Không tìm thấy event phù hợp' : 'Không có thông báo LMS sắp tới'}
    </div>`;
    return;
  }
  
  const html = filtered.map(event => {
    const badge = getCountdownBadge(event.timestamp);
    const badgeHtml = badge 
      ? `<span class="lms-badge lms-badge-${badge.type}">${badge.text}</span>` 
      : '';
    
    return `
      <div class="lms-event-card" data-event-id="${event.id}">
        <div class="lms-event-header">
          <div class="lms-event-title">${event.title}</div>
          ${badgeHtml}
        </div>
        <div class="lms-event-meta">
          <div class="lms-event-course">
            <span class="lms-icon">📚</span>
            ${event.courseName || 'Course'}
          </div>
          <div class="lms-event-time">
            <span class="lms-icon">🕐</span>
            ${event.dateText}${event.timeText ? ', ' + event.timeText : ''}
          </div>
        </div>
        ${event.actionUrl ? `
          <div class="lms-event-actions">
            <a href="${event.actionUrl}" target="_blank" class="lms-action-btn">
              ${event.actionText || 'Xem chi tiết'}
            </a>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
  
  container.innerHTML = html;
}

// Main load function
async function loadLMSEvents(forceRefresh = false) {
  const container = document.getElementById('lmsEventsList');
  if (container) {
    container.innerHTML = '<div class="no-class">Đang tải...</div>';
  }
  
  try {
    const { events, fromCache, error } = await fetchLMSEvents(forceRefresh);
    
    renderLMSEvents(events);
    
    // Update quick stats if needed
    const countEl = document.getElementById('lmsEventCount');
    if (countEl) {
      countEl.textContent = events.length;
    }
    
    if (error && fromCache) {
      window.Toast?.warning('Đang hiển thị dữ liệu cũ. Lỗi: ' + error);
    }
    
    return events;
  } catch (err) {
    console.error('[LMS] Load error:', err);
    if (container) {
      container.innerHTML = '<div class="no-class">Lỗi tải dữ liệu LMS</div>';
    }
    return [];
  }
}

// Refresh function
async function refreshLMSEvents() {
  return loadLMSEvents(true);
}

// Export to window
window.loadLMSEvents = loadLMSEvents;
window.refreshLMSEvents = refreshLMSEvents;
window.renderLMSEvents = renderLMSEvents;
window.LMSEventsService = {
  load: loadLMSEvents,
  refresh: refreshLMSEvents,
  render: renderLMSEvents,
  parse: parseLMSEventsHtml,
  fetch: fetchLMSEvents
};
