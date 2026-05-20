import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { useLiff } from '../context/LiffContext';
import { getStoredLineUserId } from '../lib/liff';

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
  { id: '001', name: '餐肉蛋豬排飯', price: 160, page: '本店特別推薦', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '002', name: '港式炒麵', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '003', name: '牛肉炒麵', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '004', name: '銀芽肉絲炒麵', price: 180, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '005', name: '羅漢上素炒麵', price: 180, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '006', name: '豉油皇炒麵', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '007', name: '豉椒牛肉河', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '008', name: '豉椒排骨河', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '009', name: '干炒牛肉河', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '010', name: '干炒豬肉河', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '011', name: '沙茶肥牛炆米粉', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '012', name: '雪菜肉絲炆米粉', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '013', name: '馬來炒米粉', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '014', name: '鹹魚雞粒炒飯', price: 200, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '015', name: '鳳梨雞粒炒飯', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '016', name: '生炒牛肉飯', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '017', name: '西式炒飯', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '018', name: '楊州炒飯', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '019', name: '素炒飯', price: 160, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '020', name: '蔥油雞飯', price: 190, page: '炒粉/面/飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '021', name: '福建燴飯', price: 200, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '022', name: '紅燒魚片飯', price: 160, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '023', name: '咕咾魚片飯', price: 160, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '024', name: '咖哩魚片飯', price: 160, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '025', name: '咖哩雞排飯', price: 160, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '026', name: '橙花雞排飯', price: 160, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '027', name: '黑椒豬排飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '028', name: '鮮茄豬排飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '029', name: '咖哩豬排飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '030', name: '咖哩排骨飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '031', name: '鮮茄牛肉飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '032', name: '滑蛋牛肉飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '033', name: '窩蛋碎牛肉飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '034', name: '豉椒牛肉飯', price: 150, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '035', name: '麻婆豆腐飯', price: 140, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '036', name: '羅漢素燴飯', price: 140, page: '燴飯', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '037', name: '豉椒蒸排骨飯', price: 150, page: '每日限量', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '038', name: '香菇蒸滑雞飯', price: 150, page: '每日限量', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '039', name: '鹹魚蒸肉餅飯', price: 150, page: '每日限量', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '040', name: '腊味蒸飯', price: 150, page: '每日限量', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '041', name: '牛肉撈麵', price: 200, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '042', name: '豬肉撈麵', price: 200, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '043', name: '越式肥牛湯米線', price: 180, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '044', name: '潮州四寶湯米線', price: 160, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '045', name: '五香牛肚麵', price: 160, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '046', name: '咖哩綜合麵', price: 150, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '047', name: '炸豬排湯麵', price: 150, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '048', name: '牛肉蛋湯麵', price: 150, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '049', name: '餐肉蛋湯麵', price: 150, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '050', name: '腸仔蛋湯麵', price: 150, page: '湯麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '051', name: 'XO牛肉炒公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '052', name: '起士奶油豬排公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '053', name: '沙茶海鮮公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '054', name: '干炒豬排公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '055', name: '餐肉蛋炒公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '056', name: '蔥油雞公仔麵', price: 200, page: '炒公仔麵', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '057', name: '港式煲老火湯', price: 100, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '058', name: 'XO炒蘿蔔糕', price: 190, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '059', name: '腊味蘿蔔糕', price: 90, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '060', name: '鮮肉腐皮捲', price: 140, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '061', name: '蝦米煎腸粉', price: 90, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '062', name: '港式薄餅', price: 80, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '063', name: '鮮油菠蘿飽', price: 60, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '064', name: '炸雞排(一片)', price: 140, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '065', name: '炸豬排(一片)', price: 110, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '066', name: '餐肉(一片)', price: 50, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '067', name: '腸仔(一份)', price: 40, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '068', name: '咖哩綜合(魚蛋、鴨丸、蘿蔔、豬血)', price: 130, page: '本店特色', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '069', name: '招牌奶茶', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '070', name: '美式咖啡', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '071', name: '特式鴛鴦', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '072', name: '檸檬龍茶', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '073', name: '檸檬可樂', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '074', name: '檸檬蜜', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '075', name: '阿華田', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '076', name: '桂圓杞子茶', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '077', name: '川貝杏仁茶', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '078', name: '芒果汁', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '079', name: '紅豆冰', price: 80, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '080', name: '鹹檸檬雪碧', price: 90, page: '冷熱飲品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '081', name: '公司三文治', price: 120, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '082', name: '豬排蛋三文治', price: 120, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '083', name: '餐肉蛋三文治', price: 90, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '084', name: '鮮牛肉三文治', price: 80, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '085', name: '芝士火腿三文治', price: 80, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '086', name: '火腿蛋三文治', price: 80, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '087', name: '雞蛋三文治', price: 80, page: '三文治', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  
  { id: '088', name: '法蘭西多士', price: 100, page: '多士', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '089', name: '鮮奶油多士', price: 70, page: '多士', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '090', name: '花生奶醬多士', price: 70, page: '多士', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },

  { id: '091', name: '楊枝甘露', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '092', name: '首烏芝麻糊', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '093', name: '奶皇包', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['蒸', '炸'] },
  { id: '094', name: '豆沙煎餅', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '095', name: '紅豆蓮子露 ', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['熱', '冰'] },
  { id: '096', name: '芝麻糊奶酪', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
  { id: '097', name: '鳳梨奶酪', price: 80, page: '甜品', categories: ['暫無'], variants: ['暫無'], options: ['暫無'] },
];

const pages = ['本店特別推薦', '炒粉/面/飯', '燴飯', '每日限量', '湯麵', '炒公仔麵', '本店特色', '冷熱飲品', '三文治', '多士', '甜品'];

function getDeviceToken() {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('deviceToken') || '';
}

export default function Menu() {
  const { liffReady, lineUserId: liffUserId } = useLiff();
  const lineUserId = liffUserId || getStoredLineUserId();
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
    if (!API) return;
    try {
      let res;
      if (lineUserId) {
        res = await fetch(`${API}/customer-state/line/${encodeURIComponent(lineUserId)}`);
      } else {
        const token = getDeviceToken();
        if (!token) return;
        res = await fetch(`${API}/customer-state/${token}`);
      }
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
    if (!API || !liffReady) return;
    loadMyState();
  }, [liffReady, lineUserId]);

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
