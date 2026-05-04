import { useEffect, useState } from 'react';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export default function Staff() {
  const [queueData, setQueueData] = useState({ queue: [], current: null, waitingCount: 0 });
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [selectedQueueNumber, setSelectedQueueNumber] = useState(null);
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [orderingEnabled, setOrderingEnabled] = useState(true);
  const [orderingSwitchLoading, setOrderingSwitchLoading] = useState(false);
  const [todaySummary, setTodaySummary] = useState([]);
  const [showTodaySummary, setShowTodaySummary] = useState(false);
  const [todaySummaryLoading, setTodaySummaryLoading] = useState(false);

  const isCallNextDisabled = queueData.current?.status === 'called' || actionLoadingId !== null;

  async function loadQueue() {
    try {
      const res = await fetch(`${API}/queue`);
      const data = await res.json();
      setQueueData({ ...data, queue: data.queue.filter((item) => item.status !== 'skipped') });
    } catch {
      setMessage('無法取得隊列資料');
    }
  }

  async function loadOrderingStatus() {
    try {
      const res = await fetch(`${API}/ordering-status`);
      const data = await res.json();
      if (res.ok) setOrderingEnabled(!!data.orderingEnabled);
    } catch {
      setMessage('無法取得點餐開關狀態');
    }
  }

  async function toggleOrdering() {
    setOrderingSwitchLoading(true);
    setMessage('');
    try {
      const nextValue = !orderingEnabled;
      const res = await fetch(`${API}/ordering-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderingEnabled: nextValue })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '切換失敗');
      setOrderingEnabled(!!data.orderingEnabled);
      setMessage(data.orderingEnabled ? '已開啟點餐功能' : '已關閉點餐功能');
    } catch (e) {
      setMessage(e.message || '點餐功能切換失敗');
    } finally {
      setOrderingSwitchLoading(false);
    }
  }

  async function openTodaySummary() {
    setTodaySummaryLoading(true);
    try {
      const res = await fetch(`${API}/order-summary/today`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '讀取今日點餐數量失敗');
      setTodaySummary(Array.isArray(data.items) ? data.items : []);
      setShowTodaySummary(true);
    } catch (e) {
      setMessage(e.message || '讀取今日點餐數量失敗');
    } finally {
      setTodaySummaryLoading(false);
    }
  }

  async function callNext() {
    try {
      const res = await fetch(`${API}/queue/next`, { method: 'POST' });
      const data = await res.json();
      if (data.message) {
        setMessage(data.message);
        await loadQueue();
        setOrder(null);
        setSelectedQueueId(null);
        setSelectedQueueNumber(null);
        return;
      }
      setMessage('已叫下一號');
      await loadQueue();
      setSelectedQueueId(data.id);
      setSelectedQueueNumber(data.number);
      setOrder(null);
      await loadOrder(data.id, data.number);
    } catch {
      setMessage('叫號失敗');
    }
  }

  async function clearQueue() {
    try {
      const res = await fetch(`${API}/queue/clear`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清空失敗');
      setMessage(data.message || '已清空今日 queue');
      setOrder(null);
      setSelectedQueueId(null);
      setSelectedQueueNumber(null);
      setConfirmClear(false);
      await loadQueue();
    } catch {
      setMessage('清空 queue 失敗');
      setConfirmClear(false);
    }
  }

  async function updateQueueStatus(queueId, action) {
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} 失敗`);
      await loadQueue();
      if (action === 'skip' && selectedQueueId === queueId) {
        setSelectedQueueId(null);
        setSelectedQueueNumber(null);
        setOrder(null);
      } else if (selectedQueueId === queueId) {
        setSelectedQueueNumber(data.number);
      }
    } catch (e) {
      setMessage(e.message || '狀態更新失敗');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function loadOrder(queueId, queueNumber) {
    setSelectedQueueId(queueId);
    setSelectedQueueNumber(queueNumber);
    try {
      const res = await fetch(`${API}/order/${queueId}`);
      if (!res.ok) { setOrder(null); return; }
      const data = await res.json();
      setOrder(data);
    } catch {
      setOrder(null);
    }
  }

  useEffect(() => {
    loadQueue();
    loadOrderingStatus();
    const timer = setInterval(loadQueue, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <div className="topTitle">櫃台店員端</div>
            <div className="topSub">查看隊列與餐點訂單</div>
          </div>
        </div>

        <div className="metrics">
          <div className="card">
            <div className="metricLabel">目前叫號</div>
            <div className="metricValue">{queueData.current ? queueData.current.number : '尚未叫號'}</div>
          </div>
          <div className="card">
            <div className="metricLabel">等待中</div>
            <div className="metricValue">{queueData.waitingCount} 組</div>
          </div>
        </div>

        <div className="staffActions">
          <button className="dangerBtn" onClick={callNext} disabled={isCallNextDisabled}>叫下一號</button>
          <button className="clearBtn" onClick={() => setConfirmClear(true)}>清空今日列隊清單</button>
          <button className="clearBtn" onClick={toggleOrdering} disabled={orderingSwitchLoading}>
            {orderingSwitchLoading ? '切換中...' : orderingEnabled ? '關閉點餐功能' : '開啟點餐功能'}
          </button>
        </div>
        {message && <div className="card" style={{ color: '#92400e' }}>{message}</div>}

        <div className="layout">
          <div className="col">
            <h2 className="sectionTitle">隊列清單</h2>
            <div className="muted" style={{ marginBottom: 12 }}>點選號碼即可查看該客人的預點餐草稿。</div>
            {queueData.queue.map((item) => {
              const isCalled = item.status === 'called';
              const actionDisabled = !isCalled || actionLoadingId === item.id;
              return (
                <div key={item.id} className="queueItem" onClick={() => loadOrder(item.id, item.number)}>
                  <div className="queueInfo">
                    <div className="queueTop">
                      <span>號碼 {item.number}</span>
                    </div>
                    <div className="queueRow">
                      <span className={`statusTag ${item.status}`}>{item.status === 'waiting' ? '等待中' : item.status === 'called' ? '已叫號' : item.status === 'skipped' ? '已過號' : item.status === 'seated' ? '已入座' : '完成'}</span>
                    </div>
                  </div>
                  {isCalled && (
                    <div className="queueActions">
                      <button
                        className="actionBtn skipBtn"
                        disabled={actionDisabled}
                        onClick={(e) => { e.stopPropagation(); updateQueueStatus(item.id, 'skip'); }}
                      >過號</button>
                      <button
                        className="actionBtn seatBtn"
                        disabled={actionDisabled}
                        onClick={(e) => { e.stopPropagation(); updateQueueStatus(item.id, 'seat'); }}
                      >確認入座</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="col">
            {!selectedQueueId && <div className="muted">尚未選擇號碼。</div>}
            {selectedQueueId && !order && <div className="muted">這位客人尚未點餐。</div>}
            {order && (
              <div className="orderCard">
                <div className="orderTitle">號碼 {selectedQueueNumber}</div>
                {order.items.map((item, idx) => (
                  <div className="orderItem" key={idx}>
                    <div className="orderName">{item.name} × {item.quantity || 1}</div>
                    <div className="orderOptions">種類：{item.category || '未填'}｜規格：{item.variant || '未填'}</div>
                    <div className="orderOptions">{item.options?.length ? item.options.join('、') : '無其他偏好'}</div>
                  </div>
                ))}
                <div className="noteTitle">備註</div>
                <div>{order.note || '無'}</div>
              </div>
            )}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <button className="clearBtn" onClick={openTodaySummary} disabled={todaySummaryLoading}>
            {todaySummaryLoading ? '讀取中...' : '查看今日點餐數量'}
          </button>
        </div>

        {confirmClear && (
          <div className="modalOverlay">
            <div className="staffModal">
              <div className="modalTitle">確認清空今日 queue？</div>
              <div className="modalText">這會刪除今天所有排隊號碼與訂單紀錄，通常用在一天營業結束之後。</div>
              <div className="modalActions">
                <button className="outlineModalBtn" onClick={() => setConfirmClear(false)}>取消</button>
                <button className="dangerModalBtn" onClick={clearQueue}>確認清空</button>
              </div>
            </div>
          </div>
        )}

        {showTodaySummary && (
          <div className="modalOverlay">
            <div className="staffModal" style={{ width: 'min(760px, 100%)', maxHeight: '85vh', overflow: 'auto' }}>
              <div className="modalTitle">今日點餐數量</div>
              {!todaySummary.length && <div className="modalText">今日尚無點餐紀錄。</div>}
              {todaySummary.map((item) => (
                <div key={item.id || item.name} className="orderCard" style={{ marginBottom: 12 }}>
                  <div className="orderName">{item.name}</div>
                  <div className="orderOptions" style={{ marginTop: 8 }}>
                    今日點餐數量：{item.quantity}
                  </div>
                </div>
              ))}
              <div className="modalActions" style={{ gridTemplateColumns: '1fr' }}>
                <button className="outlineModalBtn" onClick={() => setShowTodaySummary(false)}>關閉</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
