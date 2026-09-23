export class Soundscape {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  volume = 0.72;

  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === "suspended") void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = this.volume;
    master.connect(ctx.destination);

    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    const hum = ctx.createOscillator();
    hum.type = "sine";
    hum.frequency.value = 78;
    hum.connect(humGain);
    humGain.connect(master);
    hum.start();

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.ctx = ctx;
    this.master = master;
    this.humGain = humGain;
    this.noise = noise;
    if (ctx.state === "suspended") void ctx.resume();
  }

  setVolume(volume: number): void {
    this.volume = volume;
    if (this.master) this.master.gain.value = volume;
  }

  /** Field intensity, roughly 0–200, drives a quiet body tone. */
  hum(amount: number): void {
    if (!this.ctx || !this.humGain) return;
    const gain = Math.min(0.045, Math.max(0, amount) / 900) * Math.max(0.2, this.volume);
    this.humGain.gain.setTargetAtTime(gain, this.ctx.currentTime, 0.08);
  }

  switched(polarity: -1 | 1): void {
    const high = polarity === 1;
    this.tone(high ? 740 : 390, 0.055, "square", 0.045);
    this.tone(high ? 1110 : 250, 0.09, "sine", 0.04, high ? 180 : -80);
  }

  bounced(speed: number): void {
    this.knock(180 + Math.min(900, speed * 70), Math.min(0.12, 0.04 + speed * 0.008), Math.min(0.16, speed / 40));
  }

  entered(attract: boolean): void {
    this.tone(attract ? 320 : 210, 0.12, "sine", 0.03, attract ? 140 : -90);
  }

  collected(): void {
    this.tone(660, 0.08, "sine", 0.05);
    this.tone(880, 0.12, "sine", 0.035);
  }

  won(): void {
    this.tone(523, 0.18, "sine", 0.06);
    this.tone(659, 0.22, "sine", 0.045);
    this.tone(784, 0.32, "triangle", 0.04);
  }

  lost(): void {
    this.knock(90, 0.18, 0.12);
    this.tone(140, 0.2, "sine", 0.04, -40);
  }

  rejected(): void {
    this.tone(180, 0.1, "triangle", 0.05, -30);
  }

  chained(n: number): void {
    this.tone(420 + n * 40, 0.08, "sine", 0.03);
  }

  chimed(): void {
    this.tone(880, 0.1, "sine", 0.04);
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0): void {
    if (!this.ctx || !this.master || this.volume <= 0.01) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.linearRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(amp);
    amp.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private knock(freq: number, dur: number, gain: number): void {
    if (!this.ctx || !this.master || !this.noise || this.volume <= 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    filter.Q.value = 0.7;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(amp);
    amp.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }
}

export function haptic(pattern: number | number[], enabled: boolean): void {
  if (!enabled || typeof navigator === "undefined" || !navigator.vibrate) return;
  navigator.vibrate(pattern);
}
