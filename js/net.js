// Peer-to-peer versus networking over PeerJS (WebRTC).
// Host picks a room code and becomes peer "MZNG-<code>"; the guest connects to it.
// One data channel carries small JSON messages: hello / state / dead.
// `Peer` is loaded globally from the PeerJS CDN script in index.html.

const PREFIX = 'MZNG-'; // namespaces our ids on the public PeerJS broker

export class NetPeer {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    // callbacks (set by the game)
    this.onOpen = null;    // data channel ready
    this.onData = null;    // (msg) => {}
    this.onClose = null;   // peer/connection lost
    this.onError = null;   // (humanMessage) => {}
  }

  _bindConn(conn) {
    this.conn = conn;
    conn.on('open', () => this.onOpen && this.onOpen());
    conn.on('data', (d) => this.onData && this.onData(d));
    conn.on('close', () => this.onClose && this.onClose());
    conn.on('error', () => this.onClose && this.onClose());
  }

  host(code, onReady) {
    this.isHost = true;
    this.peer = new Peer(PREFIX + code);
    this.peer.on('open', () => onReady && onReady(code));
    this.peer.on('connection', (c) => this._bindConn(c));
    this.peer.on('error', (e) => this._err(e));
  }

  join(code) {
    this.isHost = false;
    this.peer = new Peer();
    this.peer.on('open', () => {
      const c = this.peer.connect(PREFIX + code, { reliable: true });
      this._bindConn(c);
    });
    this.peer.on('error', (e) => this._err(e));
  }

  _err(e) {
    let msg = 'Connection error';
    if (e && e.type === 'peer-unavailable') msg = 'Room not found — check the code';
    else if (e && e.type === 'unavailable-id') msg = 'That room code is taken — try again';
    else if (e && e.type === 'network') msg = 'Network blocked P2P — try another Wi-Fi/hotspot';
    if (this.onError) this.onError(msg);
  }

  send(obj) {
    if (this.conn && this.conn.open) {
      try { this.conn.send(obj); } catch (e) { /* ignore transient */ }
    }
  }

  close() {
    try { if (this.conn) this.conn.close(); } catch (e) {}
    try { if (this.peer) this.peer.destroy(); } catch (e) {}
    this.conn = null;
    this.peer = null;
  }
}

// 4-char code from unambiguous characters (no O/0/I/1 confusion).
export function makeRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
