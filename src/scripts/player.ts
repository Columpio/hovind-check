import { fromPlatform, toPlatform, type OffsetStep } from '../lib/time';

export type PlatformName = 'youtube' | 'rutube';

/** Событие «время лекции»: число секунд или null, если время неизвестно (видео не играет). */
export type TimeEvent = CustomEvent<number | null>;

interface Engine {
  /** Перемотать; play — ещё и включить. */
  seek(t: number, play: boolean): void;
  current(): number | null;
  destroy(): void;
}

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getPlayerState(): number;
  getCurrentTime(): number;
  destroy(): void;
}
interface YTNamespace {
  Player: new (el: HTMLElement, options: object) => YTPlayer;
  PlayerState: { PLAYING: number };
}
declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

const YT_TIMEOUT_MS = 10000;
const TICK_MS = 500;

let ytApi: Promise<YTNamespace> | null = null;
function loadYouTubeApi(): Promise<YTNamespace> {
  ytApi ??= new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const timer = setTimeout(() => reject(new Error('timeout')), YT_TIMEOUT_MS);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timer);
      resolve(window.YT!);
    };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => {
      clearTimeout(timer);
      reject(new Error('load'));
    };
    document.head.appendChild(s);
  });
  return ytApi;
}

/**
 * Плеер лекции: прячет различия YouTube и RuTube и пересчитывает время площадки во время лекции.
 * Сообщает текущее время событием «time».
 */
export class LecturePlayer extends EventTarget {
  platform: PlatformName;
  private engine: Engine | null = null;
  /** Последнее известное время лекции: нужно, чтобы смена площадки продолжала с того же места. */
  private lastTime = 0;
  private readonly frame: HTMLElement;
  private readonly ids: Record<PlatformName, string>;
  private readonly steps: Record<PlatformName, OffsetStep[]>;
  private readonly buttons: HTMLButtonElement[];

