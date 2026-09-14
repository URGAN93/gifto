import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as supabase from '@supabase/supabase-js';
import jsQR from 'jsqr';
import qrcode from 'qrcode-generator';
import { createNativeAuth } from './auth.mjs';
import { publicUrl } from './policy.mjs';
import { handleBack } from './back.mjs';

window.supabase = supabase;
window.jsQR = jsQR;
window.qrcode = qrcode;
if (Capacitor.isNativePlatform()) {
  const ensureHomeNavigation = () => {
    const home = document.querySelector('.app-shell.home');
    if (!home) return;
    let bar = home.querySelector(':scope > .topbar');
    if (!bar) {
      bar = document.createElement('header');
      bar.className = 'topbar';
      bar.innerHTML = '<span class="topbar-spacer" aria-hidden="true"></span><a class="brand" href="index.html" aria-label="GIFTO 홈"><span class="brand-mark">G</span> GIFTO</a><a class="icon-button pending-anchor" href="pages/login.html" data-auth-destination="pages/my-page.html" aria-label="내 페이지">☺<span class="pending-badge" data-pending-badge hidden aria-label="입금 확인 대기 건수"></span></a>';
      home.prepend(bar);
    }
    bar.style.display = 'flex';
    bar.style.visibility = 'visible';
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureHomeNavigation, { once: true });
  else ensureHomeNavigation();
  const root = new URL('/', location.href).href;
  const notify = message => {
    const output = document.querySelector('[data-auth-message]');
    if (output) output.textContent = message;
    else if (typeof window.showToast === 'function') window.showToast(message);
    else window.alert(message);
  };
  const resetButton = () => {
    const button = document.querySelector('[data-kakao-login]');
    if (button) { button.disabled = false; button.textContent = '카카오로 시작하기'; }
  };
  window.giftoPublicUrl = publicUrl;
  window.giftoNative = {
    isNative: true,
    attachAuth(auth) {
      this.auth = createNativeAuth({ auth, app: App, browser: Browser, storage: localStorage,
        root, navigate: url => location.replace(url), notify, resetButton });
      this.ready = this.auth.init().catch(() => notify('앱의 로그인 연결을 준비하지 못했어요. 앱을 다시 열어 주세요.'));
    },
    login() {
      const next = new URLSearchParams(location.search).get('next');
      // Web login's next is relative to the site root, not pages/login.html.
      return this.auth.login(next);
    },
    async share(data) { await Share.share(data); },
    async shareImage(blob) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(new Error('공유 이미지를 읽지 못했어요.'));
        reader.readAsDataURL(blob);
      });
      // Cache is private and needs no broad storage/photo-library permissions.
      // A unique file keeps an earlier receiving app's share URI valid.
      const file = await Filesystem.writeFile({ path: `gifto-share-${crypto.randomUUID()}.png`, data, directory: Directory.Cache });
      await Share.share({ title: 'GIFTO 위시리스트', files: [file.uri] });
    }
  };
  App.addListener('appStateChange', ({ isActive }) => {
    const auth = window.giftoDb?.auth;
    if (isActive) { auth?.startAutoRefresh(); resetButton(); }
    else auth?.stopAutoRefresh();
  }).catch(() => {});
  App.addListener('backButton', ({ canGoBack }) => {
    handleBack({ canGoBack, document, history, location, app: App, root, Event });
  }).catch(() => {});
}
