import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';

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

export default function Home() {
  const [queueInfo, setQueueInfo] = useState({ current: null, waitingCount: 0, queue: [] });
  const [myQueue, setMyQueue] = useState(null);
  const [message, setMessage] = useState(API ? '' : '目前尚未設定後端 API 網址，請先設定 NEXT_PUBLIC_API_URL。');
  const [deviceToken, setDeviceToken] = useState('');
  const [partySize, setPartySize] = useState(2);
  const router = useRouter();

  const partySizes = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12];

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

  async function loadMyState(token) {
    if (!API || !token) return;
    try {
      const res = await fetch(`${API}/customer-state/${token}`);
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

  async function takeNumber() {
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法取號。');
      return;
    }
    const token = deviceToken || getDeviceToken();
    try {
      const res = await fetch(`${API}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken: token, partySize })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '取號失敗');
      }
      setMyQueue(data);
      setMessage(`取號成功，你的號碼是 ${data.number}（${data.partySize || partySize} 位）`);
      await loadQueueBoard();
      await loadMyState(token);
    } catch {
      setMessage('取號失敗，請稍後再試。');
    }
  }

  useEffect(() => {
    const token = getDeviceToken();
    setDeviceToken(token);
    if (!API) return;
    loadQueueBoard();
    loadMyState(token);
    const timer = setInterval(() => {
      loadQueueBoard();
      loadMyState(token);
    }, 3000);
    return () => clearInterval(timer);
  }, []);

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
    <div className="partyPicker">
      <div className="partyPickerLabel">用餐人數（取號時送出）</div>
      <div className="partyChips">
        {partySizes.map((n) => (
          <button
            key={n}
            type="button"
            className={`partyChip${partySize === n ? ' active' : ''}`}
            onClick={() => setPartySize(n)}
          >
            {n} 位
          </button>
        ))}
      </div>
    </div>
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
              <button type="button" className="orangeBtn" onClick={takeNumber}>我要取號</button>
              <button type="button" className="outlineBtn" onClick={() => router.push('/menu')}>查看 / 修改預選餐點</button>
            </div>

            <div className="listCard">
              <div className="sectionTitle">取號說明</div>
              <div className="sectionText">同一台裝置同時間只能持有一張尚未完成的號碼。到號時，此頁會自動顯示通知。</div>
            </div>
          </section>
        )}

        {hasTicket && (
          <section className="queuePhase post" aria-label="取號後">
            <div className={`statusPanel warm${myQueue?.status === 'skipped' ? ' skipped' : ''}`}>
              <div className="statusLabel">目前號碼狀態</div>
              <div className="bigNumber">{myQueue.number}</div>
              <div className="statusText">{statusText}</div>
              <div className="partyMeta">用餐人數：{myQueue.partySize ?? 1} 位</div>
              {myQueue.status === 'called' && <div className="callBanner">請先向店員出示取號資訊</div>}
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
                {myQueue.status === 'waiting' && (
                  <div className="boardSub">約 {waitingBeforeGuests} 位在你之前</div>
                )}
              </div>
            </div>

            {message && <div className={messageClass}>{message}</div>}

            {myQueue.status === 'skipped' && (
              <div className="partyPicker postRequeue">
                <div className="partyPickerLabel">重新取號 · 用餐人數</div>
                <div className="partyChips">
                  {partySizes.map((n) => (
                    <button
                      key={n}
                      type="button"
                      className={`partyChip${partySize === n ? ' active' : ''}`}
                      onClick={() => setPartySize(n)}
                    >
                      {n} 位
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="actionBlock">
              {myQueue.status === 'skipped' && (
                <button type="button" className="outlineBtn" onClick={takeNumber}>重新取號</button>
              )}
              <button type="button" className="outlineBtn" onClick={() => router.push('/menu')}>查看 / 修改預選餐點</button>
            </div>

            <div className="listCard subtle">
              <div className="sectionText">號碼狀態約每 3 秒自動更新。輪到你時請留意本頁通知。</div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
