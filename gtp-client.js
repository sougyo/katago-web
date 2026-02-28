const { spawn } = require('child_process');

/**
 * GTP (Go Text Protocol) client for KataGo.
 *
 * Commands are queued and executed serially (one at a time).
 * GTP responses are terminated by a blank line (\n\n).
 * Success: "=<id> result\n\n"
 * Failure: "?<id> message\n\n"
 */
class GTPClient {
  constructor(katagoPath, configPath, modelPath) {
    this.katagoPath = katagoPath;
    this.configPath = configPath;
    this.modelPath  = modelPath;
    this.proc    = null;
    this.cmdId   = 0;
    this.queue   = [];   // waiting commands: {id, cmd, resolve, reject}
    this.current = null; // command currently awaiting a response
    this.buffer  = '';
  }

  /** Spawn KataGo and wait for it to initialise (load model, etc.). */
  start() {
    return new Promise((resolve, reject) => {
      const args = ['gtp', '-config', this.configPath, '-model', this.modelPath];
      console.log(`[GTP] start: ${this.katagoPath} ${args.join(' ')}`);

      this.proc = spawn(this.katagoPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });

      this.proc.stdout.on('data', chunk => {
        this.buffer += chunk.toString();
        this._flush();
      });

      this.proc.stderr.on('data', chunk => {
        process.stderr.write(`[katago] ${chunk}`);
      });

      this.proc.on('error', err => {
        reject(err);
        this._rejectAll(err);
      });

      this.proc.on('close', code => {
        const err = new Error(`KataGo process exited (code ${code})`);
        this._rejectAll(err);
      });

      // Allow time for KataGo to load the neural network model.
      setTimeout(resolve, 2000);
    });
  }

  // ---- response parsing ----

  _flush() {
    let i;
    while ((i = this.buffer.indexOf('\n\n')) !== -1) {
      const block = this.buffer.slice(0, i).trim();
      this.buffer  = this.buffer.slice(i + 2);
      if (block) this._handleBlock(block);
    }
  }

  _handleBlock(block) {
    if (!this.current) {
      // Unsolicited output (e.g. startup messages) – ignore.
      return;
    }
    const { resolve, reject } = this.current;
    this.current = null;

    if (block[0] === '=') {
      resolve(block.replace(/^=\d*\s*/, '').trim());
    } else if (block[0] === '?') {
      reject(new Error(block.replace(/^\?\d*\s*/, '').trim() || 'GTP error'));
    } else {
      reject(new Error(`Unexpected GTP response: ${block}`));
    }
    this._processQueue();
  }

  _processQueue() {
    if (this.current || this.queue.length === 0) return;
    this.current = this.queue.shift();
    this.proc.stdin.write(`${this.current.id} ${this.current.cmd}\n`);
  }

  _rejectAll(err) {
    if (this.current) { this.current.reject(err); this.current = null; }
    for (const c of this.queue) c.reject(err);
    this.queue = [];
  }

  // ---- public API ----

  send(cmd) {
    return new Promise((resolve, reject) => {
      if (!this.proc) { reject(new Error('GTP process not started')); return; }
      const id = this.cmdId++;
      this.queue.push({ id, cmd, resolve, reject });
      this._processQueue();
    });
  }

  async initGame(size, handicap, komi) {
    await this.send(`boardsize ${size}`);
    await this.send('clear_board');
    if (handicap >= 2) {
      await this.send(`fixed_handicap ${handicap}`);
      await this.send(`komi ${komi ?? 0.5}`);
    } else {
      await this.send(`komi ${komi ?? 6.5}`);
    }
  }

  play(color, pos)   { return this.send(`play ${color} ${pos}`); }
  async genMove(color) {
    const r = await this.send(`genmove ${color}`);
    return r.trim(); // "pass", "resign", or "A1" etc.
  }
  showBoard()        { return this.send('showboard'); }

  async quit() {
    if (!this.proc) return;
    try {
      await Promise.race([this.send('quit'), new Promise(r => setTimeout(r, 800))]);
    } catch (_) {}
    this.proc.kill();
    this.proc = null;
  }
}

module.exports = GTPClient;