  constructor(private readonly root: HTMLElement) {
    super();
    this.frame = root.querySelector('.player-frame')!;
    this.ids = { youtube: root.dataset.ytId ?? '', rutube: root.dataset.rtId ?? '' };
    this.steps = {
      youtube: JSON.parse(root.dataset.ytOffsets || '[]'),
      rutube: JSON.parse(root.dataset.rtOffsets || '[]'),
    };
    this.buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-platform]'));
    const saved = localStorage.getItem('hc-platform');
    this.platform =
      (saved === 'youtube' || saved === 'rutube') && this.available(saved)
        ? saved
        : this.available('youtube') ? 'youtube' : 'rutube';
    for (const b of this.buttons) {
      b.addEventListener('click', () => {
        const p = b.dataset.platform as PlatformName;
        if (p !== this.platform && this.available(p)) this.start(p, this.position(), true);
      });
    }
  }

  available(p: PlatformName): boolean {
    return Boolean(this.ids[p]);
  }

  /** Текущее время лекции, если видео его сообщает. */
  current(): number | null {
    const t = this.engine?.current();
    return t == null || Number.isNaN(t) ? null : fromPlatform(this.steps[this.platform], t, this.lastTime);
  }

  position(): number {
    return this.current() ?? this.lastTime;
  }

  start(p: PlatformName, lectureTime: number, autoplay: boolean): void {
    this.engine?.destroy();
    this.platform = p;
    this.lastTime = lectureTime;
    localStorage.setItem('hc-platform', p);
    for (const b of this.buttons) b.setAttribute('aria-pressed', String(b.dataset.platform === p));
    this.emitTime(null);
    const at = toPlatform(this.steps[p], lectureTime);
    this.engine = p === 'youtube' ? this.youtube(at, autoplay) : this.rutube(at, autoplay);
  }

  /** Перейти к моменту лекции и запустить видео (только по нажатию на тайм-код). */
  seek(lectureTime: number): void {
    this.lastTime = lectureTime;
    if (!this.engine) return this.start(this.platform, lectureTime, true);
    this.engine.seek(toPlatform(this.steps[this.platform], lectureTime), true);
  }

  /** Перемотать без запуска: ссылка #t=… и цепочка не должны включать звук. */
  cue(lectureTime: number): void {
    this.lastTime = lectureTime;
    if (!this.engine) return this.start(this.platform, lectureTime, false);
    this.engine.seek(toPlatform(this.steps[this.platform], lectureTime), false);
  }

  private emitTime(platformTime: number | null): void {
    const t = platformTime == null ? null : fromPlatform(this.steps[this.platform], platformTime, this.lastTime);
    if (t != null) this.lastTime = t;
    this.dispatchEvent(new CustomEvent('time', { detail: t }));
  }

  private freshSlot(): HTMLElement {
    this.frame.querySelector('.player-msg')?.remove();
    this.frame.querySelector('iframe, .player-slot')?.remove();
    const slot = document.createElement('div');
    slot.className = 'player-slot';
    this.frame.prepend(slot);
    return slot;
  }

  /** Видео не загрузилось: объясняем и предлагаем другую площадку. */
  private showFailure(p: PlatformName): void {
    const other: PlatformName = p === 'youtube' ? 'rutube' : 'youtube';
    const name = p === 'youtube' ? 'YouTube' : 'RuTube';
    const otherName = other === 'youtube' ? 'YouTube' : 'RuTube';
    const url = p === 'youtube' ? `https://www.youtube.com/watch?v=${this.ids.youtube}` : `https://rutube.ru/video/${this.ids.rutube}/`;
    const msg = document.createElement('div');
    msg.className = 'player-msg';
    msg.setAttribute('role', 'alert');
    msg.innerHTML = `<p>Видео с ${name} не загрузилось. Возможно, ${name} у вас работает медленно или недоступен.</p>`;
    if (this.available(other)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn';
      b.textContent = `Смотреть на ${otherName}`;
      b.addEventListener('click', () => this.start(other, this.lastTime, true));
      msg.append(b);
    }
    const p2 = document.createElement('p');
    p2.innerHTML = `<a href="${url}" target="_blank" rel="noopener">Открыть видео на ${name}</a>`;
    msg.append(p2);
    this.frame.append(msg);
  }

  private youtube(start: number, autoplay: boolean): Engine {
    const slot = this.freshSlot();
    let player: YTPlayer | null = null;
    let ready = false;
    let queued: { t: number; play: boolean } | null = null;
    let ticker = 0;
    let destroyed = false;
    const stopTicker = () => {
      clearInterval(ticker);
      ticker = 0;
    };
    loadYouTubeApi().then(
      (YT) => {
        if (destroyed) return;
        player = new YT.Player(slot, {
          videoId: this.ids.youtube,
          playerVars: { start: Math.floor(start), autoplay: autoplay ? 1 : 0, rel: 0, playsinline: 1 },
          events: {
            onReady: () => {
              ready = true;
              if (queued !== null) {
                player!.seekTo(queued.t, true);
                if (queued.play) player!.playVideo();
                else player!.pauseVideo();
                queued = null;
              }
            },
            onStateChange: (e: { data: number }) => {
              // У YouTube нет события «время изменилось»: спрашиваем, только пока видео играет.
              stopTicker();
              if (e.data === YT.PlayerState.PLAYING) {
                ticker = window.setInterval(() => this.emitTime(player!.getCurrentTime()), TICK_MS);
                this.emitTime(player!.getCurrentTime());
              } else {
                this.emitTime(null);
              }
            },
            onError: () => this.showFailure('youtube'),
          },
        });
      },
      () => {
        if (!destroyed) this.showFailure('youtube');
      },
    );
    return {
      seek(t, play) {
        if (ready && player) {
          // seekTo у незапущенного видео сам включает его: ставим паузу, если играть не просили.
          const wasPlaying = player.getPlayerState() === 1;
          player.seekTo(t, true);
          if (play) player.playVideo();
          else if (!wasPlaying) player.pauseVideo();
        } else queued = { t, play };
      },
      current: () => (ready && player ? player.getCurrentTime() : null),
      destroy: () => {
        destroyed = true;
        stopTicker();
        player?.destroy();
      },
    };
  }

  private rutube(start: number, autoplay: boolean): Engine {
    const slot = this.freshSlot();
    const iframe = document.createElement('iframe');
    const params = new URLSearchParams({ t: String(Math.floor(start)) });
    if (autoplay) params.set('autoplay', 'true');
    iframe.src = `https://rutube.ru/play/embed/${this.ids.rutube}?${params}`;
    iframe.allow = 'clipboard-write; autoplay; fullscreen';
    iframe.allowFullscreen = true;
    iframe.title = 'Видео на RuTube';
    slot.replaceWith(iframe);
    let time: number | null = null;
    let ready = false;
    let playing = false;
    let queued: { t: number; play: boolean } | null = null;
    const send = (type: string, data: object = {}) => iframe.contentWindow?.postMessage(JSON.stringify({ type, data }), '*');
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow) return;
      let m: { type?: string; data?: { time?: number; state?: string } };
      try {
        m = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return; // чужие сообщения не в формате JSON
      }
      if (m?.type === 'player:ready' || m?.type === 'player:init') {
        ready = true;
        if (queued !== null) {
          send('player:setCurrentTime', { time: queued.t });
          if (queued.play) send('player:play');
          queued = null;
        }
      }
      if (m?.type === 'player:currentTime') {
        time = Number(m.data?.time);
        this.emitTime(time);
      }
      if (m?.type === 'player:changeState') {
        playing = m.data?.state === 'playing';
        if (!playing) {
          time = null;
          this.emitTime(null);
        }
      }
    };
    window.addEventListener('message', onMessage);
    return {
      seek(t, play) {
        if (ready) {
          send('player:setCurrentTime', { time: t });
          if (play) send('player:play');
          else if (!playing) send('player:pause');
        } else queued = { t, play };
      },
      current: () => time,
      destroy: () => window.removeEventListener('message', onMessage),
    };
  }
}
