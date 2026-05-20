import liff from '@line/liff';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID || '';

export function hasLiffConfig() {
  return !!LIFF_ID;
}

export async function initLiffApp() {
  if (!LIFF_ID) {
    return { ready: true, inClient: false, lineUserId: null, friendship: null, error: null };
  }
  try {
    await liff.init({ liffId: LIFF_ID });
    const inClient = liff.isInClient();
    let lineUserId = null;
    let friendship = null;
    if (liff.isLoggedIn()) {
      const profile = await liff.getProfile();
      lineUserId = profile.userId;
      if (typeof window !== 'undefined' && lineUserId) {
        sessionStorage.setItem('lineUserId', lineUserId);
      }
    }
    try {
      friendship = await liff.getFriendship();
    } catch {
      friendship = null;
    }
    return { ready: true, inClient, lineUserId, friendship, error: null };
  } catch (err) {
    return { ready: true, inClient: false, lineUserId: null, friendship: null, error: err.message || 'LIFF 初始化失敗' };
  }
}

export function getStoredLineUserId() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('lineUserId') || '';
}

export function openAddFriendUrl() {
  const url = process.env.NEXT_PUBLIC_LINE_OA_ADD_FRIEND_URL;
  if (!url) return;
  if (liff.isInClient()) {
    liff.openWindow({ url, external: false });
  } else {
    window.open(url, '_blank');
  }
}

export function isDevBrowserAllowed() {
  return process.env.NEXT_PUBLIC_ALLOW_BROWSER_QUEUE === '1';
}
