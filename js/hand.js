// Hand steering via MediaPipe Hands.
// steering: -1 (full left) .. +1 (full right) — from the tilt of the hand, like holding a wheel.
// brake: true when the fist is closed.

export class HandControl {
  constructor() {
    this.steering = 0;
    this.brake = false;
    this.detected = false;
    this._rawSteer = 0;
    this._ready = false;
  }

  async init(videoEl, camCanvas, statusEl) {
    this.statusEl = statusEl;
    this.ctx = camCanvas.getContext('2d');
    this.camCanvas = camCanvas;

    const hands = new Hands({
      locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`
    });
    hands.setOptions({
      maxNumHands: 1,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    hands.onResults((res) => this._onResults(res));

    // Process every 2nd camera frame — halves the tracking CPU cost, and the
    // steering low-pass filter smooths over the tiny extra latency.
    let skip = false;
    const camera = new Camera(videoEl, {
      onFrame: async () => {
        skip = !skip;
        if (skip) return;
        await hands.send({ image: videoEl });
      },
      width: 320,
      height: 240
    });
    await camera.start();
    this._ready = true;
  }

  _onResults(res) {
    const ctx = this.ctx;
    const W = this.camCanvas.width, H = this.camCanvas.height;
    ctx.drawImage(res.image, 0, 0, W, H);

    const lm = res.multiHandLandmarks && res.multiHandLandmarks[0];
    if (!lm) {
      this.detected = false;
      this.statusEl.textContent = '✋ Show your hand';
      this.statusEl.style.color = '#ff9d9d';
      // decay steering toward center when the hand is lost
      this._rawSteer *= 0.9;
      this._smooth();
      return;
    }
    this.detected = true;

    // --- Steering: tilt of the wrist(0) -> middle-finger-base(9) axis.
    // Video is mirrored in CSS, so flip x to match what the player sees.
    const x0 = 1 - lm[0].x, y0 = lm[0].y;
    const x9 = 1 - lm[9].x, y9 = lm[9].y;
    const angle = Math.atan2(x9 - x0, y0 - y9); // 0 = hand upright
    this._rawSteer = Math.max(-1, Math.min(1, angle / (Math.PI / 4))); // ±45° = full lock

    // --- Fist: fingertips close to the palm center relative to hand size.
    const palmX = (lm[0].x + lm[5].x + lm[17].x) / 3;
    const palmY = (lm[0].y + lm[5].y + lm[17].y) / 3;
    const handSize = Math.hypot(lm[9].x - lm[0].x, lm[9].y - lm[0].y);
    let closed = 0;
    for (const tip of [8, 12, 16, 20]) {
      const d = Math.hypot(lm[tip].x - palmX, lm[tip].y - palmY);
      if (d < handSize * 0.85) closed++;
    }
    this.brake = closed >= 3;

    this._smooth();
    this.statusEl.textContent = this.brake ? '✊ BRAKE' : '🖐 GAS — tilt to steer';
    this.statusEl.style.color = this.brake ? '#ffd10a' : '#7dffa8';

    // Draw landmarks
    ctx.strokeStyle = this.brake ? '#ffd10a' : '#2dff6e';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 2;
    const CONN = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
                  [9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
    for (const [a, b] of CONN) {
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(p.x * W, p.y * H, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _smooth() {
    // Low-pass filter so the car doesn't jitter with the hand.
    this.steering += (this._rawSteer - this.steering) * 0.35;
    if (Math.abs(this.steering) < 0.04) this.steering = 0;
  }
}
