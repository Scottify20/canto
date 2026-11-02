import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, output, signal, viewChild, ElementRef } from '@angular/core';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { API_BASE, ApiService, PIN_KEY, errorMessage, isNativeAndroid } from '../../core/api.service';
import { RemoteInfo } from '../../core/models';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/icon';
import { Modal } from '../../shared/modal';

const SERVER_KEY = 'canto.serverUrl';

/** Share this computer's backend address as a QR code, or (in the Android app) scan one to connect. */
@Component({
  selector: 'app-remote-modal',
  imports: [Modal, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal title="Remote control" icon="phone" widthClass="max-w-xl" (closed)="closed.emit()">
      <div class="flex flex-col gap-4">
        @if (android) {
          <div role="tablist" class="tabs tabs-box tabs-sm self-start">
            <button role="tab" class="tab gap-2" [class.tab-active]="tab() === 'scan'" (click)="setTab('scan')"><app-icon name="scan-qr" [size]="14" /> Scan QR</button>
            <button role="tab" class="tab gap-2" [class.tab-active]="tab() === 'share'" (click)="setTab('share')"><app-icon name="qr" [size]="14" /> Share</button>
          </div>
        }

        @if (tab() === 'share') {
          <p class="text-sm opacity-80">
            Scan this code with the Canto app on your phone to control this library remotely. Both devices must be on the same Wi-Fi network.
          </p>
          @if (info(); as i) {
            <label class="flex items-center gap-3 rounded-lg bg-base-content/5 p-3 cursor-pointer">
              <input type="checkbox" class="toggle toggle-primary" [checked]="i.sharing" [disabled]="toggling()" (change)="setSharing($any($event.target).checked)" />
              <span class="grow">
                <span class="font-semibold block">Share with other devices</span>
                <span class="text-xs opacity-70">Opens port {{ i.port }} on your network until you switch it off or close Canto. The app on this computer keeps working either way.</span>
              </span>
              @if (toggling()) { <span class="loading loading-spinner loading-sm"></span> }
            </label>
            <label class="flex items-center gap-3 rounded-lg bg-base-content/5 p-3 cursor-pointer">
              <input type="checkbox" class="toggle toggle-primary" [checked]="i.auto_start" (change)="setAutoStart($any($event.target).checked)" />
              <span class="grow">
                <span class="font-semibold block">Start sharing when Canto launches</span>
                <span class="text-xs opacity-70">Opens port {{ i.port }} automatically each time the desktop app starts.</span>
              </span>
            </label>
            @if (i.sharing && i.addresses.length) {
              <div class="flex flex-col items-center gap-3">
                @if (i.pin) {
                  <div class="text-center">
                    <div class="text-xs opacity-70">PIN (already inside the QR code)</div>
                    <div class="font-mono text-3xl font-bold tracking-[0.3em] tabular-nums" aria-label="Sharing PIN">{{ i.pin }}</div>
                  </div>
                }
                @if (qr()) { <img [src]="qr()" alt="QR code with the server address" class="rounded-xl bg-white p-2 w-60 h-60 shadow" /> }
                @if (i.addresses.length > 1) {
                  <select class="select select-sm select-bordered" aria-label="Network address" (change)="choose($any($event.target).value)">
                    @for (a of i.addresses; track a.ip) { <option [value]="a.url" [selected]="a.url === url()">{{ a.url }}</option> }
                  </select>
                } @else {
                  <span class="font-mono text-sm">{{ url() }}</span>
                }
                <button class="btn btn-sm btn-ghost" (click)="copy()"><app-icon name="copy" /> Copy address</button>
              </div>
              <p class="text-xs opacity-60">Several addresses? Pick the one on your Wi-Fi (usually <code>192.168.…</code>). Devices need the PIN, which changes every time sharing is switched on, but traffic is not encrypted, so share only on a network you trust. Inside WSL or a VM, use the host machine's address and forward port {{ i.port }}.</p>
            } @else if (i.sharing) {
              <div class="alert alert-error alert-soft text-sm"><app-icon name="no" /> No network address found. Connect to Wi-Fi or a LAN first.</div>
            }
          } @else if (error()) {
            <div class="alert alert-error alert-soft text-sm"><app-icon name="no" /> {{ error() }}</div>
          } @else {
            <div class="p-8 text-center"><span class="loading loading-spinner"></span></div>
          }
        } @else {
          <p class="text-sm opacity-80">
            On your computer open <b>Settings → Remote control</b> and point the camera at the QR code. Canto remembers the address.
          </p>
          <div class="relative rounded-xl overflow-hidden bg-black aspect-square max-w-sm w-full mx-auto">
            <video #video class="w-full h-full object-cover" playsinline muted></video>
            <div class="absolute inset-6 border-2 border-primary/80 rounded-2xl pointer-events-none"></div>
            @if (scanBlocked()) {
              <div class="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white bg-black/80">
                <div class="flex flex-col items-center gap-3">
                  <app-icon name="no" [size]="28" class="text-error" />
                  <div>Couldn't connect after {{ MAX_SCAN_FAILS }} attempts. Check that Sharing is on and the QR code is the current one.</div>
                  <button class="btn btn-sm btn-primary" (click)="resumeScan()">Scan again</button>
                </div>
              </div>
            }
            @if (cameraError()) {
              <div class="absolute inset-0 grid place-items-center p-4 text-center text-sm text-white bg-black/70">{{ cameraError() }}</div>
            }
          </div>
          <div class="divider my-0 text-xs">or type it</div>
          <form class="join w-full" (submit)="$event.preventDefault(); connect(manual.value, pinInput.value)">
            <input #manual class="input input-sm input-bordered join-item w-full font-mono" placeholder="http://192.168.1.25:8001" [value]="saved()" aria-label="Backend address" />
            <input #pinInput class="input input-sm input-bordered join-item w-24 font-mono" placeholder="PIN" inputmode="numeric" maxlength="6" [value]="savedPin" aria-label="PIN" />
            <button class="btn btn-sm btn-primary join-item" type="submit">Connect</button>
          </form>
          <div class="text-xs opacity-60">Connected to: <span class="font-mono">{{ current }}</span></div>
        }
      </div>
    </app-modal>
  `,
})
export class RemoteModal implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private toast = inject(ToastService);
  private video = viewChild<ElementRef<HTMLVideoElement>>('video');
  closed = output<void>();

  android = isNativeAndroid;
  current = API_BASE.replace(/\/api$/, '');
  tab = signal<'share' | 'scan'>(isNativeAndroid ? 'scan' : 'share');
  info = signal<RemoteInfo | null>(null);
  url = signal('');
  qr = signal('');
  error = signal('');
  toggling = signal(false);
  cameraError = signal('');
  scanBlocked = signal(false);
  readonly MAX_SCAN_FAILS = 3;
  private scanFails = 0;
  savedPin = localStorage.getItem(PIN_KEY) ?? '';
  saved = signal(localStorage.getItem(SERVER_KEY) ?? '');

  private stream?: MediaStream;
  private frame = 0;
  private done = false;

  ngOnInit() {
    void this.loadInfo();
    if (this.tab() === 'scan') setTimeout(() => void this.startCamera());
  }

  ngOnDestroy() {
    this.stopCamera();
  }

  setTab(tab: 'share' | 'scan') {
    this.tab.set(tab);
    if (tab === 'scan') setTimeout(() => void this.startCamera());
    else this.stopCamera();
  }

  private async loadInfo() {
    try {
      const info = await this.api.remoteInfo();
      await this.adopt(info);
    } catch (e) {
      this.error.set(errorMessage(e));
    }
  }

  private async adopt(info: RemoteInfo) {
    this.info.set(info);
    if (info.addresses.length) await this.choose(info.addresses[0].url);
  }

  async setSharing(enabled: boolean) {
    this.toggling.set(true);
    try {
      await this.adopt(await this.api.setSharing(enabled));
    } catch (e) {
      this.toast.error(errorMessage(e));
      await this.loadInfo();
    } finally {
      this.toggling.set(false);
    }
  }

  async setAutoStart(enabled: boolean) {
    try {
      this.info.set(await this.api.setShareAutoStart(enabled));
    } catch (e) {
      this.toast.error(errorMessage(e));
      await this.loadInfo();
    }
  }

  async choose(url: string) {
    this.url.set(url);
    const pin = this.info()?.pin;
    this.qr.set(await QRCode.toDataURL(pin ? `${url}/?pin=${pin}` : url, { margin: 1, width: 480, errorCorrectionLevel: 'M' }));
  }

  copy() {
    void navigator.clipboard?.writeText(this.url()).then(() => this.toast.success('Address copied'));
  }

  private async startCamera() {
    const el = this.video()?.nativeElement;
    if (!el || this.stream) return;
    this.done = false;
    this.cameraError.set('');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      el.srcObject = this.stream;
      await el.play();
      this.scanLoop(el);
    } catch {
      this.cameraError.set('Camera unavailable. Allow camera access for Canto, or type the address below.');
    }
  }

  private stopCamera() {
    cancelAnimationFrame(this.frame);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = undefined;
  }

  private scanLoop(video: HTMLVideoElement) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const tick = () => {
      if (this.done || !this.stream) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const code = jsQR(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (code && /^https?:\/\/[^/\s]+/.test(code.data)) {
          this.connect(code.data, '', true);
          return;
        }
      }
      this.frame = requestAnimationFrame(tick);
    };
    tick();
  }

  resumeScan() {
    this.scanFails = 0;
    this.scanBlocked.set(false);
    if (this.stream) this.scanLoop(this.video()!.nativeElement);
  }

  async connect(raw: string, pinText = '', fromScan = false) {
    let url = raw.trim();
    let pin = pinText.trim();
    try {
      const parsed = new URL(url);
      pin = parsed.searchParams.get('pin') ?? pin; // the QR code carries address and PIN together
      url = parsed.origin;
    } catch {
      this.toast.warn('Enter an address like http://192.168.1.25:8001');
      return;
    }
    if (this.done) return;
    this.done = true;
    try {
      const res = await fetch(`${url}/api/remote`, { headers: pin ? { 'X-Canto-Pin': pin } : {} });
      if (res.status === 401) throw new Error(pin ? 'Wrong PIN. Check the number shown on the computer.' : 'This computer needs a PIN. Scan its QR code or type the PIN.');
      if (!res.ok) throw new Error(`The computer answered with an error (${res.status})`);
    } catch (e) {
      this.done = false;
      this.toast.error(e instanceof TypeError ? `Cannot reach ${url}. Is Sharing switched on, on the computer?` : (e as Error).message);
      if (fromScan && this.stream) {
        if (++this.scanFails >= this.MAX_SCAN_FAILS) this.scanBlocked.set(true);
        else setTimeout(() => this.scanLoop(this.video()!.nativeElement), 1500);
      }
      return;
    }
    localStorage.setItem(SERVER_KEY, url);
    localStorage.setItem(PIN_KEY, pin);
    this.toast.success(`Connected to ${url}`);
    setTimeout(() => location.reload(), 600);
  }
}
