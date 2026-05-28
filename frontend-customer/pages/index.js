import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useLiff } from '../context/LiffContext';
import { getStoredLineUserId, openAddFriendUrl, isDevBrowserAllowed } from '../lib/liff';
import {
  SKIP_RULE_SHORT,
  SKIP_RULE_CALLED_PRIMARY,
  SKIP_RULE_CALLED_SECONDARY,
  WAITING_STAY_HINT
} from '../lib/queueRules';

function getApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) {
    return configured.replace(/\/$/, '');
  }
  if (typeof window === 'undefined') {
    return '';
  }
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  return '';
}

const API = getApiBase();

function getDeviceToken() {
  if (typeof window === 'undefined') return '';
  let token = localStorage.getItem('deviceToken');
  if (!token) {
    token = `device_${Math.random().toString(36).slice(2)}_${Date.now()}`;
    localStorage.setItem('deviceToken', token);
  }
  return token;
}

const PARTY_MIN = 1;
const PARTY_MAX = 20;

function clampPartySize(n) {
  return Math.min(PARTY_MAX, Math.max(PARTY_MIN, n));
}

function PartySizeStepper({ label, className = '', partySize, setPartySize }) {
  const rootClass = ['partyPicker', className].filter(Boolean).join(' ');
  return (
    <div className={rootClass} role="group" aria-label="用餐人數">
      <div className="partyPickerLabel">{label}</div>
      <div className="partyStepper">
        <div className="qtyBox">
          <button
            type="button"
            className="qtyBtn"
            aria-label="減少一人"
            disabled={partySize <= PARTY_MIN}
            onClick={() => setPartySize((v) => clampPartySize(v - 1))}
          >
            -
          </button>
          <div className="partyStepperMid">
            <div className="qtyValue">{partySize}</div>
            <span className="partyStepperUnit">位</span>
          </div>
          <button
            type="button"
            className="qtyBtn"
            aria-label="增加一人"
            disabled={partySize >= PARTY_MAX}
            onClick={() => setPartySize((v) => clampPartySize(v + 1))}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { liffReady, inClient, lineUserId: liffUserId, friendship, hasLiff, liffError } = useLiff();
  const [queueInfo, setQueueInfo] = useState({ current: null, waitingCount: 0, queue: [] });
  const [myQueue, setMyQueue] = useState(null);
  const [message, setMessage] = useState(API ? '' : '目前尚未設定後端 API 網址，請先設定 NEXT_PUBLIC_API_URL。');
  const [deviceToken, setDeviceToken] = useState('');
  const [partySize, setPartySize] = useState(2);
  const router = useRouter();

  function getPartyLabel(size) {
    if (size <= 2) return '1-2位';
    if (size <= 4) return '3-4位';
    if (size <= 6) return '5-6位';
    return '7位以上';
  }

  const lineUserId = liffUserId || getStoredLineUserId();
  const canUseLine = hasLiff && inClient && lineUserId;
  const canUseBrowser = !hasLiff || isDevBrowserAllowed();
  const mustScanLine = liffReady && hasLiff && !inClient && !canUseBrowser;
  const needsLineLogin = liffReady && hasLiff && inClient && !lineUserId && !liffError;
  const needsAddFriend = canUseLine && friendship && !friendship.friendFlag;

  const waitingAheadRows = useMemo(() => {
    if (!myQueue || myQueue.status !== 'waiting') return [];
    return queueInfo.queue.filter((item) => item.status === 'waiting' && item.id < myQueue.id);
  }, [queueInfo.queue, myQueue]);

  const waitingBeforeCount = waitingAheadRows.length;

  const waitingBeforeGuests = useMemo(
    () => waitingAheadRows.reduce((sum, item) => sum + (Number(item.partySize) > 0 ? Number(item.partySize) : 1), 0),
    [waitingAheadRows]
  );

  const statusText = useMemo(() => {
    if (!myQueue) return '尚未取號';
    if (myQueue.status === 'waiting') return '等待叫號中';
    if (myQueue.status === 'called') return '輪到你了';
    if (myQueue.status === 'skipped') return '已過號';
    if (myQueue.status === 'seated') return '已入座';
    return '本次號碼已完成';
  }, [myQueue]);

  async function loadQueueBoard() {
    if (!API) return;
    try {
      const res = await fetch(`${API}/queue`);
      const data = await res.json();
      setQueueInfo(data);
    } catch {
      setMessage('目前無法連線到後端服務，請稍後再試。');
    }
  }

  async function loadMyState() {
    if (!API) return;
    try {
      let res;
      if (lineUserId) {
        res = await fetch(`${API}/customer-state/line/${encodeURIComponent(lineUserId)}`);
      } else if (deviceToken) {
        res = await fetch(`${API}/customer-state/${deviceToken}`);
      } else return;
      const data = await res.json();
      setMyQueue(data.activeQueue || null);
      if (data.activeQueue?.status === 'called') {
        setMessage(`已叫到你的號碼 ${data.activeQueue.number}，請前往櫃台。`);
      } else if (data.activeQueue?.status === 'skipped') {
        setMessage(`你的號碼 ${data.activeQueue.number} 已被過號，請重新取號或洽櫃台。`);
      } else if (data.activeQueue?.status === 'seated') {
        setMessage(`你的號碼 ${data.activeQueue.number} 已確認入座。`);
      }
    } catch {
      setMessage('目前無法同步你的號碼狀態。');
    }
  }

  async function takeNumber(chosenSize = partySize) {
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法取號。');
      return;
    }
    if (mustScanLine) {
      setMessage('請使用 LINE 掃描門口 QR 取號，以接收叫號與用餐時間通知。');
      return;
    }
    if (needsLineLogin) {
      setMessage('請先完成 LINE 登入授權後再取號，才能收到推播通知。');
      return;
    }
    const token = deviceToken || getDeviceToken();
    const body = { partySize: chosenSize };
    if (lineUserId) body.lineUserId = lineUserId;
    else body.deviceToken = token;
    try {
      const res = await fetch(`${API}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '取號失敗');
      }
      setMyQueue(data);
      const label = getPartyLabel(data.partySize || chosenSize);
      let successMsg = `取號成功，你的號碼是 ${data.number}（${label}）`;
      if (data.lineUserId && data.lineNotify?.ok) {
        successMsg += '，LINE 取號通知已送出';
      } else if (data.lineUserId && data.lineNotify?.error) {
        successMsg += `。但 LINE 推播失敗：${data.lineNotify.error}（請確認已加入官方帳號好友）`;
      } else if (data.lineUserId) {
        successMsg += '，已綁定 LINE';
      } else {
        successMsg += '（未綁定 LINE，不會收到推播，請用 LINE 掃碼重新取號）';
      }
      setMessage(successMsg);
      await loadQueueBoard();
      await loadMyState();
    } catch {
      setMessage('取號失敗，請稍後再試。');
    }
  }

  useEffect(() => {
    const token = getDeviceToken();
    setDeviceToken(token);
    if (!API) return;
    loadQueueBoard();
  }, []);

  useEffect(() => {
    if (!liffReady) return;
    loadMyState();
    const timer = setInterval(() => {
      loadQueueBoard();
      loadMyState();
    }, 3000);
    return () => clearInterval(timer);
  }, [liffReady, lineUserId, deviceToken]);

  useEffect(() => {
    if (myQueue?.status === 'skipped') {
      const ps = Number(myQueue.partySize);
      if (Number.isInteger(ps) && ps >= 1 && ps <= 20) setPartySize(ps);
    }
  }, [myQueue?.id, myQueue?.status, myQueue?.partySize]);

  const hasTicket = !!myQueue;

  const messageClass =
    message.includes('失敗') || message.includes('無法') || message.includes('過號') || message.includes('尚未設定')
      ? 'alertError'
      : 'alertOk';

  const partyPickerBlock = (
    <PartySizeStepper label="用餐人數（取號時送出）" partySize={partySize} setPartySize={setPartySize} />
  );

  return (
    <div className="customerPage">
      <div className="mobileShell">
        <div className="topNav">
          <div>
            <div className="miniBrand">香港鑫華茶餐廳</div>
            <div className="screenTitle">線上取號</div>
            <div className={`phaseTag${hasTicket ? ' post' : ' pre'}`}>{hasTicket ? '取號後 · 我的候位' : '取號前 · 現場候位'}</div>
          </div>
          <div className="navAction">自取</div>
        </div>

        {!liffReady && (
          <div className="listCard"><div className="sectionText">載入中…</div></div>
        )}

        {liffReady && mustScanLine && (
          <div className="listCard">
            <div className="sectionTitle">請使用 LINE 掃碼</div>
            <div className="sectionText">請用 LINE 掃描門口 QR 開啟此頁取號，才能收到叫號、過號與用餐時間 LINE 通知。</div>
          </div>
        )}

        {liffReady && liffError && (
          <div className="alertError">LIFF 載入失敗：{liffError}</div>
        )}

        {needsLineLogin && (
          <div className="listCard">
            <div className="sectionTitle">需要 LINE 登入</div>
            <div className="sectionText">請允許登入以綁定你的 LINE 帳號，才能收到取號與叫號推播。</div>
          </div>
        )}

        {needsAddFriend && (
          <div className="listCard">
            <div className="sectionTitle">開啟 LINE 通知</div>
            <div className="sectionText">加入官方帳號好友後，才能收到叫號與用餐時間推播。</div>
            <button type="button" className="outlineBtn" style={{ marginTop: 12 }} onClick={openAddFriendUrl}>加入官方帳號好友</button>
          </div>
        )}

        {canUseLine && !needsAddFriend && (
          <div className="listCard subtle">
            <div className="sectionText">已連結 LINE，叫號與用餐時間將透過 LINE 通知。</div>
          </div>
        )}

        {!hasTicket && (
          <section className="queuePhase pre" aria-label="取號前">
            <div className="boardRow">
              <div className="boardCard">
                <div className="boardLabel">目前叫號</div>
                <div className="boardValue">{queueInfo.current ? queueInfo.current.number : '--'}</div>
              </div>
              <div className="boardCard">
                <div className="boardLabel">全店等候</div>
                <div className="boardValue">{queueInfo.waitingCount} 組</div>
                <div className="boardSub">尚未取號亦可參考現場排隊量</div>
              </div>
            </div>

            {message && <div className={messageClass}>{message}</div>}
            {partyPickerBlock}
            <div className="actionBlock">
              <button type="button" className="orangeBtn" onClick={() => takeNumber()} disabled={mustScanLine || needsLineLogin}>我要取號</button>
              <button type="button" className="outlineBtn" onClick={() => router.push('/menu')}>查看 / 修改預選餐點</button>
            </div>

            <div className="listCard">
              <div className="sectionTitle">取號說明</div>
              <div className="sectionText">請使用 LINE 掃碼取號以啟用通知。輪到時會透過 LINE 推播，此頁亦會同步更新。</div>
              <div className="sectionText" style={{ marginTop: 8 }}>{SKIP_RULE_SHORT}</div>
            </div>
          </section>
        )}

        {hasTicket && (
          <section className="queuePhase post" aria-label="取號後">
            <div className={`statusPanel warm${myQueue?.status === 'skipped' ? ' skipped' : ''}`}>
              <div className="statusLabel">目前號碼狀態</div>
              <div className="bigNumber">{myQueue.number}</div>
              <div className="statusText">{statusText}</div>
              <div className="partyMeta">用餐人數：{Number(myQueue.partySize) || 1}</div>
              {myQueue.status === 'called' && (
                <div className="callBanner">
                  <div>{SKIP_RULE_CALLED_PRIMARY}</div>
                  <div style={{ marginTop: 6, fontSize: '0.92em', opacity: 0.95 }}>{SKIP_RULE_CALLED_SECONDARY}</div>
                </div>
              )}
              {myQueue.status === 'waiting' && (
                <div className="waitingHint">{WAITING_STAY_HINT}</div>
              )}
              {myQueue.status === 'skipped' && (
                <div className="skipHint">此號已過號。若要繼續候位請重新取號，或向櫃台詢問。</div>
              )}
            </div>

            <div className="boardRow">
              <div className="boardCard">
                <div className="boardLabel">目前叫號</div>
                <div className="boardValue">{queueInfo.current ? queueInfo.current.number : '--'}</div>
              </div>
              <div className="boardCard">
                <div className="boardLabel">前方等待</div>
                <div className="boardValue">{myQueue.status === 'waiting' ? `${waitingBeforeCount} 組` : '--'}</div>
              </div>
            </div>

            {message && <div className={messageClass}>{message}</div>}

            {myQueue.status === 'skipped' && (
              <PartySizeStepper
                label="重新取號 · 用餐人數"
                className="postRequeue"
                partySize={partySize}
                setPartySize={setPartySize}
              />
            )}

            <div className="actionBlock">
              {myQueue.status === 'skipped' && (
                <button type="button" className="outlineBtn" onClick={() => takeNumber()}>重新取號</button>
              )}
              {/* 測試用
              {partyPickerBlock}
              <button type="button" className="orangeBtn" onClick={() => takeNumber()}>我要取號</button> */}
              <button type="button" className="outlineBtn" onClick={() => router.push('/menu')}>查看 / 修改預選餐點</button>
            </div>

            <div className="listCard subtle">
              <div className="sectionText">號碼狀態約每 3 秒自動更新。已綁定 LINE 時亦會收到推播通知。</div>
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
