import { useEffect, useState } from 'react';

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

export default function Staff() {
  const [queueData, setQueueData] = useState({ queue: [], current: null, waitingCount: 0 });
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [selectedQueueNumber, setSelectedQueueNumber] = useState(null);
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useState(API ? '' : '目前尚未設定後端 API 網址，請先設定 NEXT_PUBLIC_API_URL。');
  const [confirmClear, setConfirmClear] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  

  const partyCategories = [
    { label: '1-2位', key: '1-2' },
    { label: '3-4位', key: '3-4' },
    { label: '5-6位', key: '5-6' },
    { label: '7位以上', key: '7+' },
  ];

  const isCallNextDisabled = (actionLoadingId !== null);

  async function loadQueue() {
    if (!API) return;
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

  async function callNextByCategory(category) {
    try {
      setActionLoadingId(`category-${category}`);
      const res = await fetch(`${API}/queue/next?category=${encodeURIComponent(category)}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || '叫號失敗');
        await loadQueue();
        return;
      }
      if (data.message) {
        setMessage(data.message);
        await loadQueue();
        return;
      }
      await applyCallResponse(data, `已叫 ${partyCategories.find((item) => item.key === category)?.label || ''} 下一號`);
    } catch {
      setMessage('叫號失敗');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function callQueueById(queueId) {
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法叫號。');
      return;
    }
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
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法清空 queue。');
      setConfirmClear(false);
      return;
    }
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

  async function guestLeft(queueId, queueNumber) {
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法操作。');
      return;
    }
    if (!window.confirm(`確認號碼 ${queueNumber} 已離開？\n將停止用餐時間提醒，並透過 LINE 發送回饋問卷（若已綁定）。`)) {
      return;
    }
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/leave`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '結束用餐失敗');
      if (data.feedbackSent) {
        setMessage(`號碼 ${data.number} 已結束用餐，已發送 LINE 回饋問卷。`);
      } else if (data.feedbackSkipped) {
        setMessage(`號碼 ${data.number} 已結束用餐（客人先前已提交回饋）。`);
      } else if (!data.lineUserId) {
        setMessage(`號碼 ${data.number} 已結束用餐（未綁定 LINE，無法發送回饋）。`);
      } else {
        setMessage(`號碼 ${data.number} 已結束用餐（回饋訊息發送失敗，請稍後再試）。`);
      }
      await loadQueue();
      if (selectedQueueId === queueId) {
        setSelectedQueueNumber(data.number);
      }
    } catch (e) {
      setMessage(e.message || '結束用餐失敗');
    } finally {
      setActionLoadingId(null);
    }
  }

  async function updateQueueStatus(queueId, action) {
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法更新狀態。');
      return;
    }
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
    if (!API) return;
    setSelectedQueueId(queueId);
    setSelectedQueueNumber(queueNumber);
    try {
      const res = await fetch(`${API}/order/${queueId}`);
      if (!res.ok) {
        setOrder(null);
        return;
      }
      const data = await res.json();
      setOrder(data);
    } catch {
      setOrder(null);
    }
  }

  useEffect(() => {
    if (!API) return;
    loadQueue();
    const timer = setInterval(loadQueue, 3000);
    return () => clearInterval(timer);
  }, []);

  const categoryQueues = partyCategories.map((category) => ({
    ...category,
    items: queueData.queue.filter((item) => {
      const party = item.partySize != null && item.partySize > 0 ? item.partySize : 1;
      if (category.key === '1-2') return party <= 2;
      if (category.key === '3-4') return party >= 3 && party <= 4;
      if (category.key === '5-6') return party >= 5 && party <= 6;
      return party >= 7;
    }),
  }));

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
          {partyCategories.map((category) => (
            <button
              key={category.key}
              className="dangerBtn"
              onClick={() => callNextByCategory(category.key)}
              disabled={isCallNextDisabled || actionLoadingId === `category-${category.key}`}
            >
              叫 {category.label}
            </button>
          ))}
          <button className="clearBtn" onClick={() => setConfirmClear(true)}>清空今日列隊清單</button>
        </div>
        {message && <div className="card" style={{ color: '#92400e' }}>{message}</div>}

        <div className="layout">
          <div className="col">
            <h2 className="sectionTitle">隊列清單</h2>
            <div className="muted" style={{ marginBottom: 12 }}>點選號碼即可查看該客人的預點餐草稿。</div>
            {categoryQueues.map((category) => (
              <div key={category.key} style={{ marginBottom: 22 }}>
                <div className="sectionTitle" style={{ fontSize: 18, marginBottom: 10 }}>{category.label}</div>
                {category.items.length === 0 && <div className="muted">目前無等待中號碼。</div>}
                {category.items.map((item) => {
                  const isCalled = item.status === 'called';
                  const isWaiting = item.status === 'waiting';
                  const isSeated = item.status === 'seated';
                  const calledActionDisabled = !isCalled || actionLoadingId === item.id;
                  const seatedBusy = actionLoadingId === item.id;
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
                        <div className="queueActions queueActionsRow" />
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
                      {isSeated && (
                        <div className="queueActions">
                          <button
                            type="button"
                            className="actionBtn leaveBtn"
                            disabled={seatedBusy}
                            onClick={(e) => { e.stopPropagation(); guestLeft(item.id, item.number); }}
                          >客人已離開</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
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
