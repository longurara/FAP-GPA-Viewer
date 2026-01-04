let sessionStartTime = null;
let breakTime = 5 * 60; // 5 minutes break
let breakTimer = null;

// Load session data
chrome.storage.local.get(["currentStudySession"], (result) => {
  if (result.currentStudySession) {
    sessionStartTime = result.currentStudySession.startTime;
    updateSessionInfo();
  }
});

function updateSessionInfo() {
  if (sessionStartTime) {
    const now = Date.now();
    const sessionDuration = Math.floor((now - sessionStartTime) / 1000);
    const minutes = Math.floor(sessionDuration / 60);
    const seconds = sessionDuration % 60;

    document.getElementById(
      "sessionTime"
    ).textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }
}

function startBreakTimer() {
  breakTimer = setInterval(() => {
    const minutes = Math.floor(breakTime / 60);
    const seconds = breakTime % 60;

    document.getElementById(
      "breakCountdown"
    ).textContent = `Break Time: ${minutes}:${seconds
      .toString()
      .padStart(2, "0")}`;

    if (breakTime <= 0) {
      clearInterval(breakTimer);
      document.getElementById("breakCountdown").textContent =
        "Break time is over! Ready to study?";
    }

    breakTime--;
  }, 1000);
}

function goBackToStudy() {
  // Send message to background to resume study
  chrome.runtime.sendMessage({ action: "resumeStudy" });

  // Close this tab
  window.close();
}

function endStudySession() {
  // Send message to background to end session
  chrome.runtime.sendMessage({ action: "endStudySession" });

  // Close this tab
  window.close();
}

// Update session info every second
setInterval(updateSessionInfo, 1000);

// Start break timer
startBreakTimer();

// Add event listeners for buttons
document.getElementById("btnBackToStudy").addEventListener("click", goBackToStudy);
document.getElementById("btnEndSession").addEventListener("click", endStudySession);

// Listen for messages from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "updateDistractions") {
    document.getElementById("distractions").textContent = message.count;
  }
});
