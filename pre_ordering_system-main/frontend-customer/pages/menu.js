import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const menu = [
  { id: 'milk-tea', name: '港式奶茶', desc: '招牌熱飲', price: 45, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜', '無糖'] },
  { id: 'lemon-tea', name: '凍檸茶', desc: '清爽解膩', price: 50, page: '飲品', categories: ['飲品'], variants: ['少冰', '正常冰'], options: ['少甜', '正常甜'] },
  { id: 'yuanyang', name: '鴛鴦', desc: '咖啡加奶茶', price: 55, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜'] },
  { id: 'pineapple-bun', name: '菠蘿包', desc: '經典茶餐廳必點', price: 35, page: '麵包小食', categories: ['麵包'], variants: ['原味', '加牛油'], options: ['正常'] },
  { id: 'french-toast', name: '西多士', desc: '甜食派最愛', price: 55, page: '麵包小食', categories: ['小食'], variants: ['花生醬', '煉奶'], options: ['切半', '正常'] },
  { id: 'egg-tart', name: '蛋撻', desc: '熱賣點心', price: 30, page: '麵包小食', categories: ['點心'], variants: ['原味', '酥皮'], options: ['正常'] },
  { id: 'instant-noodle', name: '餐肉公仔麵', desc: '快速又飽足', price: 75, page: '主食', categories: ['主食'], variants: ['湯麵', '撈麵'], options: ['加蛋', '走蔥'] },
  { id: 'beef-noodle', name: '沙嗲牛肉公仔麵', desc: '重口味熱門主食', price: 88, page: '主食', categories: ['主食'], variants: ['湯麵', '撈麵'], options: ['加蛋', '走蔥'] },
  { id: 'baked-rice', name: '焗豬扒飯', desc: '經典港式焗飯', price: 105, page: '主食', categories: ['主食'], variants: ['茄汁', '白汁'], options: ['加芝士'] }
];

const pages = ['飲品', '麵包小食', '主食'];

function getDeviceToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('deviceToken') || '';
}

export default function Menu() {
  const [queue, setQueue] = useState(null);
  const [selected, setSelected] = useState({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');
  const [saveState, setSaveState] = useState('idle');
  const [savedSummary, setSavedSummary] = useState('');
  const [activePage, setActivePage] = useState('飲品');
  const [showConfirm, setShowConfirm] = useState(false);
  const [orderingEnabled, setOrderingEnabled] = useState(true);
  const router = useRouter();

  const currentMenu = useMemo(() => menu.filter((item) => item.page === activePage), [activePage]);

  const subtotal = useMemo(() => Object.entries(selected).reduce((sum, [id, value]) => {
    const item = menu.find((m) => m.id === id);
    return sum + ((item?.price || 0) * (value.quantity || 1));
  }, 0), [selected]);

  const itemCount = useMemo(() => Object.values(selected).reduce((sum, item) => sum + (item.quantity || 1), 0), [selected]);

  const confirmItems = useMemo(() => Object.entries(selected).map(([id, value]) => {
    const item = menu.find((m) => m.id === id);
    return {
      id,
      name: value.name,
      quantity: value.quantity || 1,
      category: value.category || '',
      variant: value.variant || '',
      options: value.options || [],
      price: (item?.price || 0) * (value.quantity || 1)
    };
  }), [selected]);

  function applyExistingOrder(order) {
    if (!order) return;
    const next = {};
    order.items.forEach((item) => {
      next[item.id] = {
        name: item.name,
        quantity: item.quantity || 1,
        variant: item.variant || '',
        category: item.category || '',
        options: item.options || []
      };
    });
    setSelected(next);
    setNote(order.note || '');
    setSavedSummary(`已載入你先前的草稿，共 ${order.items.length} 種、${order.items.reduce((s, i) => s + (i.quantity || 1), 0)} 份。`);
  }

  async function loadMyState() {
    const token = getDeviceToken();
    if (!token) return;
    try {
      const res = await fetch(`${API}/customer-state/${token}`);
      const data = await res.json();
      setQueue(data.activeQueue || null);
      applyExistingOrder(data.order);
      if (!data.activeQueue) setMessage('請先取號後再建立預選餐點。');
    } catch {
      setMessage('目前無法載入你的資料。');
    }
  }

  async function loadOrderingStatus() {
    try {
      const res = await fetch(`${API}/ordering-status`);
      const data = await res.json();
      if (res.ok) setOrderingEnabled(!!data.orderingEnabled);
    } catch {
      // fallback to default behavior
    }
  }

  function toggleItem(item) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[item.id]) delete next[item.id];
      else next[item.id] = {
        name: item.name,
        quantity: 1,
        category: item.categories[0] || '',
        variant: item.variants[0] || '',
        options: []
      };
      return next;
    });
  }

  function updateQuantity(itemId, diff) {
    setSelected((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      const quantity = Math.max(1, (current.quantity || 1) + diff);
      return { ...prev, [itemId]: { ...current, quantity } };
    });
  }

  function updateField(item, field, value) {
    setSelected((prev) => {
      const current = prev[item.id] || {
        name: item.name,
        quantity: 1,
        category: item.categories[0] || '',
        variant: item.variants[0] || '',
        options: []
      };
      return { ...prev, [item.id]: { ...current, [field]: value } };
    });
  }

  function toggleOption(item, option) {
    setSelected((prev) => {
      const current = prev[item.id] || {
        name: item.name,
        quantity: 1,
        category: item.categories[0] || '',
        variant: item.variants[0] || '',
        options: []
      };
      const exists = current.options.includes(option);
      const options = exists ? current.options.filter((o) => o !== option) : [...current.options, option];
      return { ...prev, [item.id]: { ...current, options } };
    });
  }

  function openConfirm() {
    if (!queue?.id) return setMessage('請先回首頁取號');
    if (!confirmItems.length) return setMessage('請至少選擇一項餐點');
    setShowConfirm(true);
  }

  async function submitOrder() {
    if (!queue?.id) return setMessage('請先回首頁取號');
    const items = Object.entries(selected).map(([id, value]) => ({ id, ...value }));
    if (!items.length) return setMessage('請至少選擇一項餐點');

    setSaveState('saving');
    setMessage('');
    try {
      const res = await fetch(`${API}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ queueId: queue.id, items, note })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '儲存失敗');
      applyExistingOrder(data);
      setSaveState('saved');
      setSavedSummary(`已確認 ${data.items.length} 種餐點，共 ${data.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} 份。`);
      setShowConfirm(false);
      router.push('/');
    } catch {
      setSaveState('error');
      setMessage('儲存失敗，請稍後再試');
      setShowConfirm(false);
    }
  }

  useEffect(() => {
    loadMyState();
    loadOrderingStatus();
  }, []);

  return (
    <div className="customerPage">
      <div className="mobileShell">
        <div className="topNav withBack">
          <button className="backBtn" onClick={() => router.push('/')}>‹</button>
          <div>
            <div className="miniBrand">Step 2</div>
            <div className="screenTitle">{orderingEnabled ? '訂單資訊' : '菜單資訊'}</div>
          </div>
          <div className="navAction">{orderingEnabled ? '可修改' : '僅觀看'}</div>
        </div>

        <div className="statusPanel light">
          <div className="statusLabel">你的取號資訊</div>
          <div className="ticketRow">
            <div className="ticketNo">{queue?.number || '--'}</div>
            <div>
              <div className="ticketMain">{queue ? `狀態：${queue.status === 'called' ? '已叫號' : queue.status === 'waiting' ? '等待中' : '已完成'}` : '尚未取號'}</div>
              <div className="ticketSub">已送出的訂單會綁定這張號碼</div>
            </div>
          </div>
        </div>

        <div className="categoryTabs pageTabs">
          {pages.map((page) => (
            <button key={page} type="button" className={`catTab ${activePage === page ? 'active' : ''}`} onClick={() => setActivePage(page)}>{page}</button>
          ))}
        </div>

        

        {currentMenu.map((item) => (
          <div key={item.id} className="foodCard">
            <label className="foodTop">
              {orderingEnabled && (
                <input type="checkbox" checked={!!selected[item.id]} onChange={() => toggleItem(item)} />
              )}
              <div className="foodInfo">
                <div className="foodName">{item.name}</div>
                <div className="foodDesc">{item.desc}</div>
              </div>
              <div className="foodPrice">${item.price}</div>
            </label>

            {orderingEnabled && !!selected[item.id] && (
              <div className="configPanel">
                <div className="controlRow">
                  <div className="controlLabel">數量</div>
                  <div className="qtyBox">
                    <button type="button" className="qtyBtn" onClick={() => updateQuantity(item.id, -1)}>-</button>
                    <div className="qtyValue">{selected[item.id].quantity || 1}</div>
                    <button type="button" className="qtyBtn" onClick={() => updateQuantity(item.id, 1)}>+</button>
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">種類</div>
                  <div className="selectorRow">
                    {item.categories.map((category) => (
                      <button key={category} type="button" className={`selectChip ${selected[item.id].category === category ? 'active' : ''}`} onClick={() => updateField(item, 'category', category)}>{category}</button>
                    ))}
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">規格</div>
                  <div className="selectorRow">
                    {item.variants.map((variant) => (
                      <button key={variant} type="button" className={`selectChip ${selected[item.id].variant === variant ? 'active' : ''}`} onClick={() => updateField(item, 'variant', variant)}>{variant}</button>
                    ))}
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">加料 / 偏好</div>
                  <div className="optionGrid clean">
                    {item.options.map((option) => (
                      <label key={option} className="chip orange">
                        <input type="checkbox" checked={selected[item.id]?.options.includes(option) || false} onChange={() => toggleOption(item, option)} />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        {orderingEnabled && (
          <textarea className="textarea modern" placeholder="備註（例如：少冰、先做飲品）" value={note} onChange={(e) => setNote(e.target.value)} />
        )}
        {message && <div className={message.includes('失敗') || message.includes('請') || message.includes('無法') ? 'alertError' : 'alertOk'}>{message}</div>}

        {orderingEnabled && (
          <div className="checkoutBar">
            <div>
              <div className="checkoutLabel">共 {itemCount} 份</div>
              <div className="checkoutValue">${subtotal}</div>
            </div>
            <button className="orangeBtn small" onClick={openConfirm} disabled={saveState === 'saving'}>
              {saveState === 'saving' ? '儲存中...' : '確認餐點'}
            </button>
          </div>
        )}

        {orderingEnabled && showConfirm && (
          <div className="modalOverlay">
            <div className="confirmModal">
              <div className="modalTitle">確認目前點餐內容</div>
              <div className="confirmList">
                {confirmItems.map((item) => (
                  <div key={item.id} className="confirmItem">
                    <div className="confirmName">{item.name} × {item.quantity}</div>
                    <div className="confirmMeta">種類：{item.category || '未填'}｜規格：{item.variant || '未填'}</div>
                    <div className="confirmMeta">{item.options.length ? item.options.join('、') : '無其他偏好'}</div>
                  </div>
                ))}
              </div>
              <div className="confirmNote">備註：{note || '無'}</div>
              <div className="confirmTotal">總計：${subtotal}</div>
              <div className="modalActions">
                <button type="button" className="outlineBtn modalBtn" onClick={() => setShowConfirm(false)}>返回修改</button>
                <button type="button" className="orangeBtn modalBtn" onClick={submitOrder}>確認送出</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
