// public/app.js

const configSection = document.getElementById("config-section");
const statusSection = document.getElementById("status-section");
const controlSection = document.getElementById("control-section");

const configForm = document.getElementById("config-form");
const configError = document.getElementById("config-error");
const startBtn = document.getElementById("start-btn");

const pinInput = document.getElementById("pin");
const botsCountInput = document.getElementById("botsCount");
const antibotCheckbox = document.getElementById("antibotMode");
const randomNameRow = document.getElementById("randomName-row");
const randomNamesCheckbox = document.getElementById("useRandomNames");
const baseNameRow = document.getElementById("baseName-row");
const baseNameInput = document.getElementById("baseBotName");

const statusText = document.getElementById("status-text");
const statusTotal = document.getElementById("status-total");
const statusJoined = document.getElementById("status-joined");
const statusConnected = document.getElementById("status-connected");
const statusPhase = document.getElementById("status-phase");

const answerButtonsContainer = document.getElementById("answer-buttons");
const controlHint = document.getElementById("control-hint");
const controlStatus = document.getElementById("control-status");

let pollingInterval = null;
let lastQuestionState = null;

// ---------- UI helpers ----------

function show(element) {
  element.classList.remove("hidden");
}

function hide(element) {
  element.classList.add("hidden");
}

function validateConfigForm() {
  configError.textContent = "";

  const pin = pinInput.value.trim();
  const botsCount = parseInt(botsCountInput.value, 10);
  const antibot = antibotCheckbox.checked;
  const useRandomNames = antibot ? true : randomNamesCheckbox.checked;
  const baseName = baseNameInput.value.trim();

  let valid = true;

  if (!pin) valid = false;
  if (Number.isNaN(botsCount) || botsCount <= 0) valid = false;

  if (!antibot && !useRandomNames && !baseName) {
    valid = false;
  }

  startBtn.disabled = !valid;
}

function updateConditionalFields() {
  const antibot = antibotCheckbox.checked;

  if (antibot) {
    // antibot => always random names
    randomNamesCheckbox.checked = true;
    randomNameRow.classList.add("disabled");
    randomNamesCheckbox.disabled = true;

    // base name not used
    baseNameRow.classList.add("disabled");
    baseNameInput.disabled = true;
  } else {
    randomNameRow.classList.remove("disabled");
    randomNamesCheckbox.disabled = false;

    const useRandom = randomNamesCheckbox.checked;
    if (useRandom) {
      baseNameRow.classList.add("disabled");
      baseNameInput.disabled = true;
    } else {
      baseNameRow.classList.remove("disabled");
      baseNameInput.disabled = false;
    }
  }

  validateConfigForm();
}

// ---------- Config form events ----------

[pinInput, botsCountInput, baseNameInput].forEach((el) =>
  el.addEventListener("input", validateConfigForm)
);
antibotCheckbox.addEventListener("change", updateConditionalFields);
randomNamesCheckbox.addEventListener("change", updateConditionalFields);

configForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  startBtn.disabled = true;
  configError.textContent = "";

  const pin = pinInput.value.trim();
  const botsCount = parseInt(botsCountInput.value, 10);
  const antibotMode = antibotCheckbox.checked;
  const useRandomNames = antibotMode ? true : randomNamesCheckbox.checked;
  const baseBotName =
    !antibotMode && !useRandomNames ? baseNameInput.value.trim() : "";

  try {
    const res = await fetch("/api/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin,
        botsCount,
        antibotMode,
        useRandomNames,
        baseBotName,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to start bots");
    }

    // Switch to status view
    hide(configSection);
    show(statusSection);``
    show(controlSection);

    statusText.textContent = "Spawning bots and joining the game...";
    startPolling();
  } catch (err) {
    console.error(err);
    configError.textContent = err.message;
    startBtn.disabled = false;
  }
});

// ---------- Polling ----------

function startPolling() {
  if (pollingInterval) clearInterval(pollingInterval);
  pollingInterval = setInterval(fetchStatus, 1000);
}

async function fetchStatus() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    renderStatus(data);
  } catch (err) {
    console.error("Status error:", err);
  }
}

function renderStatus(data) {
  if (!data) return;

  statusPhase.textContent = data.phase || "CONFIG";

  const bots = data.bots || { total: 0, joined: 0, connected: 0 };
  statusTotal.textContent = bots.total;
  statusJoined.textContent = bots.joined;
  statusConnected.textContent = bots.connected;

  if (bots.total > 0 && bots.joined < bots.total) {
    statusText.textContent = `Joining bots... (${bots.joined}/${bots.total})`;
  } else if (bots.total > 0 && bots.joined === bots.total) {
    statusText.textContent = "All bots joined. Waiting for a question...";
  } else {
    statusText.textContent = "Waiting for bots...";
  }

  const q = data.currentQuestion;

  if (!q) {
    // No active question
    renderQuestionControls(null);
    controlStatus.textContent =
      data.phase === "FINISHED"
        ? "Quiz finished. Start a new game in Kahoot to continue."
        : "No question currently active.";
    lastQuestionState = null;
    return;
  }

  // There is an active question
  const stateChanged =
    !lastQuestionState ||
    lastQuestionState.numberOfChoices !== q.numberOfChoices ||
    lastQuestionState.answered !== q.answered;

  if (stateChanged) {
    renderQuestionControls(q);
  }

  if (q.answered) {
    controlStatus.textContent =
      "Answer sent to all bots. Waiting for the next question...";
  } else {
    controlStatus.textContent =
      "Question active. Pick an option to answer for all bots.";
  }

  lastQuestionState = { ...q };
}

// ---------- Answer controls ----------

function renderQuestionControls(currentQuestion) {
  answerButtonsContainer.innerHTML = "";

  if (!currentQuestion) {
    // No question -> no buttons
    return;
  }

  const { numberOfChoices, answered } = currentQuestion;

  const labels = ["Red", "Blue", "Yellow", "Green"];
  const classes = ["btn-red", "btn-blue", "btn-yellow", "btn-green"];

  const count = Math.min(Math.max(numberOfChoices, 2), 4);

  for (let i = 0; i < count; i++) {
    const btn = document.createElement("button");
    btn.className = `answer-btn ${classes[i]}`;
    btn.textContent = labels[i]; // Same colors, but custom text (not Kahoot’s)

    btn.disabled = answered;

    btn.addEventListener("click", () => {
      if (!answered) {
        sendAnswer(i);
      }
    });

    answerButtonsContainer.appendChild(btn);
  }
}

async function sendAnswer(choiceIndex) {
  // Disable buttons immediately to avoid multiple clicks
  const buttons = answerButtonsContainer.querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  controlStatus.textContent = "Sending answer to bots...";

  try {
    const res = await fetch("/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ choiceIndex }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to send answer");
    }

    controlStatus.textContent =
      "Answer submitted. Waiting for the next question...";
  } catch (err) {
    console.error(err);
    controlStatus.textContent = `Error sending answer: ${err.message}`;
  }
}

// ---------- Init ----------

updateConditionalFields();
validateConfigForm();