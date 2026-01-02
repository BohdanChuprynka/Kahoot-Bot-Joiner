// botServer.js
"use strict";

const express = require("express");
const path = require("path");
const random = require("random-name");
const Kahoot = require("kahoot.js-latest");

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

process.setMaxListeners(Number.POSITIVE_INFINITY);

// ---------- Helpers ----------

function getRandomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randName() {
  return `${random.first()} ${random.last()}`;
}

// ---------- Global state ----------

const state = {
  phase: "CONFIG", // CONFIG | JOINING | QUESTION | FINISHED
  leaderId: 0,
  config: null,
  bots: [], // { id, name, client, joined, connected }
  currentQuestion: null, // { numberOfChoices, answered }
};

// ---------- API: start bots ----------

app.post("/api/start", (req, res) => {
  const {
    pin,
    botsCount,
    antibotMode,
    useRandomNames,
    baseBotName,
  } = req.body;

  if (!pin || !botsCount || botsCount <= 0) {
    return res.status(400).json({ error: "PIN and botsCount are required." });
  }

  if (!antibotMode && !useRandomNames && !baseBotName) {
    return res
      .status(400)
      .json({ error: "Base bot name is required when random names are off." });
  }

  // Reset state
  state.phase = "JOINING";
  state.config = {
    pin,
    botsCount,
    antibotMode: !!antibotMode,
    useRandomNames: !!useRandomNames || !!antibotMode, // antibot => always random
    baseBotName: baseBotName || "",
  };

  // Clean up old bots if any
  state.bots.forEach((b) => {
    try {
      b.client.leave();
    } catch (e) {}
  });
  state.bots = [];
  state.currentQuestion = null;

  console.log(
    `Starting ${botsCount} bots on PIN ${pin} (antibot=${antibotMode}, randomNames=${state.config.useRandomNames})`
  );

  for (let i = 0; i < botsCount; i++) {
    createBot(i);
  }

  return res.json({ ok: true });
});

// ---------- API: status ----------

app.get("/api/status", (req, res) => {
  const joined = state.bots.filter((b) => b.joined).length;
  const connected = state.bots.filter((b) => b.connected).length;

  res.json({
    phase: state.phase,
    config: state.config
      ? {
          pin: state.config.pin,
          botsCount: state.config.botsCount,
          antibotMode: state.config.antibotMode,
          useRandomNames: state.config.useRandomNames,
          baseBotName: state.config.baseBotName,
        }
      : null,
    bots: {
      total: state.bots.length,
      joined,
      connected,
    },
    currentQuestion: state.currentQuestion,
  });
});

// ---------- API: answer (manual) ----------

app.post("/api/answer", (req, res) => {
  const { choiceIndex } = req.body;

  if (
    !state.currentQuestion ||
    state.currentQuestion.answered ||
    typeof choiceIndex !== "number"
  ) {
    return res.status(400).json({ error: "No open question or already answered." });
  }

  const idx = choiceIndex | 0;

  console.log(`Manual answer chosen: index ${idx} for all bots.`);

  state.currentQuestion.answered = true;

  state.bots.forEach((bot) => {
    if (!bot.connected || !bot.joined) return;
    setTimeout(() => {
      try {
        bot.client.answer(idx);
      } catch (e) {
        console.error(`Bot ${bot.id} failed to answer:`, e.message);
      }
    }, getRandomInt(50, 900));
  });

  return res.json({ ok: true });
});

// ---------- Bot creation and event wiring ----------

function createBot(id) {
  const name = state.config.useRandomNames
    ? randName()
    : `${state.config.baseBotName}${id}`;

  const client = new Kahoot();
  client.setMaxListeners(Number.POSITIVE_INFINITY);

  const bot = {
    id,
    name,
    client,
    joined: false,
    connected: true,
  };

  state.bots.push(bot);

  client
    .join(state.config.pin, name, [random.first(), random.last()])
    .catch((err) => {
      console.log(
        `Client ${id} failed to join with error '${err?.description || err}'`
      );
      bot.connected = false;

      // Simple retry logic for random names
      if (err && err.description === "Duplicate name" && state.config.useRandomNames) {
        console.log(`Client ${id}: duplicate name, retrying...`);
        createBot(id);
      }
    });

  client.on("Joined", (info) => {
    bot.joined = true;
    console.log(`Client ${id} (${name}) joined. twoFactorAuth=${info.twoFactorAuth}`);

    // When all bots joined, we stay in JOINING phase, waiting for first question
    const joined = state.bots.filter((b) => b.joined).length;
    if (joined === state.config.botsCount) {
      console.log("All bots joined. Waiting for first question...");
    }
  });

  // 2FA brute force (unchanged conceptually, optional)
  let twoFactorList = [0, 1, 2, 3];
  let twoFactorAnswer = null;
  let twoFactorInterval = null;

  client.on("Joined", (info) => {
    if (info.twoFactorAuth) {
      twoFactorInterval = setInterval(() => {
        if (twoFactorAnswer) {
          client.answerTwoFactorAuth(twoFactorAnswer);
        } else {
          shuffle(twoFactorList);
          client.answerTwoFactorAuth(twoFactorList);
        }
      }, 1000);
    }
  });

  client.on("TwoFactorCorrect", () => {
    console.log(`${name} got 2FA correct!`);
    twoFactorAnswer = [...twoFactorList];
  });

  client.on("QuestionReady", (question) => {
    // Only leader bot updates global question state
    if (bot.id !== state.leaderId) return;
    if (question.type !== "quiz") return;

    state.phase = "QUESTION";
    state.currentQuestion = {
      numberOfChoices: question.numberOfChoices,
      answered: false,
    };

    console.log(
      `New question ready with ${question.numberOfChoices} choices. Waiting for web UI answer.`
    );
  });

  client.on("QuestionEnd", (data) => {
    if (bot.id !== state.leaderId) return;

    if (data.isCorrect) {
      console.log(`Leader bot got it correct.`);
    } else {
      console.log(`Leader bot got it wrong.`);
    }

    // Clear currentQuestion; next QuestionReady will set a new one
    state.currentQuestion = null;
    state.phase = "JOINING";
  });

  client.on("QuizEnd", (data) => {
    if (bot.id !== state.leaderId) return;

    console.log(`Quiz ended. Leader rank: ${data.rank}`);
    state.phase = "FINISHED";
    state.currentQuestion = null;
  });

  client.on("Disconnect", (reason) => {
    console.log(`Client ${id} (${name}) disconnected: ${reason}`);
    bot.connected = false;
    if (twoFactorInterval) clearInterval(twoFactorInterval);
    // You can choose to auto-rejoin here if you want
  });
}

// Shuffle helper for 2FA
function shuffle(array) {
  let currentIndex = array.length;

  while (currentIndex !== 0) {
    const randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex -= 1;

    const tmp = array[currentIndex];
    array[currentIndex] = array[randomIndex];
    array[randomIndex] = tmp;
  }

  return array;
}

// ---------- Start server ----------

app.listen(PORT, () => {
  console.log(`Web control app running at http://localhost:${PORT}`);
});