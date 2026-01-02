// Designed to work in terminal mode


const readline = require("readline-sync");
const random = require("random-name");
const beep = require("beepbeep");
const Kahoot = require("kahoot.js-latest"); 

// ---------- Helpers ----------

function getRandomInt(min, max) {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randName() {
  // "John Doe" style name
  return `${random.first()} ${random.last()}`;
}

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

process.setMaxListeners(Number.POSITIVE_INFINITY);

// ---------- Config prompts ----------

const antibotModeInput = readline.question("Use the new antibot mode? (y/n)> ");
const antibotMode = antibotModeInput.toLowerCase() === "y";

if (antibotMode) {
  console.log("NOTE: 2-factor brute forcing does not work with antibot.");
}

const pin = readline.question("Enter Game PIN --> ");
const botsCount = Number(readline.question("Enter number of bots --> "));

// Name settings
let useRandomNames;
let baseBotName = "";
let botPrefix = "";

if (antibotMode) {
  // Always random names in antibot
  useRandomNames = true;
} else {
  const rannameInput = readline.question("Use random name? (y/n) --> ");
  useRandomNames = rannameInput.toLowerCase() === "y";

  if (!useRandomNames) {
    baseBotName = readline.question("Enter name --> ");
    botPrefix = "";
  }
}

// Manual control settings
const userControlledInput = readline.question(
  "Control the bots manually? (y/n) --> "
);
const userControlled = userControlledInput.toLowerCase() === "y";

let beepOnControl = false;
if (userControlled) {
  const beepisInput = readline.question(
    "Beep when the bots need controlling? (y/n) --> "
  );
  beepOnControl = beepisInput.toLowerCase() === "y";
}

console.clear();

// ---------- Global-ish coordination state ----------

// One bot is the "leader" for manual answering (others copy its answer)
const LEADER_ID = 0;

// Shared answer for the current question in manual mode
let sharedAnswerIndex = null; // 0-based index (0..3)

// ---------- Join logic ----------

function sendJoin(name, id) {
  let finalName = name;

  if (useRandomNames) {
    finalName = randName();
  }

  joinBot(finalName, id);
}

function scheduleJoins() {
  console.log(`Spawning ${botsCount} bots...`);

  for (let i = 0; i < botsCount; i++) {
    // Slight randomness in join delay to avoid spam patterns
    const rt = useRandomNames ? getRandomInt(90, 200) : 15;

    setTimeout(() => {
      const name = useRandomNames
        ? "Random name placeholder"
        : `${baseBotName}${i}`;
      sendJoin(name, i);
    }, rt * i); // stagger bots based on index
  }
}

// ---------- Bot client ----------

function joinBot(name, id) {
  if (!name) {
    name = randName();
  }

  const client = new Kahoot();
  client.setMaxListeners(Number.POSITIVE_INFINITY);

  client
    .join(pin, name, [random.first(), random.last()])
    .catch((err) => {
      if (err && err.description === "Duplicate name" && useRandomNames) {
        // Try again with a new random name
        console.log(`Client ${id}: duplicate name, retrying...`);
        sendJoin(null, id);
      } else {
        console.log(
          `Client ${id} failed to join with the error '${err?.description || err}'`
        );
        client.leave();
      }
    });

  let twoFactorList = [0, 1, 2, 3];
  let twoFactorAnswer = null;

  client.on("Joined", (info) => {
    console.log(`Client ${id} (${name}) joined.`);
    if (info.twoFactorAuth) {
      // Keep trying random 2FA patterns until one is correct
      const interval = setInterval(() => {
        if (twoFactorAnswer) {
          client.answerTwoFactorAuth(twoFactorAnswer);
        } else {
          shuffle(twoFactorList);
          client.answerTwoFactorAuth(twoFactorList);
        }
      }, 1000);

      client.on("Disconnect", () => clearInterval(interval));
    }
  });

  client.on("TwoFactorCorrect", () => {
    console.log(`${name} got 2FA correct!`);
    twoFactorAnswer = [...twoFactorList];
  });

  client.on("QuestionReady", (question) => {
    if (id === LEADER_ID && beepOnControl) {
      beep();
    }

    // Only quiz question types are answerable choices
    if (question.type !== "quiz") return;

    if (userControlled) {
      handleManualQuestion(client, id, name, question);
    } else {
      handleAutoQuestion(client, name, question);
    }
  });

  client.on("QuestionEnd", (data) => {
    sharedAnswerIndex = null; // reset for next question
    if (data.isCorrect) {
      console.log(`${name} got it correct!`);
    } else {
      console.log(`${name} got it wrong.`);
    }
  });

  client.on("QuizEnd", (data) => {
    console.log(`The quiz has ended and ${name} got rank ${data.rank}`);
  });

  client.on("Disconnect", (reason) => {
    console.log(`Client ${id} (${name}) disconnected: ${reason}`);
    if (reason !== "Quiz Locked") {
      // Rejoin if kicked/disconnected for other reasons
      sendJoin(null, id);
    }
  });

  process.on("SIGINT", () => {
    process.exit();
  });
}

// ---------- Question handling ----------

function handleAutoQuestion(client, name, question) {
  const toAnswer = getRandomInt(0, question.numberOfChoices - 1);
  setTimeout(() => {
    console.log(`${name} answered with a random answer (${toAnswer}).`);
    client.answer(toAnswer);
  }, getRandomInt(1, 1000));
}

function handleManualQuestion(client, id, question) {
  const numChoices = question.numberOfChoices;

  // Leader asks the user; others copy
  if (id === LEADER_ID) {
    if (beepOnControl) {
      beep();
    }

    const answerIndex = askUserForAnswer(numChoices); // 0-based
    sharedAnswerIndex = answerIndex;

    setTimeout(() => {
      client.answer(answerIndex);
    }, getRandomInt(1, 1000));
  } else {
    // Non-leader bots wait until sharedAnswerIndex is set
    const waitInterval = setInterval(() => {
      if (sharedAnswerIndex !== null) {
        clearInterval(waitInterval);
        setTimeout(() => {
          client.answer(sharedAnswerIndex);
        }, getRandomInt(1, 1000));
      }
    }, 100);
  }
}

function askUserForAnswer(numChoices) {
  let prompt = "";
  if (numChoices === 2) {
    prompt = "t for triangle, d for diamond > ";
  } else if (numChoices === 3) {
    prompt = "t for triangle, d for diamond, c for circle > ";
  } else {
    // assume 4 (triangle, diamond, circle, square)
    prompt =
      "t for triangle, d for diamond, c for circle, s for square > ";
  }

  let raw = readline.question(prompt).toLowerCase();

  // Map letters to 1-based indices THEN convert to 0-based
  raw = raw
    .replace("t", "1")
    .replace("d", "2")
    .replace("c", "3")
    .replace("s", "4");

  let idx = parseInt(raw, 10);
  if (Number.isNaN(idx) || idx < 1 || idx > numChoices) {
    idx = 1; // default to first choice if invalid
  }

  return idx - 1; // 0-based
}

// ---------- Start ----------

console.clear();
console.log("Joining bots...");
scheduleJoins();