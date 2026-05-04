import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
  const [message, setMessage] = useState('');
  const [deviceToken, setDeviceToken] = useState('');
  const [orderingEnabled, setOrderingEnabled] = useState(true);
  const router = useRouter();
  const TOTAL_TABLES = 10;
  const ESTIMATED_DINING_MINUTES = 40;

  const waitingBeforeCount = useMemo(() => {
    if (!myQueue || myQueue.status !== 'waiting') return 0;
    return queueInfo.queue.filter((item) => item.status === 'waiting' && item.number < myQueue.number).length;
  }, [queueInfo.queue, myQueue]);

  const estimatedWaitMinutes = useMemo(() => {
    if (!waitingBeforeCount) return 0;
    return Math.max(0, Math.ceil((waitingBeforeCount / TOTAL_TABLES) * ESTIMATED_DINING_MINUTES));
  }, [waitingBeforeCount]);

  const statusText = useMemo(() => {
    if (!myQueue) return '尚未取號';
    if (myQueue.status === 'waiting') return '等待叫號中';
    if (myQueue.status === 'called') return '輪到你了';
    if (myQueue.status === 'skipped') return '已過號';
    if (myQueue.status === 'seated') return '已入座';
    return '本次號碼已完成';
  }, [myQueue]);

  async function loadQueueBoard() {
    try {
      const res = await fetch(`${API}/queue`);
      const data = await res.json();
      setQueueInfo(data);
    } catch {
      setMessage('目前無法連線，請稍後再試。');
    }
  }

  async function loadMyState(token) {
    if (!token) return;
    try {
      const res = await fetch(`${API}/customer-state/${token}`);
      const data = await res.json();
      setMyQueue(data.activeQueue || null);
      if (data.activeQueue?.status === 'called') {
        setMessage(`已叫到你的號碼 ${data.activeQueue.number}，請前往櫃台。`);
      } else if (data.activeQueue?.status === 'skipped') {
        setMessage(`你的號碼 ${data.activeQueue.number} 已被過號。`);
      } else if (data.activeQueue?.status === 'seated') {
        setMessage(`你的號碼 ${data.activeQueue.number} 已確認入座。`);
      }
    } catch {
      setMessage('目前無法同步你的號碼狀態。');
    }
  }

  async function loadOrderingStatus() {
    try {
      const res = await fetch(`${API}/ordering-status`);
      const data = await res.json();
      if (res.ok) setOrderingEnabled(!!data.orderingEnabled);
    } catch {
      // ignore and fallback to default button text
    }
  }

  async function takeNumber() {
    try {
      const res = await fetch(`${API}/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken })
      });
      const data = await res.json();
      if (!res.ok) {
        // 目前已暫時允許同一裝置重複取號，方便測試前方等待與預估等待時間。
        // if (res.status === 409 && data.queue) {
        //   setMyQueue(data.queue);
        //   setMessage(`此裝置目前已有號碼 ${data.queue.number}。`);
        //   await loadQueueBoard();
        //   return;
        // }
        throw new Error(data.error || '取號失敗');
      }
      setMyQueue(data);
      setMessage(`取號成功，你的號碼是 ${data.number}`);
      await loadQueueBoard();
    } catch {
      setMessage('取號失敗，請稍後再試。');
    }
  }

  useEffect(() => {
    const token = getDeviceToken();
    setDeviceToken(token);
    loadQueueBoard();
    loadMyState(token);
    loadOrderingStatus();
    const timer = setInterval(() => {
      loadQueueBoard();
      loadMyState(token);
      loadOrderingStatus();
    }, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="customerPage">
      <div className="mobileShell">
        <div className="topNav">
          <div>
            <div className="miniBrand">香港鑫華茶餐廳</div>
            <div className="screenTitle">線上取號</div>
          </div>
          <div className="navAction">自取</div>
        </div>

        <div className="statusPanel warm">
          <div className="statusLabel">目前號碼狀態</div>
          <div className="bigNumber">{myQueue ? myQueue.number : '--'}</div>
          <div className="statusText">{statusText}</div>
          {myQueue?.status === 'called' && <div className="callBanner">請先向店員出示取號資訊</div>}
        </div>

        <div className="boardRow">
          <div className="boardCard">
            <div className="boardLabel">目前叫號</div>
            <div className="boardValue">{queueInfo.current ? queueInfo.current.number : '--'}</div>
          </div>
          <div className="boardCard">
            <div className="boardLabel">前方等待</div>
            <div className="boardValue">{myQueue?.status === 'waiting' ? waitingBeforeCount : 0}組</div>
          </div>
          
        </div>

        <div className='boardRowSingle'>
            <div className="boardCard">
              <div className="boardLabel">預計等待</div>
              <div className="boardValue">{myQueue?.status === 'waiting' ? `${estimatedWaitMinutes} 分鐘` : '--'}</div>
            </div>
        </div>

        {message && <div className={message.includes('失敗') || message.includes('無法') ? 'alertError' : 'alertOk'}>{message}</div>}

        <div className="actionBlock">
          <button className="orangeBtn" onClick={takeNumber}>我要取號</button>
          <button className="outlineBtn" onClick={() => router.push('/menu')}>
            {orderingEnabled ? '點餐' : '觀看菜單'}
          </button>
        </div>

        <div className="listCard">
          <div className="sectionTitle">取號說明</div>
          <div className="sectionText">同一台裝置同時間只能持有一張尚未完成的號碼。到號時，此頁會自動顯示通知。</div>
        </div>
      </div>
    </div>
  );
}
