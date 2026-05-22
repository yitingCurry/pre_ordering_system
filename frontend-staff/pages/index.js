import { useEffect, useState } from 'react';

function getApiBase() {
  const configured = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (configured) return configured.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return 'http://localhost:8000';
  return '';
}

const API = getApiBase();

const partyCategories = [
  { label: '1–2 位', key: '1-2' },
  { label: '3–4 位', key: '3-4' },
  { label: '5–6 位', key: '5-6' },
  { label: '7 位以上', key: '7+' },
];

function statusLabel(status) {
  if (status === 'waiting') return '等待中';
  if (status === 'called') return '已叫號';
  if (status === 'skipped') return '已過號';
  if (status === 'seated') return '已入座';
  return '完成';
}

function partyOf(item) {
  return item.partySize != null && item.partySize > 0 ? item.partySize : 1;
}

export default function Staff() {
  const [queueData, setQueueData] = useState({ queue: [], current: null, waitingCount: 0, seatedCount: 0, doneToday: 0 });
  const [selectedQueueId, setSelectedQueueId] = useState(null);
  const [selectedQueueNumber, setSelectedQueueNumber] = useState(null);
  const [order, setOrder] = useState(null);
  const [message, setMessage] = useState(API ? '' : '目前尚未設定後端 API 網址，請先設定 NEXT_PUBLIC_API_URL。');
  const [confirmClear, setConfirmClear] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [feedbackItems, setFeedbackItems] = useState([]);

  const isCallNextDisabled = actionLoadingId !== null;

  function ratingClass(rating) {
    if (rating === 'good') return 'good';
    if (rating === 'bad') return 'bad';
    return 'ok';
  }

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
    if (data.message) { setMessage(data.message); await loadQueue(); setOrder(null); setSelectedQueueId(null); setSelectedQueueNumber(null); return; }
    if (data.error) { setMessage(data.error); await loadQueue(); return; }
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
      if (!res.ok) { setMessage(data.error || '叫號失敗'); await loadQueue(); return; }
      if (data.message) { setMessage(data.message); await loadQueue(); return; }
      await applyCallResponse(data, `已叫 ${partyCategories.find((c) => c.key === category)?.label || ''} 下一號`);
    } catch { setMessage('叫號失敗'); }
    finally { setActionLoadingId(null); }
  }

  async function callQueueById(queueId) {
    if (!API) { setMessage('尚未設定後端 API 網址，暫時無法叫號。'); return; }
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/call`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || '叫號失敗'); await loadQueue(); return; }
      await applyCallResponse(data, `已叫號碼 ${data.number}`);
    } catch { setMessage('叫號失敗'); }
    finally { setActionLoadingId(null); }
  }

  async function clearQueue() {
    if (!API) { setMessage('尚未設定後端 API 網址，暫時無法清空 queue。'); setConfirmClear(false); return; }
    try {
      const res = await fetch(`${API}/queue/clear`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '清空失敗');
      setMessage(data.message || '已清空今日 queue');
      setOrder(null); setSelectedQueueId(null); setSelectedQueueNumber(null); setConfirmClear(false);
      await loadQueue();
    } catch { setMessage('清空 queue 失敗'); setConfirmClear(false); }
  }

  async function guestLeft(queueId, queueNumber) {
    if (!API) { setMessage('尚未設定後端 API 網址，暫時無法操作。'); return; }
    if (!window.confirm(`確認號碼 ${queueNumber} 已離開？\n將停止用餐時間提醒，並透過 LINE 發送回饋問卷（若已綁定）。`)) return;
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/leave`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '結束用餐失敗');
      if (data.feedbackSent) setMessage(`號碼 ${data.number} 已結束用餐，已發送 LINE 回饋問卷。`);
      else if (data.feedbackSkipped) setMessage(`號碼 ${data.number} 已結束用餐（客人先前已提交回饋）。`);
      else if (!data.lineUserId) setMessage(`號碼 ${data.number} 已結束用餐（未綁定 LINE，無法發送回饋）。`);
      else setMessage(`號碼 ${data.number} 已結束用餐（回饋訊息發送失敗，請稍後再試）。`);
      await loadQueue();
      if (selectedQueueId === queueId) setSelectedQueueNumber(data.number);
    } catch (e) { setMessage(e.message || '結束用餐失敗'); }
    finally { setActionLoadingId(null); }
  }

  async function updateQueueStatus(queueId, action) {
    if (!API) { setMessage('尚未設定後端 API 網址，暫時無法更新狀態。'); return; }
    setActionLoadingId(queueId);
    try {
      const res = await fetch(`${API}/queue/${queueId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} 失敗`);
      await loadQueue();
      if (action === 'skip' && selectedQueueId === queueId) { setSelectedQueueId(null); setSelectedQueueNumber(null); setOrder(null); }
      else if (selectedQueueId === queueId) setSelectedQueueNumber(data.number);
    } catch (e) { setMessage(e.message || '狀態更新失敗'); }
    finally { setActionLoadingId(null); }
  }

  async function loadFeedback() {
    if (!API) return;
    try {
      const res = await fetch(`${API}/feedback/today`);
      if (!res.ok) return;
      const data = await res.json();
      setFeedbackItems(data.items || []);
    } catch {
      setFeedbackItems([]);
    }
  }

  async function loadOrder(queueId, queueNumber) {
    if (!API) return;
    setSelectedQueueId(queueId);
    setSelectedQueueNumber(queueNumber);
    try {
      const res = await fetch(`${API}/order/${queueId}`);
      if (!res.ok) { setOrder(null); return; }
      setOrder(await res.json());
    } catch { setOrder(null); }
  }

  useEffect(() => {
    if (!API) return;
    loadQueue();
    loadFeedback();
    const timer = setInterval(() => {
      loadQueue();
      loadFeedback();
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const categoryQueues = partyCategories.map((cat) => ({
    ...cat,
    items: queueData.queue.filter((item) => {
      const p = partyOf(item);
      if (cat.key === '1-2') return p <= 2;
      if (cat.key === '3-4') return p >= 3 && p <= 4;
      if (cat.key === '5-6') return p >= 5 && p <= 6;
      return p >= 7;
    }),
  }));

  const seatedCount = queueData.queue.filter((i) => i.status === 'seated').length;
  const orderSubtotal = order
    ? order.items.reduce((sum, item) => {
        const found = /* menu lookup removed for brevity — replace with your menu import */ null;
        return sum + (found ? found.price * (item.quantity || 1) : 0);
      }, 0)
    : 0;

  return (
    <div className="page">
      <div className="container">

        {/* ── Topbar ── */}
        <div className="topbar">
          <div>
            <div className="topSub">港式茶餐廳 · 店員端</div>
            <div className="topTitle">排隊 & 點餐管理</div>
          </div>
          <div className="liveBadge">
            <span className="liveDot" />
            即時更新中
          </div>
        </div>

        {/* ── Metrics ── */}
        <div className="metrics">
          <div className="card">
            <div className="metricLabel">目前叫號</div>
            <div className="metricValue">{queueData.current ? queueData.current.number : '—'}</div>
          </div>
          <div className="card">
            <div className="metricLabel">等待中</div>
            <div className="metricValue">{queueData.waitingCount}<span className="metricUnit">組</span></div>
          </div>
          <div className="card">
            <div className="metricLabel">已入座</div>
            <div className="metricValue">{seatedCount}<span className="metricUnit">桌</span></div>
          </div>
          <div className="card">
            <div className="metricLabel">今日完成</div>
            <div className="metricValue">{queueData.doneToday ?? '—'}<span className="metricUnit">組</span></div>
          </div>
        </div>

        {/* ── Call buttons ── */}
        <div className="staffActions">
          {partyCategories.map((cat) => (
            <button
              key={cat.key}
              className="dangerBtn"
              onClick={() => callNextByCategory(cat.key)}
              disabled={isCallNextDisabled}
            >
              <span className="btnIcon">📢</span>
              叫 {cat.label}
            </button>
          ))}
          <button className="clearBtn" onClick={() => setConfirmClear(true)}>清空今日列隊</button>
        </div>

        {message && <div className="alertMsg">{message}</div>}

        {/* ── Main layout ── */}
        <div className="layout">

          {/* Left: queue list */}
          <div className="col">
            <div className="colHeader">
              <div className="sectionTitle">隊列清單</div>
              <span className="colHeaderSub">點選號碼查看預點餐</span>
            </div>
            <div className="queueList">
              {categoryQueues.map((cat) => (
                <div key={cat.key}>
                  <div className="catLabel">{cat.label}</div>
                  {cat.items.length === 0 && (
                    <div className="muted" style={{ padding: '6px 4px 10px', fontSize: 12 }}>目前無號碼</div>
                  )}
                  {cat.items.map((item) => {
                    const isCalled = item.status === 'called';
                    const isSeated = item.status === 'seated';
                    const busy = actionLoadingId === item.id;
                    return (
                      <div
                        key={item.id}
                        className={`queueItem${selectedQueueId === item.id ? ' active' : ''}`}
                        onClick={() => loadOrder(item.id, item.number)}
                      >
                        <div className="queueInfo">
                          <div className="queueTop">{item.number}</div>
                          <div>
                            <div className="queueSubtitle">{item.hasOrder ? '有預點餐' : '未預點餐'}</div>
                            <div className="queueMeta">{partyOf(item)} 人</div>
                          </div>
                        </div>
                        <div className="queueRight">
                          <span className={`statusTag ${item.status}`}>{statusLabel(item.status)}</span>
                          {isCalled && (
                            <div className="queueActions">
                              <button
                                className="actionBtn skipBtn"
                                disabled={busy}
                                onClick={(e) => { e.stopPropagation(); updateQueueStatus(item.id, 'skip'); }}
                              >過號</button>
                              <button
                                className="actionBtn seatBtn"
                                disabled={busy}
                                onClick={(e) => { e.stopPropagation(); updateQueueStatus(item.id, 'seat'); }}
                              >確認入座</button>
                            </div>
                          )}
                          {isSeated && (
                            <div className="queueActions">
                              <button
                                className="actionBtn leaveBtn"
                                disabled={busy}
                                onClick={(e) => { e.stopPropagation(); guestLeft(item.id, item.number); }}
                              >客人已離開</button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Right: order detail */}
          <div className="col">
            <div className="colHeader">
              <div className="sectionTitle">預點餐內容</div>
              {selectedQueueNumber && <span className={`statusTag called`}>號碼 {selectedQueueNumber}</span>}
            </div>
            <div className="orderPanel">
              {!selectedQueueId && (
                <div className="emptyState">尚未選擇號碼</div>
              )}
              {selectedQueueId && !order && (
                <div className="emptyState">這位客人尚未預點餐</div>
              )}
              {order && (
                <>
                  <div className="orderItems">
                    {order.items.map((item, idx) => (
                      <div className="orderItem" key={idx}>
                        <div>
                          <div className="orderName">
                            {item.name}<span className="orderQty">× {item.quantity || 1}</span>
                          </div>
                          <div className="orderOptions">
                            規格：{item.variant || '未填'}
                            {item.options?.length ? `｜${item.options.join('、')}` : ''}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="noteBox">
                    <span className="noteLabel">備註：</span>{order.note || '無'}
                  </div>
                  <div className="tip">此頁僅供參考，實際出單仍由店員手寫。客人入座後仍可加點。</div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ── Today's feedback ── */}
        <section className="feedbackSection">
          <div className="feedbackHeader">
            <div className="sectionTitle">今日回饋</div>
            <span className="feedbackCount">{feedbackItems.length} 則</span>
          </div>
          {feedbackItems.length === 0 && (
            <div className="feedbackEmpty">今日尚無客人回饋</div>
          )}
          {feedbackItems.length > 0 && (
            <div className="feedbackList">
              {feedbackItems.map((item) => (
                <div className="feedbackRow" key={item.id}>
                  <div className="feedbackRowTop">
                    <span className="feedbackNumber">號碼 {item.queueNumber}</span>
                    <span className={`feedbackBadge${item.complete ? ' done' : ''}`}>
                      {item.complete ? (item.comment ? '已留言' : '已完成') : '填寫中'}
                    </span>
                  </div>
                  <div className="feedbackRatings">
                    <span className={`fbChip ${ratingClass(item.rating)}`}>整體 {item.ratingLabel || '—'}</span>
                    <span className={`fbChip ${ratingClass(item.rating_wait)}`}>等候 {item.ratingWaitLabel || '—'}</span>
                    <span className={`fbChip ${ratingClass(item.rating_food)}`}>餐點 {item.ratingFoodLabel || '—'}</span>
                    <span className={`fbChip ${ratingClass(item.rating_service)}`}>服務 {item.ratingServiceLabel || '—'}</span>
                  </div>
                  {item.comment && (
                    <div className="feedbackComment">「{item.comment.length > 120 ? `${item.comment.slice(0, 120)}…` : item.comment}」</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Clear confirm modal ── */}
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