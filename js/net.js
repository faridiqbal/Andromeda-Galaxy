/* Online multiplayer over WebRTC (PeerJS). No server code of our own: PeerJS's free public
   broker only introduces the devices, then they talk directly.

   Model: the host's device relays commands. Every device runs the full game itself from the
   same random seed, so only player inputs travel over the network:
     start  { game, seed, roster }        host -> all   (begin / restart a mission)
     roll   { game, seq, seat, power }    host -> all   (the seq-th dice throw of this game)
     decide { game, seq, choice }         host -> all   ("continue" or "end" after a finish)
   Clients ask the host with rollreq; the host accepts the first request for each seq.

   For testing in one browser, open the page with ?net=local: tabs then talk over
   BroadcastChannel instead of WebRTC. */
const Net = (() => {
  const ALPHA = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const MAX_PLAYERS = 5;
  const useLocal = new URLSearchParams(location.search).get("net") === "local";

  let mode = "off";              // off | host | client
  let peer = null, hostConn = null;
  let code = "", myId = "";
  let lobby = [];                // host: [{ id, name, avatar, online }]
  let started = false;
  let gameId = 0, rollIssued = 0, decideIssued = 0;
  const conns = new Map();       // host: peer id -> connection
  const handlers = {};
  const inbox = [], waiters = [];

  const on = (t, f) => (handlers[t] ||= []).push(f);
  const emit = (t, d) => (handlers[t] || []).forEach(f => f(d));
  const genCode = () => Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join("");

  // ---------- command inbox: game code awaits the next matching command ----------
  function deliver(msg) {
    const i = waiters.findIndex(w => w.match(msg));
    if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
    else inbox.push(msg);
  }
  function next(match) {
    const i = inbox.findIndex(match);
    if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
    return new Promise(resolve => waiters.push({ match, resolve }));
  }

  // ---------- transport ----------
  function makePeer(id) {
    if (useLocal) return new LocalPeer(id);
    if (typeof Peer !== "function") throw new Error("Online play needs the PeerJS library");
    return id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
  }

  function friendlyError(err) {
    const t = err && err.type;
    if (t === "peer-unavailable") return "Room not found. Check the code and try again.";
    if (t === "network" || t === "server-error" || t === "socket-error" || t === "socket-closed")
      return "Can't reach the matchmaking server. Check your internet connection.";
    if (t === "browser-incompatible") return "This browser doesn't support online play.";
    return (err && err.message) || "Connection problem.";
  }

  function lobbyView() {
    return lobby.map((l, i) => ({ name: l.name, avatar: l.avatar, online: l.online, host: i === 0, you: l.id === myId }));
  }
  function sendAll(msg) { for (const c of conns.values()) { try { c.send(msg); } catch { /* closed */ } } }
  function broadcastLobby() { const view = lobby.map(l => ({ ...l })); sendAll({ t: "lobby", lobby: view }); emit("lobby", lobbyView()); }

  // ---------- host ----------
  function host(profile, attempt = 0) {
    leave(true);
    mode = "host";
    code = genCode();
    peer = makePeer("aq-" + code);
    peer.on("open", id => {
      myId = id;
      lobby = [{ id, name: profile.name, avatar: profile.avatar, online: true }];
      started = false;
      emit("room", { code, host: true });
      broadcastLobby();
    });
    peer.on("connection", conn => {
      conn.on("data", m => hostRecv(conn, m));
      conn.on("close", () => hostDrop(conn.peer));
      conn.on("error", () => hostDrop(conn.peer));
    });
    peer.on("error", err => {
      if (err && err.type === "unavailable-id" && attempt < 4) return host(profile, attempt + 1);
      if (err && err.type === "peer-unavailable") return; // a guest vanished mid-handshake: ignore
      const msg = friendlyError(err);
      leave(true);
      emit("error", msg);
    });
  }

  function hostRecv(conn, m) {
    if (!m || typeof m !== "object") return;
    if (m.t === "hello") {
      if (started) return conn.send({ t: "refused", reason: "That mission has already launched." });
      if (lobby.length >= MAX_PLAYERS) return conn.send({ t: "refused", reason: "That room is full (5 commanders)." });
      const taken = new Set(lobby.map(l => l.avatar));
      let avatar = Number.isInteger(m.avatar) && m.avatar >= 0 && m.avatar < 10 ? m.avatar : 0;
      if (taken.has(avatar)) avatar = [...Array(10).keys()].find(k => !taken.has(k));
      const name = String(m.name || "").slice(0, 16).trim() || `Commander ${lobby.length + 1}`;
      lobby.push({ id: conn.peer, name, avatar, online: true });
      conns.set(conn.peer, conn);
      broadcastLobby();
    } else if (m.t === "rollreq") {
      if (m.game === gameId && m.seq === rollIssued) issueRoll(m.seat, m.power);
    } else if (m.t === "leave") {
      hostDrop(conn.peer);
    }
  }

  function hostDrop(id) {
    if (!conns.has(id)) return;
    conns.delete(id);
    const i = lobby.findIndex(l => l.id === id);
    if (i < 0) return;
    if (!started) { lobby.splice(i, 1); broadcastLobby(); return; }
    lobby[i].online = false;
    sendAll({ t: "left", seat: i });
    emit("left", i);
  }

  /** Host: launch (or relaunch) the mission for everyone in the room. */
  function startGame() {
    if (mode !== "host") return;
    lobby = lobby.filter(l => l.online);
    started = true;
    gameId = (Math.random() * 2 ** 31) >>> 0;
    rollIssued = 0; decideIssued = 0;
    inbox.length = 0;
    const msg = { t: "start", game: gameId, seed: Rng.newSeed(), roster: lobby.map(l => ({ name: l.name, avatar: l.avatar, id: l.id })) };
    sendAll(msg);
    emit("start", { ...msg, mySeat: 0 });
  }

  function issueRoll(seat, power) {
    const msg = { t: "roll", game: gameId, seq: rollIssued++, seat, power: Math.max(0, Math.min(1, +power || 0.5)) };
    sendAll(msg);
    deliver(msg);
  }

  // ---------- client ----------
  function join(roomCode, profile) {
    leave(true);
    mode = "client";
    code = String(roomCode || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    peer = makePeer();
    peer.on("open", id => {
      myId = id;
      hostConn = peer.connect("aq-" + code, { reliable: true });
      hostConn.on("open", () => {
        hostConn.send({ t: "hello", name: profile.name, avatar: profile.avatar });
        emit("room", { code, host: false });
      });
      hostConn.on("data", clientRecv);
      hostConn.on("close", () => { if (mode === "client") { emit("closed", "The host left the mission."); leave(true); } });
      hostConn.on("error", () => emit("error", "Lost connection to the host."));
    });
    peer.on("error", err => {
      const msg = friendlyError(err);
      leave(true);
      emit("error", msg);
    });
  }

  function clientRecv(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "lobby":
        lobby = m.lobby;
        emit("lobby", lobbyView());
        break;
      case "refused":
        emit("error", m.reason);
        leave(true);
        break;
      case "start":
        gameId = m.game;
        inbox.length = 0;
        emit("start", { ...m, mySeat: m.roster.findIndex(r => r.id === myId) });
        break;
      case "roll":
      case "decide":
        deliver(m);
        break;
      case "left":
        emit("left", m.seat);
        break;
      case "closed":
        emit("closed", "The host ended the mission.");
        leave(true);
        break;
    }
  }

  // ---------- inputs from the game ----------
  /** Ask for the seq-th throw of this game to be made by `seat` with `power`. */
  function requestRoll(seq, seat, power) {
    if (mode === "host") { if (seq === rollIssued) issueRoll(seat, power); }
    else if (mode === "client" && hostConn) hostConn.send({ t: "rollreq", game: gameId, seq, seat, power });
  }
  /** Host only: decide whether the race continues after someone finishes. */
  function decide(seq, choice) {
    if (mode !== "host" || seq !== decideIssued) return;
    const msg = { t: "decide", game: gameId, seq: decideIssued++, choice };
    sendAll(msg);
    deliver(msg);
  }
  const nextRoll = seq => next(m => m.t === "roll" && m.game === gameId && m.seq === seq);
  const nextDecision = seq => next(m => m.t === "decide" && m.game === gameId && m.seq === seq);

  function leave(silent = false) {
    if (mode === "host") sendAll({ t: "closed" });
    if (mode === "client" && hostConn) { try { hostConn.send({ t: "leave" }); } catch { /* closed */ } }
    const was = mode;
    mode = "off";
    started = false;
    try { peer && peer.destroy(); } catch { /* already gone */ }
    peer = null; hostConn = null;
    conns.clear();
    lobby = [];
    inbox.length = 0;
    waiters.length = 0;
    if (!silent && was !== "off") emit("closed", null);
  }

  // closing the tab or app: tell the others right away instead of waiting for a timeout
  window.addEventListener("pagehide", () => { if (mode !== "off") leave(true); });

  // ---------- same-browser transport for testing (?net=local) ----------
  class LocalPeer {
    constructor(id) {
      this.id = id || "p" + Math.random().toString(36).slice(2, 10);
      this.h = {}; this.conns = {};
      this.ch = new BroadcastChannel("aq-local-net");
      this.ch.onmessage = e => this._msg(e.data);
      setTimeout(() => this._emit("open", this.id), 30);
    }
    on(t, f) { (this.h[t] ||= []).push(f); }
    _emit(t, ...a) { (this.h[t] || []).forEach(f => f(...a)); }
    connect(to) {
      const c = new LocalConn(this, to, Math.random().toString(36).slice(2));
      this.conns[c.cid] = c;
      this.ch.postMessage({ k: "connect", from: this.id, to, cid: c.cid });
      c._timer = setTimeout(() => { if (!c.ready) this._emit("error", { type: "peer-unavailable" }); }, 1500);
      return c;
    }
    _msg(m) {
      if (m.to !== this.id) return;
      const c = this.conns[m.cid];
      if (m.k === "connect") {
        const nc = new LocalConn(this, m.from, m.cid);
        nc.ready = true;
        this.conns[m.cid] = nc;
        this._emit("connection", nc);
        this.ch.postMessage({ k: "accept", from: this.id, to: m.from, cid: m.cid });
        setTimeout(() => nc._emit("open"), 0);
      } else if (m.k === "accept" && c) { c.ready = true; clearTimeout(c._timer); c._emit("open"); }
      else if (m.k === "data" && c) c._emit("data", m.d);
      else if (m.k === "close" && c) { delete this.conns[m.cid]; c.open = false; c._emit("close"); }
    }
    destroy() { Object.values(this.conns).forEach(c => c.close()); setTimeout(() => this.ch.close(), 50); }
  }
  class LocalConn {
    constructor(p, peerId, cid) { this.p = p; this.peer = peerId; this.cid = cid; this.h = {}; this.open = true; }
    on(t, f) { (this.h[t] ||= []).push(f); }
    _emit(t, ...a) { (this.h[t] || []).forEach(f => f(...a)); }
    send(d) { if (this.open) this.p.ch.postMessage({ k: "data", from: this.p.id, to: this.peer, cid: this.cid, d: JSON.parse(JSON.stringify(d)) }); }
    close() {
      if (!this.open) return;
      this.open = false;
      this.p.ch.postMessage({ k: "close", from: this.p.id, to: this.peer, cid: this.cid });
      delete this.p.conns[this.cid];
      this._emit("close");
    }
  }

  return {
    on, host, join, leave, startGame, requestRoll, decide, nextRoll, nextDecision,
    get mode() { return mode; },
    get online() { return mode !== "off"; },
    get isHost() { return mode === "host"; },
    get code() { return code; },
    get started() { return started; },
    get lobby() { return lobbyView(); },
    get rollIssued() { return rollIssued; },
    seatOnline(seat) { return mode === "host" ? !!(lobby[seat] && lobby[seat].online) : true; },
  };
})();
