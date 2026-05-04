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

const menu = [
  { id: 'signature-milk-tea', name: '招牌奶茶', desc: '港式經典熱飲', price: 36, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜', '無糖'] },
  { id: 'hk-red-tea', name: '港式紅茶', desc: '茶香濃厚', price: 32, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜', '無糖'] },
  { id: 'yuanyang', name: '鴛鴦', desc: '咖啡加奶茶', price: 38, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜'] },
  { id: 'lemon-tea', name: '檸檬茶', desc: '清爽解膩', price: 34, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['少甜', '正常甜'] },
  { id: 'ovaltine', name: '阿華田', desc: '經典麥芽可可', price: 36, page: '飲品', categories: ['飲品'], variants: ['熱飲', '凍飲'], options: ['正常甜', '少甜'] },
  { id: 'lemon-coke', name: '檸檬可樂', desc: '汽水系飲品', price: 36, page: '飲品', categories: ['飲品'], variants: ['正常冰'], options: ['少冰', '正常冰'] },
  { id: 'red-bean-ice', name: '紅豆冰', desc: '港式冰飲甜品', price: 40, page: '飲品', categories: ['飲品'], variants: ['正常冰'], options: ['少冰', '正常冰'] },

  { id: 'company-sandwich', name: '公司三文治', desc: '港式茶餐廳常見輕食', price: 48, page: '小食甜品', categories: ['三文治'], variants: ['原味'], options: ['切半', '正常'] },
  { id: 'luncheon-meat-egg-sandwich', name: '餐肉蛋三文治', desc: '經典港式三文治', price: 42, page: '小食甜品', categories: ['三文治'], variants: ['原味'], options: ['切半', '正常'] },
  { id: 'french-toast', name: '法蘭西多士', desc: '甜食人氣款', price: 42, page: '小食甜品', categories: ['多士'], variants: ['花生醬', '煉奶'], options: ['正常'] },
  { id: 'cream-toast', name: '鮮奶油多士', desc: '簡單經典', price: 30, page: '小食甜品', categories: ['多士'], variants: ['原味'], options: ['正常'] },
  { id: 'peanut-milk-toast', name: '花生奶醬多士', desc: '甜香濃郁', price: 34, page: '小食甜品', categories: ['多士'], variants: ['原味'], options: ['正常'] },
  { id: 'hk-turnip-cake', name: '港式蘿蔔糕', desc: '茶餐廳小食', price: 36, page: '小食甜品', categories: ['小食'], variants: ['香煎'], options: ['正常'] },
  { id: 'siu-mai', name: '港式燒賣', desc: '人氣蒸點', price: 35, page: '小食甜品', categories: ['小食'], variants: ['原味'], options: ['正常'] },
  { id: 'mango-pudding', name: '芒果布丁', desc: '飯後甜品', price: 42, page: '小食甜品', categories: ['甜品'], variants: ['冰'], options: ['正常'] },
  { id: 'yangzhi-ganlu', name: '楊枝甘露', desc: '經典港式甜品', price: 48, page: '小食甜品', categories: ['甜品'], variants: ['冰'], options: ['正常'] },
  { id: 'herbal-jelly', name: '龜苓膏', desc: '港式涼品', price: 40, page: '小食甜品', categories: ['甜品'], variants: ['原味'], options: ['正常'] },

  { id: 'hk-fried-noodle', name: '港式炒麵', desc: '招牌炒粉麵飯類', price: 88, page: '主食', categories: ['炒粉麵飯'], variants: ['炒麵'], options: ['加蛋', '走蔥'] },
  { id: 'beef-fried-noodle', name: '牛肉炒麵', desc: '經典港式炒麵', price: 96, page: '主食', categories: ['炒粉麵飯'], variants: ['炒麵'], options: ['加蛋', '走蔥'] },
  { id: 'dry-fried-beef-ho-fun', name: '乾炒牛河', desc: '茶餐廳招牌', price: 98, page: '主食', categories: ['炒粉麵飯'], variants: ['炒河粉'], options: ['加底', '正常'] },
  { id: 'yangzhou-fried-rice', name: '揚州炒飯', desc: '經典炒飯', price: 92, page: '主食', categories: ['炒粉麵飯'], variants: ['炒飯'], options: ['加蛋', '正常'] },
  { id: 'salted-fish-chicken-fried-rice', name: '鹹魚雞粒炒飯', desc: '港式風味炒飯', price: 94, page: '主食', categories: ['炒粉麵飯'], variants: ['炒飯'], options: ['加蛋', '正常'] },
  { id: 'fujian-fried-rice', name: '福建炒飯', desc: '醬汁燴炒飯', price: 102, page: '主食', categories: ['燴飯'], variants: ['燴飯'], options: ['正常'] },
  { id: 'curry-beef-rice', name: '咖哩牛肉飯', desc: '人氣飯類', price: 98, page: '主食', categories: ['燴飯'], variants: ['飯'], options: ['加蛋', '正常辣'] },
  { id: 'black-pepper-chicken-rice', name: '黑椒雞排飯', desc: '濃味主食', price: 102, page: '主食', categories: ['燴飯'], variants: ['飯'], options: ['加蛋', '正常辣'] },
  { id: 'xo-beef-fried-instant-noodle', name: 'XO牛肉炒公仔麵', desc: '本店特別推薦', price: 96, page: '主食', categories: ['炒公仔麵'], variants: ['炒公仔麵'], options: ['加蛋', '走蔥'] },
  { id: 'satay-beef-fried-instant-noodle', name: '沙茶牛肉炒公仔麵', desc: '重口味熱門主食', price: 94, page: '主食', categories: ['炒公仔麵'], variants: ['炒公仔麵'], options: ['加蛋', '走蔥'] },
  { id: 'luncheon-meat-egg-noodle', name: '餐肉蛋湯麵', desc: '經典湯麵', price: 82, page: '主食', categories: ['湯麵類'], variants: ['湯麵'], options: ['加蛋', '走蔥'] },
  { id: 'beef-wonton-noodle', name: '牛肉雲吞麵', desc: '港式湯麵', price: 96, page: '主食', categories: ['湯麵類'], variants: ['湯麵'], options: ['加底', '走蔥'] },
  { id: 'beef-brisket-wonton-noodle', name: '牛腩雲吞麵', desc: '雙拼人氣主食', price: 108, page: '主食', categories: ['湯麵類'], variants: ['湯麵'], options: ['加底', '走蔥'] }
];

const pages = ['飲品', '小食甜品', '主食'];

function getDeviceToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('deviceToken') || '';
}

export default function Menu() {
  const [queue, setQueue] = useState(null);
  const [selected, setSelected] = useState({});
  const [note, setNote] = useState('');
  const [message, setMessage] = useState(API ? '' : '目前尚未設定後端 API 網址，請先設定 NEXT_PUBLIC_API_URL。');
  const [saveState, setSaveState] = useState('idle');
  const [savedSummary, setSavedSummary] = useState('');
  const [activePage, setActivePage] = useState('飲品');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [submittedSnapshot, setSubmittedSnapshot] = useState({});
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

  function applyExistingOrder(order, submitted = false) {
    if (!order) {
      setIsSubmitted(false);
      setSubmittedSnapshot({});
      return;
    }
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
    setIsSubmitted(submitted);
    setSubmittedSnapshot(submitted ? next : {});
    setSavedSummary(
      submitted
        ? `訂單已送出，共 ${order.items.length} 種、${order.items.reduce((s, i) => s + (i.quantity || 1), 0)} 份。之後可以加點，但不能刪除原有品項或減少原有數量。`
        : `已載入你先前的草稿，共 ${order.items.length} 種、${order.items.reduce((s, i) => s + (i.quantity || 1), 0)} 份。`
    );
  }

  async function loadMyState() {
    const token = getDeviceToken();
    if (!API || !token) return;
    try {
      const res = await fetch(`${API}/customer-state/${token}`);
      const data = await res.json();
      setQueue(data.activeQueue || null);
      const submitted = !!data.order;
      applyExistingOrder(data.order, submitted);
      if (!data.activeQueue) setMessage('請先回首頁取號後再建立預選餐點。');
    } catch {
      setMessage('目前無法載入你的資料。');
    }
  }

  function toggleItem(item) {
    setSelected((prev) => {
      const next = { ...prev };
      const wasSubmitted = !!submittedSnapshot[item.id];
      if (next[item.id]) {
        if (wasSubmitted) {
          setMessage('已送出的餐點不能刪除，只能加點。');
          return prev;
        }
        delete next[item.id];
      } else {
        next[item.id] = {
          name: item.name,
          quantity: 1,
          category: item.categories[0] || '',
          variant: item.variants[0] || '',
          options: []
        };
      }
      return next;
    });
  }

  function updateQuantity(itemId, diff) {
    setSelected((prev) => {
      const current = prev[itemId];
      if (!current) return prev;
      const minQuantity = submittedSnapshot[itemId]?.quantity || 1;
      const nextQuantity = (current.quantity || 1) + diff;
      if (submittedSnapshot[itemId] && nextQuantity < minQuantity) {
        setMessage('已送出的餐點數量不能減少。');
        return prev;
      }
      const quantity = Math.max(1, nextQuantity);
      return { ...prev, [itemId]: { ...current, quantity } };
    });
  }

  function updateField(item, field, value) {
    if (submittedSnapshot[item.id]) {
      setMessage('已送出的餐點內容不能修改，只能新增餐點或增加數量。');
      return;
    }
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
    if (submittedSnapshot[item.id]) {
      setMessage('已送出的餐點內容不能修改，只能新增餐點或增加數量。');
      return;
    }
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
    if (!API) {
      setMessage('尚未設定後端 API 網址，暫時無法送出餐點。');
      return;
    }
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
      applyExistingOrder(data, true);
      setSaveState('saved');
      setSavedSummary(`訂單已送出，共 ${data.items.length} 種餐點、${data.items.reduce((sum, item) => sum + (item.quantity || 1), 0)} 份。之後可以加點，但不能刪除原有品項或減少原有數量。`);
      setShowConfirm(false);
      router.push('/');
    } catch {
      setSaveState('error');
      setMessage('儲存失敗，請稍後再試');
      setShowConfirm(false);
    }
  }

  useEffect(() => {
    if (!API) return;
    loadMyState();
  }, []);

  return (
    <div className="customerPage">
      <div className="mobileShell">
        <div className="topNav withBack">
          <button className="backBtn" onClick={() => router.push('/')}>‹</button>
          <div>
            <div className="miniBrand">Step 2</div>
            <div className="screenTitle">訂單資訊</div>
          </div>
          <div className="navAction">可修改</div>
        </div>

        <div className="statusPanel light">
          <div className="statusLabel">你的取號資訊</div>
          <div className="ticketRow">
            <div className="ticketNo">{queue?.number || '--'}</div>
            <div>
              <div className="ticketMain">{queue ? `狀態：${queue.status === 'called' ? '已叫號' : queue.status === 'waiting' ? '等待中' : queue.status === 'skipped' ? '已過號' : queue.status === 'seated' ? '已入座' : '已完成'}` : '尚未取號'}</div>
              <div className="ticketSub">已建立的餐點草稿會綁定這張號碼</div>
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
              <input type="checkbox" checked={!!selected[item.id]} onChange={() => toggleItem(item)} disabled={false} />
              <div className="foodInfo">
                <div className="foodName">{item.name}</div>
                <div className="foodDesc">{item.desc}</div>
              </div>
              <div className="foodPrice">${item.price}</div>
            </label>

            {!!selected[item.id] && (
              <div className="configPanel">
                <div className="controlRow">
                  <div className="controlLabel">數量</div>
                  <div className="qtyBox">
                    <button type="button" className="qtyBtn" onClick={() => updateQuantity(item.id, -1)} disabled={submittedSnapshot[item.id] && (selected[item.id].quantity || 1) <= (submittedSnapshot[item.id].quantity || 1)}>-</button>
                    <div className="qtyValue">{selected[item.id].quantity || 1}</div>
                    <button type="button" className="qtyBtn" onClick={() => updateQuantity(item.id, 1)}>+</button>
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">種類</div>
                  <div className="selectorRow">
                    {item.categories.map((category) => (
                      <button key={category} type="button" className={`selectChip ${selected[item.id].category === category ? 'active' : ''}`} onClick={() => updateField(item, 'category', category)} disabled={!!submittedSnapshot[item.id]}>{category}</button>
                    ))}
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">規格</div>
                  <div className="selectorRow">
                    {item.variants.map((variant) => (
                      <button key={variant} type="button" className={`selectChip ${selected[item.id].variant === variant ? 'active' : ''}`} onClick={() => updateField(item, 'variant', variant)} disabled={!!submittedSnapshot[item.id]}>{variant}</button>
                    ))}
                  </div>
                </div>

                <div className="fieldBlock">
                  <div className="fieldLabel">加料 / 偏好</div>
                  <div className="optionGrid clean">
                    {item.options.map((option) => (
                      <label key={option} className="chip orange">
                        <input type="checkbox" checked={selected[item.id]?.options.includes(option) || false} onChange={() => toggleOption(item, option)} disabled={!!submittedSnapshot[item.id]} />
                        <span>{option}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <textarea className="textarea modern" placeholder="備註（例如：少冰、先做飲品）" value={note} onChange={(e) => setNote(e.target.value)} />
        {(message || savedSummary) && <div className={message.includes('失敗') || message.includes('請') || message.includes('無法') || message.includes('尚未設定') ? 'alertError' : 'alertOk'}>{message || savedSummary}</div>}

        <div className="checkoutBar">
          <div>
            <div className="checkoutLabel">共 {itemCount} 份</div>
            <div className="checkoutValue">${subtotal}</div>
          </div>
          <button className="orangeBtn small" onClick={openConfirm} disabled={saveState === 'saving'}>
            {saveState === 'saving' ? '儲存中...' : '確認餐點'}
          </button>
        </div>

        {showConfirm && (
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
              <div className="confirmNote" style={{ color: '#b45309', fontWeight: 600 }}>提醒：送出後仍可加點，但不能刪除原有品項，也不能減少原有數量。</div>
              <div className="confirmTotal">總計：${subtotal}</div>
              <div className="modalActions">
                <button type="button" className="outlineBtn modalBtn" onClick={() => setShowConfirm(false)}>返回修改</button>
                <button type="button" className="orangeBtn modalBtn" onClick={submitOrder}>確認送出（送出後僅可加點）</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
