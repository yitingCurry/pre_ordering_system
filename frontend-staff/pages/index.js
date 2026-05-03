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

  async function applyCallResponse(data, label) {
    if (data.message) {
      setMessage(data.message);
      await loadQueue();
      setOrder(null);
      setSelectedQueueId(null);
      setSelectedQueueNumber(null);
      return;
    }
    if (data.error) {
      setMessage(data.error);
      await loadQueue();
      return;
    }
    setMessage(label);
    await loadQueue();
    setSelectedQueueId(data.id);
    setSelectedQueueNumber(data.number);
    setOrder(null);
    await loadOrder(data.id, data.number);
  }

  async function callNext() {
    try {
      const res = await fetch(`${API}/queue/next`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '叫號失敗');
        await loadQueue();
        return;
      }
      await applyCallResponse(data, '已叫下一號');
    } catch {
      setMessage('叫號失敗');
    }
  }

  async function callQueueById(queueId) {
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/call`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '叫號失敗');
        await loadQueue();
        return;
      }
      await applyCallResponse(data, `已叫號碼 ${data.number}`);
    } catch {
      setMessage('叫號失敗');
    } finally {
      setActionLoadingId(null);
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
    const timer = setInterval(loadQueue, 3000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="page">
      <div className="container">
        <div className="topbar">
          <div>
            <div className="topTitle">櫃台店員端</div>
            <div className="topSub">查看隊列與預點餐草稿，協助現場手寫點單</div>
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
        </div>
        {message && <div className="card" style={{ color: '#92400e' }}>{message}</div>}

        <div className="layout">
          <div className="col">
            <h2 className="sectionTitle">隊列清單</h2>
            <div className="muted" style={{ marginBottom: 12 }}>點選號碼即可查看該客人的預點餐草稿。</div>
            {queueData.queue.map((item) => {
              const isCalled = item.status === 'called';
              const isWaiting = item.status === 'waiting';
              const calledActionDisabled = !isCalled || actionLoadingId === item.id;
              const waitingBusy = actionLoadingId === item.id;
              const party = item.partySize != null && item.partySize > 0 ? item.partySize : 1;
              return (
                <div key={item.id} className="queueItem" onClick={() => loadOrder(item.id, item.number)}>
                  <div className="queueInfo">
                    <div className="queueTop">
                      <span>號碼 {item.number}</span>
                      <span className="queueHint">{party} 人</span>
                    </div>
                    <div className="queueRow">
                      <span className={`statusTag ${item.status}`}>{item.status === 'waiting' ? '等待中' : item.status === 'called' ? '已叫號' : item.status === 'skipped' ? '已過號' : item.status === 'seated' ? '已入座' : '完成'}</span>
                    </div>
                  </div>
                  {isWaiting && (
                    <div className="queueActions queueActionsRow">
                      <button
                        type="button"
                        className="actionBtn callBtn"
                        disabled={isCallNextDisabled || waitingBusy}
                        onClick={(e) => { e.stopPropagation(); callQueueById(item.id); }}
                      >叫此號</button>
                      <button
                        type="button"
                        className="actionBtn skipBtn"
                        disabled={waitingBusy}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (!window.confirm('確認將此「等待中」號碼設為過號？')) return;
                          updateQueueStatus(item.id, 'skip');
                        }}
                      >過號</button>
                    </div>
                  )}
                  {isCalled && (
                    <div className="queueActions">
                      <button
                        type="button"
                        className="actionBtn skipBtn"
                        disabled={calledActionDisabled}
                        onClick={(e) => { e.stopPropagation(); updateQueueStatus(item.id, 'skip'); }}
                      >過號</button>
                      <button
                        type="button"
                        className="actionBtn seatBtn"
                        disabled={calledActionDisabled}
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
            {selectedQueueId && !order && <div className="muted">這位客人尚未預點餐。</div>}
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
                <div className="tip">此頁面只供櫃台參考，實際出單仍由店員手寫。</div>
              </div>
            )}
          </div>
        </div>

        {confirmClear && (
          <div className="modalOverlay">
            <div className="staffModal">
              <div className="modalTitle">確認清空今日 queue？</div>
              <div className="modalText">這會刪除今天所有排隊號碼與預點餐草稿，通常用在一天營業結束之後。</div>
              <div className="modalActions">
                <button className="outlineModalBtn" onClick={() => setConfirmClear(false)}>取消</button>
                <button className="dangerModalBtn" onClick={clearQueue}>確認清空</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
