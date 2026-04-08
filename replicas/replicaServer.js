const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

// ===== CONFIG =====
const PORT = process.env.PORT;
const ID = process.env.ID;
const peers = process.env.PEERS.split(",");

axios.defaults.timeout = 500;

// ===== RAFT STATE =====
let state = "follower";
let currentTerm = 0;
let votedFor = null;
let leaderId = null;
let lastHeartbeat = Date.now();

// ===== TIMEOUT (8–12 sec) =====
function randomTimeout() {
  return 8000 + Math.random() * 4000;
}

// ===== START SERVER =====
app.listen(PORT, () => {
  console.log(`Replica ${ID} started on port ${PORT}`);
  console.log(`🚀 Replica ${ID} running on port ${PORT}`);
});


// =======================
// HEARTBEAT (LEADER → FOLLOWERS)
// =======================
app.post("/heartbeat", (req, res) => {
  const { term, leaderId: lId } = req.body;

  if (term >= currentTerm) {
    currentTerm = term;
    leaderId = lId;

    if (state !== "follower") {
      console.log(`${ID} stepping down to follower`);
    }

    state = "follower";
    votedFor = null;

    // ⭐ MOST IMPORTANT
    lastHeartbeat = Date.now();

    // DEBUG LOG (you can remove later)
    console.log(`${ID} ❤️ heartbeat from ${lId} (term ${term})`);
  }

  res.sendStatus(200);
});


// =======================
// REQUEST VOTE
// =======================
app.post("/request-vote", (req, res) => {
  const { term, candidateId } = req.body;

  if (term > currentTerm) {
    currentTerm = term;
    state = "follower";
    votedFor = null;
  }

  if ((votedFor === null || votedFor === candidateId) && term >= currentTerm) {
    votedFor = candidateId;
    lastHeartbeat = Date.now();
    return res.json({ voteGranted: true });
  }

  res.json({ voteGranted: false });
});


// =======================
// START ELECTION
// =======================
async function startElection() {
  if (state === "leader") return;

  state = "candidate";
  currentTerm++;
  votedFor = ID;
  lastHeartbeat = Date.now();

  console.log(`${ID} starting election for term ${currentTerm}`);

  let votes = 1;

  for (let peer of peers) {
    try {
      const res = await axios.post(`${peer}/request-vote`, {
        term: currentTerm,
        candidateId: ID,
      });

      if (res.data.voteGranted) votes++;
    } catch (e) {}
  }

  const majority = Math.floor((peers.length + 1) / 2) + 1;

  if (votes >= majority && state === "candidate") {
    state = "leader";
    leaderId = ID;
    console.log(`🔥 ${ID} became LEADER (term ${currentTerm})`);
  } else {
    state = "follower";
  }
}


// =======================
// HEARTBEAT SENDER
// =======================
setInterval(() => {
  if (state === "leader") {
    for (let peer of peers) {
      axios.post(`${peer}/heartbeat`, {
        term: currentTerm,
        leaderId: ID,
      }).catch(() => {});
    }
  }
}, 3000); // slower = stable


// =======================
// ELECTION LOOP
// =======================
setTimeout(() => {
  setInterval(() => {
    const timeSinceLast = Date.now() - lastHeartbeat;

    if (
      (state === "follower" || state === "candidate") &&
      timeSinceLast > randomTimeout()
    ) {
      startElection();
    }
  }, 1000);
}, 5000); // startup delay


// =======================
// STATUS API
// =======================
app.get("/status", (req, res) => {
  res.json({
    id: ID,
    state,
    term: currentTerm,
    leader: leaderId,
  });
});
