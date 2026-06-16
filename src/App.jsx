import { useState, useEffect, useRef } from "react";
import { db } from './firebase';
import { doc, getDoc, setDoc, collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import React from 'react';

let P = "#1a7a4a";
let PLIGHT = "#f0faf4";
let PGRAD = "#2ea76a"; // 전역 테마 색상들
// ─── Error Boundary ────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props){super(props);this.state={hasError:false,error:null};}
  static getDerivedStateFromError(e){return {hasError:true,error:e};}
  componentDidCatch(e,i){console.error('Error:',e,i);}
  render(){
    if(this.state.hasError) return(
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,gap:16}}>
        <div style={{fontSize:36}}>⚠️</div>
        <div style={{fontSize:15,fontWeight:700,color:'#333'}}>오류가 발생했습니다</div>
        <div style={{fontSize:11,color:'#888',textAlign:'center'}}>{this.state.error?.message}</div>
        <button onClick={()=>this.setState({hasError:false,error:null})} style={{padding:'10px 24px',border:'none',borderRadius:20,background:'#1a7a4a',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>돌아가기</button>
      </div>
    );
    return this.props.children;
  }
}
const THEME_PRESETS = [
  {id:'green',   name:'에메랄드 🌿', P:'#1a7a4a', light:'#f0faf4', grad:'#2ea76a'},
  {id:'blue',    name:'오션 🌊',     P:'#1565c0', light:'#e3f2fd', grad:'#1976d2'},
  {id:'pink',    name:'블로썸 🌸',   P:'#c2185b', light:'#fce4ec', grad:'#e91e8c'},
  {id:'orange',  name:'선셋 🌅',     P:'#e65100', light:'#fff3e0', grad:'#fb8c00'},
  {id:'purple',  name:'라벤더 💜',   P:'#6a1b9a', light:'#f3e5f5', grad:'#8e24aa'},
  {id:'teal',    name:'민트 🫧',     P:'#00695c', light:'#e0f2f1', grad:'#00897b'},
  {id:'red',     name:'로즈 🌹',     P:'#b71c1c', light:'#ffebee', grad:'#c62828'},
  {id:'brown',   name:'초콜릿 🍫',   P:'#4e342e', light:'#efebe9', grad:'#6d4c41'},
  {id:'indigo',  name:'인디고 ✨',   P:'#283593', light:'#e8eaf6', grad:'#3949ab'},
  {id:'gold',    name:'골드 ⭐',     P:'#f57f17', light:'#fffde7', grad:'#fbc02d'},
  {id:'darkgreen',name:'포레스트 🌲', P:'#1b5e20', light:'#e8f5e9', grad:'#2e7d32'},
  {id:'navy',    name:'네이비 ⚓',   P:'#0d47a1', light:'#e3f2fd', grad:'#1565c0'},
];
const FONT_OPTIONS = [
  {id:'noto',   name:'기본체',     value:"'Noto Sans KR',sans-serif"},
  {id:'gothic', name:'나눔고딕',   value:"'Nanum Gothic',sans-serif"},
  {id:'myeong', name:'나눔명조',   value:"'Nanum Myeongjo',serif"},
  {id:'black',  name:'검은고딕',   value:"'Black Han Sans',sans-serif"},
  {id:'jua',    name:'주아체',     value:"'Jua',sans-serif"},
  {id:'gaegu',  name:'개구체',     value:"'Gaegu',cursive"},
];
// P is set dynamically per component via getTheme()
// ─── 효과음 ────────────────────────────────────────────────
function playCartSound() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    ctx.resume().then(() => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime+0.12);
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime+0.4);
      setTimeout(()=>ctx.close(), 600);
    });
  } catch {}
}
function playOrderSound() {
  try {
    const ctx = new (window.AudioContext||window.webkitAudioContext)();
    ctx.resume().then(() => {
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq,i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        const t = ctx.currentTime + i*0.18;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.3, t+0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t+0.4);
        osc.start(t); osc.stop(t+0.4);
      });
      setTimeout(()=>ctx.close(), 1500);
    });
  } catch {}
}

function getTheme(settings) {
  return THEME_PRESETS.find(t=>t.id===(settings?.themeId||'green')) || THEME_PRESETS[0];
}
const fmt = (n) => n.toLocaleString("ko-KR") + "원";
const WDAY = ['일','월','화','수','목','금','토'];
const WDAY_FULL = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

// ─── Storage (Firestore + localStorage) ───────────────────────
// 이름만 기기별 로컬 저장
function getStoredUser() { try { return localStorage.getItem('hb_user'); } catch { return null; } }
function setStoredUser(n) { try { localStorage.setItem('hb_user', n); } catch {} }

// Firestore 헬퍼
async function fsGet(path, docId) {
  try { const s=await getDoc(doc(db,path,docId)); return s.exists()?s.data():null; } catch { return null; }
}
async function fsSet(path, docId, data) {
  try { await setDoc(doc(db,path,docId), data); return true; } catch(e) { console.error('fsSet error:',e); return false; }
}

async function getStoredSettings() { return fsGet('config','settings'); }
async function saveStoredSettings(s) { await fsSet('config','settings',s); }
async function getStoredDrinks() {
  const d = await fsGet('config','drinks');
  return d?.list || null;
}
async function saveStoredDrinks(list) { await fsSet('config','drinks',{list}); }
async function getStoredCats() {
  const d = await fsGet('config','cats');
  return d?.list || null;
}
async function saveStoredCats(list) { await fsSet('config','cats',{list}); }
async function getUserOrders(name) {
  try {
    const q = query(collection(db,'orders'), where('userName','==',name));
    const snap = await getDocs(q);
    const orders = [];
    snap.forEach(d => orders.push({id:d.id,...d.data()}));
    return orders.sort((a,b)=>new Date(b.orderTime)-new Date(a.orderTime));
  } catch { return []; }
}
async function pushOrder(name, order) {
  try { await addDoc(collection(db,'orders'),{...order,userName:name}); } catch(e) { console.error('pushOrder error:',e); }
}
// 월 주문 한도 관리 (localStorage - 기기별)
const MONTHLY_LIMIT = 10000; // 월 개인 한도
const DAILY_DRINK_LIMIT = 15;  // 하루 전체 음료 한도

// 하루 음료 잔수 (Firestore - 전체 공유)
function getTodayKey() {
  const n=new Date();
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`;
}
async function getDailyData() {
  try {
    const snap = await getDoc(doc(db,'daily',getTodayKey()));
    return snap.exists() ? snap.data() : {count:0, drinkCounts:{}};
  } catch { return {count:0, drinkCounts:{}}; }
}
async function getDailyCount() {
  const d = await getDailyData(); return d.count||0;
}
async function getDrinkDailyCount(drinkId) {
  const d = await getDailyData(); return (d.drinkCounts||{})[drinkId]||0;
}
async function incrementDailyCount(qty, cart, deliveryTime) {
  try {
    const k = getTodayKey();
    const snap = await getDoc(doc(db,'daily',k));
    const cur = snap.exists() ? snap.data() : {count:0, drinkCounts:{}, slotCounts:{}};
    const drinkCounts = {...(cur.drinkCounts||{})};
    if(cart) cart.forEach(item=>{
      const id = item.drink.id||item.drink.name;
      drinkCounts[id] = (drinkCounts[id]||0) + item.qty;
    });
    const slotCounts = {...(cur.slotCounts||{})};
    if(deliveryTime) slotCounts[deliveryTime] = (slotCounts[deliveryTime]||0)+1;
    await setDoc(doc(db,'daily',k), {count:(cur.count||0)+qty, drinkCounts, slotCounts, date:k});
    return (cur.count||0)+qty;
  } catch { return -1; }
}
async function getSlotCounts() {
  const d = await getDailyData(); return d.slotCounts||{};
}
function getMonthKey(name) {
  const n=new Date(); return `hb_mon:${name}:${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
}
function getMonthlyTotal(name) {
  try { return parseInt(localStorage.getItem(getMonthKey(name))||'0'); } catch { return 0; }
}
function addMonthlyTotal(name, amount) {
  try { const k=getMonthKey(name); localStorage.setItem(k, (parseInt(localStorage.getItem(k)||'0')+amount).toString()); } catch {}
}

async function deleteOrder(orderId) {
  try {
    const { deleteDoc } = await import('firebase/firestore');
    await deleteDoc(doc(db,'orders',orderId));
    return true;
  } catch(e) {
    // localStorage fallback
    try {
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i);
        if(key?.startsWith('hb_orders:')){
          const orders=JSON.parse(localStorage.getItem(key)||'[]');
          const filtered=orders.filter(o=>String(o.id)!==String(orderId));
          localStorage.setItem(key,JSON.stringify(filtered));
        }
      }
      return true;
    } catch { return false; }
  }
}
async function getAllOrders() {
  try {
    const snap = await getDocs(collection(db,'orders'));
    const orders = [];
    snap.forEach(d => orders.push({id:d.id,...d.data()}));
    return orders.sort((a,b)=>new Date(b.orderTime)-new Date(a.orderTime));
  } catch { return []; }
}

// ─── Notifications ────────────────────────────────────────────
async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return { ok: false, error: "설정 미완료" };
  try {
    const r = await fetch('/api/telegram', {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, chatId, text }),
    });
    const d = await r.json();
    return { ok: d.ok, error: d.description };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function sendKakao(accessToken, text) {
  if (!accessToken) return { ok: false, error: "토큰 없음" };
  try {
    const tmpl = JSON.stringify({ object_type: "text", text, link: { web_url: "", mobile_web_url: "" } });
    const r = await fetch("https://kapi.kakao.com/v2/api/talk/memo/default/send", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${accessToken}` },
      body: `template_object=${encodeURIComponent(tmpl)}`,
    });
    return { ok: r.ok };
  } catch { return { ok: false, error: "CORS 제한" }; }
}
function buildAdminMsg(info, cart, total, schoolName) {
  const items = cart.map(i => `• ${i.drink.name} (${i.selectedSize.label}) ×${i.qty} — ${fmt(i.totalPrice)}\n  ${Object.values(i.optionChoices).join(", ")}`).join("\n");
  const extra = info.extraRequest?.trim() ? `\n📝 요청: ${info.extraRequest.trim()}` : '';
  return `📦 [${schoolName}] 새 주문!\n👤 ${info.name}  📍 ${info.location}${extra}\n📅 ${info.deliveryLabel} ${info.deliveryTime}\n\n${items}\n\n💰 합계: ${fmt(total)}\n⏰ ${new Date().toLocaleString("ko-KR")}`;
}

// ─── Date / Time ──────────────────────────────────────────────
const ALL_TIME_OPTIONS = (() => {
  const o = [];
  for (let h = 8; h <= 18; h++) [0,10,20,30,40,50].forEach(m => { if (!(h===18&&m>0)) o.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`); });
  return o;
})();
function parseTimeMin(t) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function getDeliveryDates() {
  return [0,1].map(offset => {
    const d = new Date(); d.setDate(d.getDate()+offset);
    const m=d.getMonth()+1, day=d.getDate(), wd=WDAY[d.getDay()];
    return { value: d.toISOString().split('T')[0], label: `${m}월 ${day}일 (${wd})`, tag: offset===0?'오늘':'내일', dow: d.getDay() };
  });
}
function getTimeSlotsForDay(cfg, isToday) {
  if (!cfg?.enabled) return [];
  const s=parseTimeMin(cfg.start), e=parseTimeMin(cfg.end);
  if (s>=e) return [];
  const buf = isToday ? (() => { const n=new Date(); return n.getHours()*60+n.getMinutes()+15; })() : -1;
  const blocked = cfg.blockedSlots||[];
  const slots=[];
  for (let m=s; m<=e; m+=10) {
    if (isToday && m<=buf) continue;
    const t=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    if (!blocked.includes(t)) slots.push(t);
  }
  return slots;
}
function groupByDate(orders) { return orders.reduce((g,o) => { const k=o.orderTime?o.orderTime.split('T')[0]:'?'; (g[k]=g[k]||[]).push(o); return g; }, {}); }
function groupByMonth(orders) { return orders.reduce((g,o) => { const k=o.orderTime?o.orderTime.substring(0,7):'?'; (g[k]=g[k]||[]).push(o); return g; }, {}); }
function groupByCustomer(orders) { return orders.reduce((g,o) => { const k=o.name||'미상'; (g[k]=g[k]||[]).push(o); return g; }, {}); }
function fmtDate(k) { if(k==='?') return '날짜 미상'; const d=new Date(k+'T00:00:00'); return d.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'}); }
function fmtMonth(k) { if(k==='?') return '날짜 미상'; const [y,m]=k.split('-'); return `${y}년 ${parseInt(m)}월`; }

// ─── Initial Data ─────────────────────────────────────────────
const INIT_CATS = [
  {id:"best",label:"추천",icon:"⭐",visible:true},{id:"coffee",label:"커피",icon:"☕",visible:true},
  {id:"ade",label:"에이드",icon:"🍋",visible:true},{id:"smoothie",label:"스무디",icon:"🥤",visible:true},
  {id:"tea",label:"티/음료",icon:"🍵",visible:true},
];
const INIT_DRINKS = [
  {id:1,categoryId:"best",name:"딸기 스무디",nameEn:"Strawberry Smoothie",price:3500,description:"신선한 딸기로 만든 달콤한 스무디",image:"https://images.unsplash.com/photo-1553530666-ba11a7da3888?w=300&q=80",tags:["BEST"],options:[{id:"ice",label:"얼음",choices:["적게","보통","많이"],default:"보통"},{id:"sweet",label:"당도",choices:["덜 달게","보통","달게"],default:"보통"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500}]},
  {id:2,categoryId:"best",name:"초코 라떼",nameEn:"Choco Latte",price:3000,description:"진한 초콜릿과 우유가 어우러진 라떼",image:"https://images.unsplash.com/photo-1517578239113-b03992dcdd25?w=300&q=80",tags:["BEST"],options:[{id:"ice",label:"얼음",choices:["적게","보통","많이"],default:"보통"},{id:"milk",label:"우유",choices:["일반 우유","두유","오트 밀크"],default:"일반 우유"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500}]},
  {id:3,categoryId:"coffee",name:"아메리카노",nameEn:"Americano",price:2500,description:"깔끔하고 진한 에스프레소 아메리카노",image:"https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=300&q=80",tags:[],options:[{id:"ice",label:"얼음",choices:["적게","보통","많이"],default:"보통"},{id:"shot",label:"샷",choices:["1샷","2샷"],default:"1샷"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500},{label:"XL",ml:591,price:1000}]},
  {id:4,categoryId:"ade",name:"레몬 에이드",nameEn:"Lemon Ade",price:3200,description:"상큼한 레몬으로 만든 청량한 에이드",image:"https://images.unsplash.com/photo-1621263764928-df1444c5e859?w=300&q=80",tags:[],options:[{id:"ice",label:"얼음",choices:["적게","보통","많이"],default:"보통"},{id:"sweet",label:"당도",choices:["덜 달게","보통","달게"],default:"보통"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500}]},
  {id:5,categoryId:"smoothie",name:"망고 스무디",nameEn:"Mango Smoothie",price:3800,description:"달콤한 망고로 만든 열대 스무디",image:"https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=300&q=80",tags:[],options:[{id:"ice",label:"얼음",choices:["적게","보통","많이"],default:"보통"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500}]},
  {id:6,categoryId:"tea",name:"캐모마일 티",nameEn:"Chamomile Tea",price:2800,description:"은은한 향의 캐모마일 허브티",image:"https://images.unsplash.com/photo-1597481499750-3e6b22637e12?w=300&q=80",tags:[],options:[{id:"temp",label:"온도",choices:["HOT","ICE"],default:"HOT"},{id:"sweet",label:"당도",choices:["무가당","보통","달게"],default:"무가당"}],sizes:[{label:"M",ml:355,price:0},{label:"L",ml:473,price:500}]},
];
const DEFAULT_BLOCKED=['12:00','12:10','12:20'];
const INIT_DH = {0:{enabled:false,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},1:{enabled:true,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},2:{enabled:true,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},3:{enabled:true,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},4:{enabled:true,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},5:{enabled:true,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED},6:{enabled:false,start:"10:30",end:"14:30",blockedSlots:DEFAULT_BLOCKED}};
const INIT_SETTINGS = {
  school: { name: "다운고등학교", icon: "🏫", nameColor: '', fontId: 'noto' },
  themeId: 'green',
  banner: { headline: "음료를 주문하세요 🍹", subtext: "매일 신선하게 준비됩니다", image: "", serviceLabel: "음료 주문 서비스", serviceLabelStyle:{size:12,color:'',bold:false,italic:false,underline:false}, headlineStyle:{size:22,color:'',bold:true,italic:false,underline:false}, subtextStyle:{size:13,color:'',bold:false,italic:false,underline:false} },
  telegram: { enabled: false, token: "", chatId: "" },
  kakao: { enabled: false, accessToken: "" },
  deliveryHours: INIT_DH,
  adminPassword: "admin1234",
  dailyLimit: 15,
  slotLimit: 3,
};

// ─── APP ──────────────────────────────────────────────────────
export default function App() {
  const [booting, setBooting] = useState(true);
  const [dailyCountApp, setDailyCountApp] = useState(0);
  useEffect(()=>{ getDailyCount().then(setDailyCountApp); },[]);
  const [userName, setUserName] = useState(null);
  const [screen, setScreen] = useState("home");
  const [selCat, setSelCat] = useState(null);
  const [selDrink, setSelDrink] = useState(null);
  const [cart, setCart] = useState([]);
  const [drinks, setDrinks] = useState(INIT_DRINKS);
  const [cats, setCats] = useState(INIT_CATS);
  const [settings, setSettings] = useState(INIT_SETTINGS);
  const [editDrink, setEditDrink] = useState(null);
  const [orderModal, setOrderModal] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);
  const [adminTab, setAdminTab] = useState("drinks");
  const [toast, setToast] = useState(null);
  const [adminLoginModal, setAdminLoginModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const fallback = setTimeout(() => { console.warn('Firebase timeout'); setBooting(false); }, 6000);
    Promise.all([getStoredUser(), getStoredSettings(), getStoredDrinks(), getStoredCats()])
      .then(([user, stored, storedDrinks, storedCats]) => {
        clearTimeout(fallback);
        if (user) setUserName(user);
        if (stored) setSettings(() => ({
          ...INIT_SETTINGS, ...stored,
          school: { ...INIT_SETTINGS.school, ...(stored.school||{}) },
          banner: { ...INIT_SETTINGS.banner, ...(stored.banner||{}) },
          deliveryHours: { ...INIT_DH, ...(stored.deliveryHours||{}) },
          adminPassword: stored.adminPassword || INIT_SETTINGS.adminPassword,
          themeId: stored.themeId || INIT_SETTINGS.themeId,
          dailyLimit: stored.dailyLimit ?? INIT_SETTINGS.dailyLimit,
          slotLimit: stored.slotLimit ?? INIT_SETTINGS.slotLimit,
        }));
        if (storedDrinks) setDrinks(storedDrinks);
        if (storedCats) setCats(storedCats);
        setBooting(false);
      })
      .catch(e => { clearTimeout(fallback); console.error('Boot error:',e); setBooting(false); });
  }, []);

  // 음료·카테고리 변경 시 Firestore 자동 저장
  useEffect(() => { if (!booting) saveStoredDrinks(drinks); }, [drinks]);
  useEffect(() => { if (!booting) saveStoredCats(cats); }, [cats]);

  const thm = getTheme(settings);
  P = thm.P; PLIGHT = thm.light; PGRAD = thm.grad; // 전역 테마 업데이트
  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const cartCount = cart.length;
  const cartTotal = cart.reduce((s,i) => s+i.totalPrice, 0);

  const handleLogin = async (name) => { await setStoredUser(name); setUserName(name); };
  const addToCart = (item) => { setCart(p => [...p,{...item,cartId:Date.now()}]); playCartSound(); notify("장바구니에 담겼습니다 🛒"); setScreen("list"); };

  const handleOrder = async (info) => {
    // ① 월 개인 한도 체크
    const monthlyUsed = getMonthlyTotal(info.name||userName);
    if (monthlyUsed + cartTotal > MONTHLY_LIMIT) {
      const remain = MONTHLY_LIMIT - monthlyUsed;
      alert(`⚠️ 이번 달 주문 한도 초과\n\n이번 달 사용: ${fmt(monthlyUsed)} / ${fmt(MONTHLY_LIMIT)}\n남은 한도: ${remain>0?fmt(remain):'없음'}\n\n월 주문 한도(${fmt(MONTHLY_LIMIT)})를 초과하여 주문할 수 없습니다.\n다음 달 1일부터 다시 주문 가능합니다.`);
      return;
    }
    // ② 하루 전체 잔수 한도 체크
    const newDrinkQty = cart.reduce((s,i)=>s+i.qty, 0);
    const dailyCount = await getDailyCount();
    const todayLimit = settings.dailyLimit ?? DAILY_DRINK_LIMIT;
    if (dailyCount + newDrinkQty > todayLimit) {
      const remain = todayLimit - dailyCount;
      alert(`⚠️ 오늘 주문 가능한 잔 수 초과\n\n오늘 주문된 잔수: ${dailyCount}잔 / ${todayLimit}잔\n남은 잔수: ${remain>0?remain+'잔':'없음'}\n\n오늘은 더 이상 주문할 수 없습니다.\n내일 다시 시도해주세요.`);
      return;
    }
    const order = { id:Date.now(), name:info.name, location:info.location, extraRequest:info.extraRequest||'', deliveryDate:info.deliveryDate, deliveryTime:info.deliveryTime, deliveryLabel:info.deliveryLabel, items:cart.map(i=>({name:i.drink.name,size:i.selectedSize.label,qty:i.qty,options:Object.values(i.optionChoices),price:i.totalPrice})), totalPrice:cartTotal, orderTime:new Date().toISOString(), status:"주문완료" };
    await pushOrder(userName, order);
    addMonthlyTotal(info.name||userName, cartTotal); // 월 사용금액 누적
    await incrementDailyCount(newDrinkQty, cart, info.deliveryTime); // 하루 잔수 누적
    const msg = buildAdminMsg(info, cart, cartTotal, settings.school?.name||'');
    if (settings.telegram.enabled && settings.telegram.token) await sendTelegram(settings.telegram.token, settings.telegram.chatId, msg);
    if (settings.kakao.enabled && settings.kakao.accessToken) await sendKakao(settings.kakao.accessToken, msg);
    setCart([]); setOrderModal(false); setSuccessOrder(order); playOrderSound();
  };

  const handleSaveSettings = async (s) => { setSettings(s); await saveStoredSettings(s); notify("설정 저장됨 ✅"); };

  if (booting) return <div style={S.shell}><div style={{...S.phone,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{textAlign:'center'}}><div style={{fontSize:48}}>🥤</div><div style={{color:'#888',marginTop:10}}>로딩 중...</div></div></div></div>;
  if (!userName) return <div style={S.shell}><div style={S.phone}><LoginScreen onLogin={handleLogin} /></div></div>;
  if (successOrder) return <div style={S.shell}><div style={S.phone}><OrderSuccessScreen order={successOrder} onDone={()=>{setSuccessOrder(null);setScreen("home");}} /></div></div>;

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        {screen==="home"     && <HomeScreen school={settings.school} banner={settings.banner} categories={cats.filter(c=>c.visible)} onSelect={cat=>{setSelCat(cat);setScreen("list");}} onAdmin={()=>{ if(isAdmin){setAdminTab("drinks");setScreen("admin");}else{setAdminLoginModal(true);} }} cartCount={cartCount} onCart={()=>setScreen("cart")} userName={userName} onHistory={()=>setScreen("history")} dailyLimit={settings.dailyLimit??15} deliveryHours={settings.deliveryHours} />}
        {screen==="list"     && <ListScreen category={selCat} drinks={drinks.filter(d=>{ if(d.visible===false) return false; if(!selCat) return true; if(selCat.label?.includes('추천')||selCat.icon==='⭐') return d.featured===true||d.categoryId===selCat.id; return d.categoryId===selCat.id; })} onBack={()=>setScreen("home")} onSelect={d=>{setSelDrink(d);setScreen("detail");}} cartCount={cartCount} onCart={()=>setScreen("cart")} />}
        {screen==="detail"   && selDrink && <DetailScreen drink={selDrink} onBack={()=>setScreen("list")} onAddToCart={addToCart} />}
        {screen==="cart"     && <CartScreen cart={cart} totalPrice={cartTotal} onBack={()=>setScreen("home")} onRemove={id=>setCart(p=>p.filter(i=>i.cartId!==id))} onCheckout={()=>setOrderModal(true)} />}
        {screen==="history"  && <HistoryScreen userName={userName} onBack={()=>setScreen("home")} />}
        {screen==="admin"    && <AdminScreen drinks={drinks} cats={cats} settings={settings} activeTab={adminTab} onTabChange={setAdminTab} onBack={()=>{setScreen("home");setIsAdmin(false);}} onEdit={d=>{setEditDrink(d);setScreen("adminEdit");}} onNew={()=>{setEditDrink(null);setScreen("adminEdit");}} onDelete={id=>{setDrinks(p=>p.filter(d=>d.id!==id));notify("삭제됨");}} onToggleCat={id=>setCats(p=>p.map(c=>c.id===id?{...c,visible:!c.visible}:c))} onUpdateCat={(id,u)=>setCats(p=>p.map(c=>c.id===id?{...c,...u}:c))} onAddCat={newCat=>setCats(p=>[...p,{...newCat,id:Date.now().toString(),visible:true}])} onSaveSettings={handleSaveSettings} onReorder={setDrinks} onToggleVisible={id=>setDrinks(p=>p.map(d=>d.id===id?{...d,visible:d.visible===false?true:false}:d))} />}
        {screen==="adminEdit"&& <ErrorBoundary><AdminEditScreen drink={editDrink} cats={cats} onBack={()=>setScreen("admin")} onSave={d=>{setDrinks(p=>d.id?p.map(x=>x.id===d.id?d:x):[...p,{...d,id:Date.now()}]);notify("저장됨 ✅");setScreen("admin");}} /></ErrorBoundary>}
        {adminLoginModal && <AdminLoginModal correctPassword={settings.adminPassword||"admin1234"} onSuccess={()=>{setAdminLoginModal(false);setIsAdmin(true);setAdminTab("drinks");setScreen("admin");}} onCancel={()=>setAdminLoginModal(false)} />}
        {orderModal && <OrderModal totalPrice={cartTotal} userName={userName} deliveryHours={settings.deliveryHours} dailyLimit={settings.dailyLimit??15} slotLimit={settings.slotLimit??3} onCancel={()=>setOrderModal(false)} onConfirm={handleOrder} cart={cart} />}
        {toast && <div style={S.toast}>{toast}</div>}
        {!["detail","adminEdit"].includes(screen) && (()=>{
          const dlimit=settings.dailyLimit??15;
          const dRemain=dlimit-dailyCountApp;
          const dPct=Math.min(100,Math.round(dailyCountApp/dlimit*100));
          return (
            <div style={{background:dRemain<=0?'#ffebee':dRemain<=3?'#fff3e0':PLIGHT,padding:'8px 16px',borderTop:'1px solid rgba(0,0,0,0.06)'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                <span style={{fontSize:11,fontWeight:700,color:'#555'}}>🧋 오늘 주문 현황</span>
                <span style={{fontSize:11,fontWeight:800,color:dRemain<=0?'#c62828':dRemain<=3?'#e65100':P}}>{dailyCountApp}잔 / {dlimit}잔</span>
              </div>
              <div style={{background:'rgba(0,0,0,0.08)',borderRadius:3,height:4}}>
                <div style={{width:`${dPct}%`,height:'100%',borderRadius:3,background:dRemain<=0?'#c62828':dRemain<=3?'#e65100':P,transition:'width 0.5s'}} />
              </div>
              {dRemain<=0&&<div style={{fontSize:10,color:'#c62828',marginTop:3}}>⚠️ 오늘 주문 마감</div>}
            </div>
          );
        })()}
        {!["detail","adminEdit"].includes(screen) && <BottomNav screen={screen} setScreen={setScreen} cartCount={cartCount} />}
      </div>
    </div>
  );
}

// ─── ADMIN LOGIN MODAL ────────────────────────────────────────
function AdminLoginModal({ correctPassword, onSuccess, onCancel }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const submit = () => {
    if (pw === correctPassword) { onSuccess(); }
    else { setErr("비밀번호가 틀렸습니다"); setPw(""); }
  };
  return (
    <div style={S.overlay}>
      <div style={{background:'#fff',borderRadius:20,padding:'28px 24px',width:280,margin:'auto',boxShadow:'0 10px 40px rgba(0,0,0,0.2)'}}>
        <div style={{textAlign:'center',marginBottom:20}}>
          <div style={{fontSize:36}}>🔐</div>
          <div style={{fontSize:17,fontWeight:800,color:'#111',marginTop:8}}>관리자 인증</div>
          <div style={{fontSize:12,color:'#888',marginTop:4}}>관리자 비밀번호를 입력하세요</div>
        </div>
        <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr("");}} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="비밀번호 입력" autoFocus style={{...S.mInput,textAlign:'center',letterSpacing:4}} />
        {err&&<div style={{color:'#e53935',fontSize:13,marginBottom:10,textAlign:'center'}}>⚠️ {err}</div>}
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,height:46,borderRadius:23,border:'1.5px solid #ddd',background:'#f5f5f5',fontSize:15,fontWeight:700,cursor:'pointer',color:'#333'}}>취소</button>
          <button onClick={submit} style={{flex:1,height:46,borderRadius:23,border:'none',background:P,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>확인</button>
        </div>
      </div>
    </div>
  );
}

// ─── LOGIN ────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [name,setName] = useState("");
  const go = () => { if(name.trim()) onLogin(name.trim()); };
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:32,background:'#fff'}}>
      <div style={{fontSize:64}}>🥤</div>
      <div style={{fontSize:22,fontWeight:800,color:P,marginTop:16}}>다운고 음료 주문</div>
      <div style={{fontSize:13,color:'#888',marginTop:6,marginBottom:36,textAlign:'center',lineHeight:1.7}}>이름을 입력하면 주문 내역이<br/>개인별로 저장됩니다</div>
      <input value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()} placeholder="이름 입력 (예: 홍길동)" autoFocus style={{...S.mInput,textAlign:'center',fontSize:16}} />
      <button onClick={go} disabled={!name.trim()} style={{width:'100%',height:50,borderRadius:25,border:'none',background:name.trim()?P:'#e0e0e0',color:'#fff',fontSize:16,fontWeight:700,cursor:name.trim()?'pointer':'default'}}>시작하기 →</button>
    </div>
  );
}

// ─── HOME ─────────────────────────────────────────────────────
function HomeScreen({ school, banner, categories, onSelect, onAdmin, cartCount, onCart, userName, onHistory, dailyLimit=15, deliveryHours={} }) {
  const icon = school?.icon || '🏫';
  const schoolName = school?.name || '학교 음료 주문';
  const nameColor = school?.nameColor || P;
  const fontOpt = FONT_OPTIONS.find(f=>f.id===(school?.fontId||'noto')) || FONT_OPTIONS[0];
  const bannerImg = banner?.image;
  return (
    <div style={S.screen}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 20px 6px'}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:nameColor,fontFamily:fontOpt.value}}>{icon} {schoolName}</div>
          <div style={{fontSize:11,color:'#888'}}>안녕하세요, {userName}님 👋</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {cartCount>0 && <button onClick={onCart} style={{...S.iconBtn,position:'relative'}}>🛒<span style={S.badge}>{cartCount}</span></button>}
          <button onClick={onAdmin} style={S.iconBtn}>⚙️</button>
        </div>
      </div>

      {/* 배너 */}
      <div style={{margin:'10px 16px',borderRadius:18,background:`linear-gradient(135deg,${P},${PGRAD})`,overflow:'hidden',position:'relative',minHeight:110,flexShrink:0}}>
        {bannerImg && <img src={bannerImg} alt="" onError={e=>e.target.style.display='none'} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.25}} />}
        <div style={{padding:'18px 22px',color:'#fff',position:'relative',zIndex:1,display:'flex',alignItems:'center'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:banner?.serviceLabelStyle?.size||12,opacity:0.85,marginBottom:4,color:banner?.serviceLabelStyle?.color||'rgba(255,255,255,0.9)',fontWeight:banner?.serviceLabelStyle?.bold?800:400,fontStyle:banner?.serviceLabelStyle?.italic?'italic':'normal',textDecoration:banner?.serviceLabelStyle?.underline?'underline':'none'}}>{banner?.serviceLabel||'음료 주문 서비스'}</div>
            <div style={{fontSize:19,fontWeight:800,lineHeight:1.35}}>{banner?.headline || `${schoolName} 음료를 주문하세요 🍹`}</div>
            <div style={{fontSize:banner?.subtextStyle?.size||12,marginTop:6,opacity:0.85,color:banner?.subtextStyle?.color||'rgba(255,255,255,0.85)',fontWeight:banner?.subtextStyle?.bold?700:400,fontStyle:banner?.subtextStyle?.italic?'italic':'normal',textDecoration:banner?.subtextStyle?.underline?'underline':'none'}}>{banner?.subtext || '매일 신선하게 준비됩니다'}</div>
          </div>
          {!bannerImg && <div style={{fontSize:44,opacity:0.3}}>☕</div>}
        </div>
      </div>

      <button onClick={onHistory} style={{margin:'0 16px 12px',padding:'11px 16px',background:'#f0faf4',border:`1px solid ${P}30`,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',width:'calc(100% - 32px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><span>📋</span><span style={{fontSize:14,fontWeight:600,color:P}}>내 주문 내역 보기</span></div>
        <span style={{color:'#555',fontSize:18}}>›</span>
      </button>

      <div style={{padding:'4px 20px 10px',fontSize:15,fontWeight:700,color:'#222'}}>카테고리</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,padding:'0 16px 10px'}}>
        {categories.map(cat => (
          <button key={cat.id} onClick={()=>onSelect(cat)} style={{background:'#f8f8f8',border:'none',borderRadius:14,padding:'14px 4px',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer',color:'#111'}}>
            <div style={{fontSize:30,marginBottom:5}}>{cat.icon}</div>
            <div style={{fontSize:12,fontWeight:600,color:'#333'}}>{cat.label}</div>
          </button>
        ))}
        <button onClick={()=>onSelect(null)} style={{background:`linear-gradient(135deg,${P},${PGRAD})`,border:'none',borderRadius:14,padding:'14px 4px',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer'}}>
          <div style={{fontSize:30,marginBottom:5}}>📋</div>
          <div style={{fontSize:12,fontWeight:600,color:'#fff'}}>전체</div>
        </button>
      </div>
    </div>
  );
}

// ─── LIST ─────────────────────────────────────────────────────
function ListScreen({ category, drinks, onBack, onSelect, cartCount, onCart }) {
  const [drinkCounts, setDrinkCounts] = useState({});
  useEffect(()=>{ getDailyData().then(d=>setDrinkCounts(d.drinkCounts||{})); },[]);
  const isSoldOut = (d) => d.dailyMax>0 && (drinkCounts[d.id||d.name]||0)>=d.dailyMax;
  return (
    <div style={S.screen}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>{category?category.label:"전체 메뉴"}</span><button onClick={onCart} style={{...S.iconBtn,position:'relative'}}>🛒{cartCount>0&&<span style={S.badge}>{cartCount}</span>}</button></div>
      <div style={{flex:1,overflowY:'auto',minHeight:0}}>
        {drinks.length===0&&<div style={S.empty}>등록된 음료가 없습니다</div>}
        {drinks.map(d=>(
          <button key={d.id} onClick={()=>!isSoldOut(d)&&onSelect(d)} style={{width:'100%',background:'none',border:'none',borderBottom:'1px solid #f5f5f5',display:'flex',alignItems:'center',padding:'14px 16px',cursor:isSoldOut(d)?'not-allowed':'pointer',gap:14,textAlign:'left',color:'#111',opacity:isSoldOut(d)?0.5:1}}>
            <DrinkImg src={d.image} alt={d.name} style={{width:80,height:80,borderRadius:50,objectFit:'cover',background:'#f5f5f5',flexShrink:0}} />
            <div style={{flex:1}}>
              {d.tagsEnabled!==false&&d.tags?.length>0&&<div style={{display:'flex',gap:4,marginBottom:4}}>{d.tags.map(t=><span key={t} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:d.tagStyle?.bg||'#fff3e0',color:d.tagStyle?.text||'#e65100'}}>{d.tagLabel||t}</span>)}</div>}
              <div style={{fontSize:15,fontWeight:700,color:'#111'}}>{d.name}</div>
              <div style={{fontSize:12,color:'#999',marginTop:1}}>{d.nameEn}</div>
              <div style={{fontSize:14,fontWeight:700,color:P,marginTop:4}}>{fmt(d.price)}</div>
            </div>
            <span style={{fontSize:22,color:'#ccc'}}>›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── DETAIL ───────────────────────────────────────────────────
function DetailScreen({ drink, onBack, onAddToCart }) {
  const [selSz,setSelSz]=useState(drink.sizes[0]);
  const [qty,setQty]=useState(1);
  const [opts,setOpts]=useState(()=>Object.fromEntries(drink.options.map(o=>[o.id,o.default])));
  const total=(drink.price+selSz.price)*qty;
  return (
    <div style={{...S.screen,display:'flex',flexDirection:'column',overflow:'hidden'}}>
      <div style={{flex:1,overflowY:'auto',minHeight:0,paddingBottom:8}}>
      <div style={{height:240,background:'#f8f8f8',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <button onClick={onBack} style={{position:'absolute',top:12,left:12,background:'rgba(255,255,255,0.9)',border:'none',borderRadius:50,width:36,height:36,fontSize:24,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#333'}}>‹</button>
        <DrinkImg src={drink.image} alt={drink.name} style={{width:180,height:180,objectFit:'cover',borderRadius:20}} />
      </div>
      <div style={{padding:'16px 20px'}}>
        {drink.tagsEnabled!==false&&drink.tags?.length>0&&<div style={{display:'flex',gap:4,marginBottom:6}}>{drink.tags.map(t=><span key={t} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:drink.tagStyle?.bg||'#fff3e0',color:drink.tagStyle?.text||'#e65100'}}>{drink.tagLabel||t}</span>)}</div>}
        <div style={{fontSize:22,fontWeight:800}}>{drink.name}</div>
        <div style={{fontSize:13,color:'#999',marginTop:2}}>{drink.nameEn}</div>
        <div style={{fontSize:13,color:'#666',marginTop:8,lineHeight:1.55}}>{drink.description}</div>
        <div style={{padding:'14px 0 8px',fontSize:15,fontWeight:700}}>컵 선택</div>
        <div style={{display:'flex',gap:10}}>
          {drink.sizes.map(sz=>(
            <button key={sz.label} onClick={()=>setSelSz(sz)} style={{flex:1,border:`2px solid ${selSz.label===sz.label?P:'#e0e0e0'}`,borderRadius:14,padding:'10px 4px',background:selSz.label===sz.label?'#f0faf4':'none',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer',gap:2}}>
              <span style={{fontSize:22}}>🥤</span><div style={{fontWeight:700,fontSize:14,color:selSz.label===sz.label?P:'#333'}}>{sz.label}</div>
              <div style={{fontSize:11,color:'#888'}}>{sz.ml}ml</div>
              {sz.price>0&&<div style={{fontSize:10,color:P}}>+{fmt(sz.price)}</div>}
            </button>
          ))}
        </div>
        {drink.options.length>0&&<>
          <div style={{padding:'14px 0 8px',fontSize:15,fontWeight:700}}>퍼스널 옵션</div>
          {drink.options.map(opt=>(
            <div key={opt.id} style={{marginBottom:14}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:8}}>{opt.label}</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {opt.choices.map(c=><button key={c} onClick={()=>setOpts(p=>({...p,[opt.id]:c}))} style={{border:`1.5px solid ${opts[opt.id]===c?P:'#ddd'}`,borderRadius:20,padding:'6px 14px',fontSize:12,cursor:'pointer',background:opts[opt.id]===c?P:'#fff',color:opts[opt.id]===c?'#fff':'#555'}}>{c}</button>)}
              </div>
            </div>
          ))}
        </>}
      </div>
      </div>
      {/* 하단 고정 액션바 */}
      <div style={{flexShrink:0,background:'#fff',padding:'10px 16px',borderTop:'1px solid #f0f0f0',display:'flex',gap:10,alignItems:'center'}}>
        <button style={{width:46,height:46,borderRadius:50,border:'1.5px solid #ddd',background:'#fff',fontSize:20,cursor:'pointer',color:'#e53935',flexShrink:0}}>♡</button>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={{width:32,height:32,borderRadius:50,border:'1.5px solid #ccc',background:'#f5f5f5',fontSize:18,cursor:'pointer',color:'#333',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
          <span style={{fontSize:15,fontWeight:700,minWidth:20,textAlign:'center'}}>{qty}</span>
          <button onClick={()=>setQty(q=>q+1)} style={{width:32,height:32,borderRadius:50,border:'1.5px solid #ccc',background:'#f5f5f5',fontSize:18,cursor:'pointer',color:'#333',display:'flex',alignItems:'center',justifyContent:'center'}}>＋</button>
        </div>
        <button onClick={onBack} style={{flex:1,height:46,borderRadius:24,border:'1.5px solid #ddd',background:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',color:'#333'}}>닫기</button>
        <button onClick={()=>onAddToCart({drink,selectedSize:selSz,optionChoices:opts,qty,totalPrice:total})} style={{flex:2,height:46,borderRadius:24,border:'none',background:P,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>담기 {fmt(total)}</button>
      </div>
    </div>
  );
}

// ─── CART ─────────────────────────────────────────────────────
function CartScreen({ cart, totalPrice, onBack, onRemove, onCheckout }) {
  return (
    <div style={S.screen}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>장바구니</span><span style={{width:36}}/></div>
      <div style={{flex:1,overflowY:'auto',minHeight:0,padding:'0 16px'}}>
        {cart.length===0&&<div style={S.empty}>장바구니가 비어있습니다 🛒</div>}
        {cart.map(item=>(
          <div key={item.cartId} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid #f5f5f5'}}>
            <DrinkImg src={item.drink.image} alt="" style={{width:60,height:60,borderRadius:12,objectFit:'cover',background:'#f5f5f5'}} />
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:14}}>{item.drink.name}</div>
              <div style={{fontSize:12,color:'#888',marginTop:2}}>{item.selectedSize.label} · {Object.values(item.optionChoices).join(' · ')}</div>
              <div style={{fontSize:13,color:P,fontWeight:700,marginTop:2}}>{fmt(item.totalPrice)} × {item.qty}</div>
            </div>
            <button onClick={()=>onRemove(item.cartId)} style={{background:'none',border:'none',color:'#ccc',fontSize:18,cursor:'pointer'}}>✕</button>
          </div>
        ))}
      </div>
      {cart.length>0&&(
        <div style={{padding:16,borderTop:'1px solid #f0f0f0',flexShrink:0}}>
          <div style={{display:'flex',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:15,fontWeight:600}}>합계</span>
            <span style={{fontSize:20,fontWeight:800,color:P}}>{fmt(totalPrice)}</span>
          </div>
          <button onClick={onCheckout} style={{width:'100%',height:50,borderRadius:24,border:'none',background:P,color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer'}}>주문하기</button>
        </div>
      )}
    </div>
  );
}

// ─── ORDER MODAL ──────────────────────────────────────────────
function OrderModal({ totalPrice, userName, deliveryHours, dailyLimit=15, slotLimit=3, onCancel, onConfirm, cart }) {
  const [dailyCount, setDailyCount] = useState(0);
  const [slotCounts, setSlotCounts] = useState({});
  useEffect(() => { getDailyData().then(d=>{ setDailyCount(d.count||0); setSlotCounts(d.slotCounts||{}); }); }, []);
  const isSlotFull = (t) => slotLimit>0 && (slotCounts[t]||0) >= slotLimit;
  const slotRemain = (t) => Math.max(0, slotLimit - (slotCounts[t]||0));
  const newQty = cart ? cart.reduce((s,i)=>s+i.qty,0) : 0;
  const dailyRemain = dailyLimit - dailyCount;
  const dates = getDeliveryDates();
  const [name,setName]=useState(userName);
  const [location,setLocation]=useState("");
  const [extraRequest,setExtraRequest]=useState("");
  const [date,setDate]=useState(dates[0]);
  const [time,setTime]=useState(()=>{ const s=getTimeSlotsForDay(deliveryHours[dates[0].dow],true); return s[0]||''; });
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState("");
  const isToday=date.value===dates[0].value;
  const slots=getTimeSlotsForDay(deliveryHours[date.dow], isToday);
  const [isTakeout, setIsTakeout] = useState(false);
  const dayEnabled=deliveryHours[date.dow]?.enabled;
  const handleDateChange=(d)=>{ setDate(d); const s=getTimeSlotsForDay(deliveryHours[d.dow],d.value===dates[0].value); setTime(s[0]||''); };
  const submit=async()=>{ if(!name.trim()){setErr("이름을 입력해주세요");return;} if(!isTakeout&&!location.trim()){setErr("배달 장소를 입력해주세요");return;} if(!time){setErr("배달 가능한 시간이 없습니다");return;} setErr(""); setLoading(true); await onConfirm({name:name.trim(),location:isTakeout?'🛍️ 테이크아웃: 1층 통합교육지원반':location.trim(),extraRequest:extraRequest.trim(),deliveryDate:date.value,deliveryLabel:`${date.tag} ${date.label}`,deliveryTime:time,isTakeout}); setLoading(false); };
  const monthlyUsed = getMonthlyTotal(name||userName);
  const monthlyRemain = MONTHLY_LIMIT - monthlyUsed;
  const canOrder=!!time&&dayEnabled&&dailyRemain>0&&monthlyRemain>0&&!isSlotFull(time);
  return (
    <div style={S.overlay}>
      <div style={{background:'#fff',borderRadius:'22px 22px 0 0',padding:'16px 20px 32px',position:'absolute',bottom:0,left:0,right:0,maxHeight:'90%',overflowY:'auto'}}>
        <div style={{width:36,height:4,background:'#ddd',borderRadius:2,margin:'0 auto 16px'}} />
        <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>주문 정보 입력</div>
        <div style={S.fLabel}>주문자 이름</div>
        <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} placeholder="이름" style={S.mInput} />
        <div style={S.fLabel}>수령 방법</div>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <button onClick={()=>setIsTakeout(false)} style={{flex:1,padding:'10px 0',border:`2px solid ${!isTakeout?P:'#e0e0e0'}`,borderRadius:12,background:!isTakeout?PLIGHT:'#fff',color:!isTakeout?P:'#666',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            🚚 배달
          </button>
          <button onClick={()=>{setIsTakeout(true);setLocation('');setErr('');}} style={{flex:1,padding:'10px 0',border:`2px solid ${isTakeout?P:'#e0e0e0'}`,borderRadius:12,background:isTakeout?PLIGHT:'#fff',color:isTakeout?P:'#666',fontSize:13,fontWeight:700,cursor:'pointer'}}>
            🛍️ 테이크아웃
          </button>
        </div>
        <div style={S.fLabel}>배달 장소</div>
        <input value={location} onChange={e=>{setLocation(e.target.value);setErr("");}} placeholder={isTakeout?'테이크아웃: 1층 통합교육지원반':'예) 3학년 2반, 교무실'} disabled={isTakeout} style={{...S.mInput,background:isTakeout?'#f5f5f5':'#fff',color:isTakeout?'#aaa':'#111',cursor:isTakeout?'not-allowed':'text'}} />
        {isTakeout&&<div style={{fontSize:12,color:P,marginTop:-8,marginBottom:10,paddingLeft:4}}>🛍️ 테이크아웃: 1층 통합교육지원반</div>}
        <div style={S.fLabel}>기타 요청사항 (선택)</div>
        <input value={extraRequest} onChange={e=>setExtraRequest(e.target.value)} placeholder="예) 빨대 빼주세요, 뜨겁게 해주세요" style={{...S.mInput,marginBottom:16}} />
        <div style={S.fLabel}>배달 날짜</div>
        <div style={{display:'flex',gap:10,marginBottom:14}}>
          {dates.map(d=>(
            <button key={d.value} onClick={()=>handleDateChange(d)} style={{flex:1,padding:'10px 8px',border:`2px solid ${date.value===d.value?P:'#e0e0e0'}`,borderRadius:12,background:date.value===d.value?'#f0faf4':'#fff',cursor:'pointer',textAlign:'center',color:'#111'}}>
              <div style={{fontSize:11,fontWeight:700,color:date.value===d.value?P:'#999',marginBottom:3}}>{d.tag}</div>
              <div style={{fontSize:13,fontWeight:600,color:date.value===d.value?P:'#444'}}>{d.label}</div>
            </button>
          ))}
        </div>
        <div style={S.fLabel}>배달 시간</div>
        {!dayEnabled ? <div style={{padding:'12px 14px',background:'#fff3e0',borderRadius:12,marginBottom:16,fontSize:13,color:'#e65100'}}>⚠️ {WDAY_FULL[date.dow]}은 배달 운영일이 아닙니다</div>
         : slots.length===0 ? <div style={{padding:'12px 14px',background:'#fff3e0',borderRadius:12,marginBottom:16,fontSize:13,color:'#e65100'}}>⚠️ 오늘 주문 가능한 시간이 지났습니다. 내일을 선택해주세요.</div>
         : <div style={{marginBottom:14}}>
             {/* 시간대 그룹 선택 */}
             <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap'}}>
               {[...new Set(slots.map(s=>s.split(':')[0]))].map(h=>{
                 const hourSlots=slots.filter(s=>s.startsWith(h+':'));
                 const allFull=hourSlots.every(s=>isSlotFull(s));
                 return <button key={h} onClick={()=>{ const first=hourSlots.find(s=>!isSlotFull(s)); if(first) setTime(first); }} disabled={allFull} style={{padding:'5px 12px',border:`1.5px solid ${allFull?'#eee':time?.startsWith(h+':')?P:'#e0e0e0'}`,borderRadius:20,background:allFull?'#f5f5f5':time?.startsWith(h+':')?P:'#fff',color:allFull?'#bbb':time?.startsWith(h+':')?'#fff':'#555',fontSize:12,fontWeight:700,cursor:allFull?'not-allowed':'pointer'}}>
                   {h}시{allFull?'(마감)':''}
                 </button>;
               })}
             </div>
             {/* 선택된 시간대의 분 선택 */}
             {time&&<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
               {slots.filter(s=>s.startsWith(time.split(':')[0]+':')).map(s=>{
                 const full=isSlotFull(s); const remain=slotRemain(s);
                 return <button key={s} onClick={()=>!full&&setTime(s)} disabled={full} style={{padding:'6px 12px',border:`1.5px solid ${full?'#eee':time===s?P:'#e0e0e0'}`,borderRadius:20,background:full?'#f5f5f5':time===s?P:'#fff',color:full?'#bbb':time===s?'#fff':'#555',fontSize:12,fontWeight:time===s?700:400,cursor:full?'not-allowed':'pointer',display:'flex',flexDirection:'column',alignItems:'center',gap:1}}>
                   <span>{s}</span>
                   <span style={{fontSize:9,opacity:0.8}}>{full?'마감':`${remain}자리`}</span>
                 </button>;
               })}
             </div>}
           </div>}
        {time&&dayEnabled&&<div style={{background:'#f0faf4',borderRadius:12,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:18}}>📅</span><div><div style={{fontSize:12,color:'#888'}}>선택된 배달 일시</div><div style={{fontSize:14,fontWeight:700,color:P}}>{date.tag} {date.label} {time}</div></div></div>}
        {err&&<div style={{color:'#e53935',fontSize:13,marginBottom:10}}>⚠️ {err}</div>}
        {/* 하루 잔수 한도 표시 */}
        {(()=>{ const pct=Math.min(100,Math.round(dailyCount/dailyLimit*100));
          return (<div style={{background:dailyRemain<=0?'#ffebee':dailyRemain<=3?'#fff3e0':'#f0faf4',borderRadius:12,padding:'10px 14px',marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:12,color:'#666'}}>🧋 오늘 주문 현황</span>
              <span style={{fontSize:12,fontWeight:700,color:dailyRemain<=0?'#c62828':dailyRemain<=3?'#e65100':P}}>{dailyCount}잔 / {dailyLimit}잔</span>
            </div>
            <div style={{background:'#e0e0e0',borderRadius:4,height:6}}>
              <div style={{width:`${pct}%`,height:'100%',borderRadius:4,background:dailyRemain<=0?'#c62828':dailyRemain<=3?'#e65100':P}} />
            </div>
            {dailyRemain<=0&&<div style={{fontSize:11,color:'#c62828',marginTop:4}}>⚠️ 오늘 주문 마감 ({dailyLimit}잔 완료)</div>}
            {dailyRemain>0&&dailyRemain<=3&&<div style={{fontSize:11,color:'#e65100',marginTop:4}}>⚠️ 오늘 남은 잔수: {dailyRemain}잔</div>}
          </div>);
        })()}
        {/* 월 한도 표시 */}
        {(()=>{ const used=getMonthlyTotal(name||userName); const remain=MONTHLY_LIMIT-used; const pct=Math.min(100,Math.round(used/MONTHLY_LIMIT*100));
          return (<div style={{background:remain<=0?'#ffebee':remain<3000?'#fff3e0':'#f0faf4',borderRadius:12,padding:'10px 14px',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:6}}>
              <span style={{fontSize:12,color:'#666'}}>이번달 사용</span>
              <span style={{fontSize:12,fontWeight:700,color:remain<=0?'#c62828':remain<3000?'#e65100':P}}>{fmt(used)} / {fmt(MONTHLY_LIMIT)}</span>
            </div>
            <div style={{background:'#e0e0e0',borderRadius:4,height:6}}>
              <div style={{width:`${pct}%`,height:'100%',borderRadius:4,background:remain<=0?'#c62828':remain<3000?'#e65100':P}} />
            </div>
            {remain<=0&&<div style={{fontSize:11,color:'#c62828',marginTop:4}}>⚠️ 월 한도 초과 - 주문 불가</div>}
            {remain>0&&remain<3000&&<div style={{fontSize:11,color:'#e65100',marginTop:4}}>⚠️ 남은 한도: {fmt(remain)}</div>}
          </div>);
        })()}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'#f8f8f8',borderRadius:12,padding:'12px 16px',marginBottom:16}}>
          <span style={{fontSize:14,color:'#666'}}>합계 금액</span><span style={{fontSize:20,fontWeight:800,color:P}}>{fmt(totalPrice)}</span>
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={onCancel} style={{flex:1,height:48,borderRadius:24,border:'1.5px solid #ddd',background:'#f5f5f5',fontSize:15,fontWeight:700,cursor:'pointer',color:'#333'}}>취소</button>
          <button onClick={submit} disabled={loading||!canOrder} style={{flex:2,height:48,borderRadius:24,border:'none',background:(loading||!canOrder)?'#bbb':P,color:'#fff',fontSize:15,fontWeight:700,cursor:(loading||!canOrder)?'default':'pointer'}}>{loading?"처리 중...":"주문 완료"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── ORDER SUCCESS ────────────────────────────────────────────
function OrderSuccessScreen({ order, onDone }) {
  return (
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:`linear-gradient(160deg,${P} 0%,${PGRAD} 100%)`,padding:'32px 24px'}}>
      <div style={{fontSize:72}}>🎉</div>
      <div style={{fontSize:30,fontWeight:800,color:'#fff',marginTop:12}}>주문 완료!</div>
      <div style={{fontSize:14,color:'rgba(255,255,255,0.8)',marginTop:6,marginBottom:24}}>주문이 성공적으로 접수되었습니다</div>
      <div style={{background:'rgba(255,255,255,0.15)',borderRadius:18,padding:'18px 20px',width:'100%',marginBottom:24}}>
        <div style={{color:'rgba(255,255,255,0.7)',fontSize:12,marginBottom:10,fontWeight:600}}>주문 요약</div>
        <div style={{color:'#fff',fontSize:14,marginBottom:4}}>📍 {order.location}</div>
        <div style={{color:'#fff',fontSize:14,marginBottom:order.extraRequest?4:14}}>📅 {order.deliveryLabel} {order.deliveryTime}</div>
        {order.extraRequest&&<div style={{color:'rgba(255,255,255,0.8)',fontSize:13,marginBottom:14}}>📝 {order.extraRequest}</div>}
        <div style={{borderTop:'1px solid rgba(255,255,255,0.2)',paddingTop:12}}>
          {order.items.map((item,i)=><div key={i} style={{color:'rgba(255,255,255,0.9)',fontSize:13,marginBottom:5}}>• {item.name} ({item.size}) ×{item.qty} — {fmt(item.price)}</div>)}
          <div style={{color:'#fff',fontSize:17,fontWeight:800,textAlign:'right',marginTop:10}}>{fmt(order.totalPrice)}</div>
        </div>
      </div>
      <button onClick={onDone} style={{width:'100%',height:50,borderRadius:25,border:'none',background:'#fff',color:P,fontSize:16,fontWeight:700,cursor:'pointer'}}>홈으로 가기</button>
    </div>
  );
}

// ─── HISTORY (개인) ───────────────────────────────────────────
function HistoryScreen({ userName, onBack }) {
  const [orders,setOrders]=useState(null);
  const [tab,setTab]=useState('recent');
  const [open,setOpen]=useState({});
  useEffect(()=>{ getUserOrders(userName).then(setOrders); },[userName]);
  if (!orders) return <div style={S.screen}><div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>주문 내역</span><span/></div><div style={S.empty}>로딩 중...</div></div>;
  const byMonth=groupByMonth(orders);
  const monthKeys=Object.keys(byMonth).sort().reverse();
  return (
    <div style={S.screen}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>내 주문 내역</span><span style={{fontSize:12,color:'#aaa'}}>총 {orders.length}건</span></div>
      <div style={{display:'flex',borderBottom:'2px solid #f0f0f0',flexShrink:0}}>
        {[{id:'recent',label:'⏰ 최근'},{id:'monthly',label:'📅 월별'}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:'12px',border:'none',background:'none',fontSize:13,fontWeight:700,cursor:'pointer',color:'#111',borderBottom:`2px solid ${tab===t.id?P:'transparent'}`,marginBottom:-2}}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',minHeight:0,padding:'8px 0'}}>
        {orders.length===0&&<div style={S.empty}>아직 주문 내역이 없습니다 📋</div>}
        {tab==='recent'&&orders.slice(0,30).map(o=><OrderCard key={o.id} order={o} />)}
        {tab==='monthly'&&monthKeys.map(mk=>{
          const mo=byMonth[mk],mTotal=mo.reduce((s,o)=>s+o.totalPrice,0),isOpen=!!open[mk];
          return (
            <div key={mk} style={{margin:'0 16px 12px',border:'1px solid #f0f0f0',borderRadius:14,overflow:'hidden'}}>
              <button onClick={()=>setOpen(p=>({...p,[mk]:!p[mk]}))} style={{width:'100%',padding:'14px 16px',background:isOpen?'#f0faf4':'#fafafa',border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:'#111'}}>
                <div style={{textAlign:'left'}}><div style={{fontSize:15,fontWeight:700}}>{fmtMonth(mk)}</div><div style={{fontSize:12,color:'#888',marginTop:2}}>{mo.length}건 · {fmt(mTotal)}</div></div>
                <span style={{color:'#555',fontSize:18}}>{isOpen?'∧':'∨'}</span>
              </button>
              {isOpen&&mo.map(o=><OrderCard key={o.id} order={o} compact />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function OrderCard({ order, compact }) {
  const [exp,setExp]=useState(false);
  const dt=order.orderTime?new Date(order.orderTime).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'';
  return (
    <div style={{borderBottom:compact?'1px solid #f5f5f5':'none',margin:compact?0:'0 16px 10px',border:compact?'none':'1px solid #f0f0f0',borderRadius:compact?0:14,overflow:'hidden'}}>
      <button onClick={()=>setExp(p=>!p)} style={{width:'100%',padding:'12px 16px',background:'none',border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',textAlign:'left',color:'#111'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700}}>{order.deliveryLabel} {order.deliveryTime}</div>
          <div style={{fontSize:12,color:'#888',marginTop:2}}>{order.location} · {order.items?.length||0}종 · <span style={{color:P,fontWeight:600}}>{fmt(order.totalPrice)}</span></div>
          <div style={{fontSize:11,color:'#bbb',marginTop:1}}>{dt} 주문</div>
        </div>
        <span style={{color:'#ccc',fontWeight:700}}>{exp?'∧':'∨'}</span>
      </button>
      {exp&&(
        <div style={{padding:'0 16px 14px',borderTop:'1px solid #f5f5f5'}}>
          {order.extraRequest&&<div style={{fontSize:12,color:'#666',marginBottom:10,padding:'8px 12px',background:'#f8f8f8',borderRadius:8}}>📝 {order.extraRequest}</div>}
          {order.items?.map((item,i)=>(
            <div key={i} style={{padding:'8px 0',borderBottom:i<order.items.length-1?'1px dashed #f5f5f5':'none'}}>
              <div style={{fontWeight:600,fontSize:13}}>{item.name} ({item.size}) ×{item.qty}</div>
              {item.options?.length>0&&<div style={{fontSize:12,color:'#888',marginTop:2}}>{item.options.join(' · ')}</div>}
              <div style={{fontSize:12,color:P,fontWeight:700,marginTop:2}}>{fmt(item.price)}</div>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',marginTop:10,paddingTop:8,borderTop:'1px solid #f0f0f0'}}>
            <span style={{fontSize:13,fontWeight:600}}>합계</span><span style={{fontSize:15,fontWeight:800,color:P}}>{fmt(order.totalPrice)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── ADMIN ────────────────────────────────────────────────────
function AdminScreen({ drinks, cats, settings, activeTab, onTabChange, onBack, onEdit, onNew, onDelete, onToggleCat, onUpdateCat, onAddCat, onSaveSettings, onReorder, onToggleVisible }) {
  return (
    <div style={S.screen}>
      <div style={S.navBar}>
        <button onClick={onBack} style={S.backBtn}>‹</button>
        <span style={S.navTitle}>관리자 메뉴</span>
        {activeTab==="drinks"?<button onClick={onNew} style={S.newBtn}>+ 추가</button>:<span style={{width:50}}/>}
      </div>
      <div style={{display:'flex',borderBottom:'2px solid #f0f0f0',flexShrink:0}}>
        {[{id:"drinks",label:"🥤 음료"},{id:"categories",label:"📂 카테고리"},{id:"orders",label:"📊 주문현황"},{id:"settings",label:"⚙️ 설정"}].map(t=>(
          <button key={t.id} onClick={()=>onTabChange(t.id)} style={{flex:1,padding:'10px 2px',border:'none',background:'none',fontSize:11,fontWeight:700,cursor:'pointer',color:'#111',borderBottom:`2px solid ${activeTab===t.id?P:'transparent'}`,marginBottom:-2}}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',minHeight:0}}>
        {activeTab==="drinks"     && <DrinksTab drinks={drinks} onEdit={onEdit} onNew={onNew} onDelete={onDelete} onReorder={onReorder} onToggleVisible={onToggleVisible} />}
        {activeTab==="categories" && <CategoriesTab cats={cats} onToggle={onToggleCat} onUpdate={onUpdateCat} onAdd={onAddCat} onReorder={newCats=>setCats(newCats)} />}
        {activeTab==="orders"     && <AdminOrdersTab />}
        {activeTab==="settings"   && <SettingsTab settings={settings} onSave={onSaveSettings} />}
      </div>
    </div>
  );
}

function DrinksTab({ drinks, onEdit, onNew, onDelete, onReorder, onToggleVisible }) {
  const [confirm,setConfirm]=useState(null);
  return (
    <div style={{flex:1,overflowY:'auto',minHeight:0,padding:'0 16px'}}>
      {drinks.length===0&&<div style={S.empty}>등록된 음료가 없습니다</div>}
      {drinks.map((d,di)=>(
        <div key={d.id} style={{display:'flex',alignItems:'center',gap:6,padding:'10px 0',borderBottom:'1px solid #f5f5f5',opacity:d.visible===false?0.4:1}}>
          {/* 순서 ↑↓ */}
          <div style={{display:'flex',flexDirection:'column',gap:2,flexShrink:0}}>
            <button onClick={()=>{if(di>0){const a=[...drinks];[a[di-1],a[di]]=[a[di],a[di-1]];onReorder(a);}}} disabled={di===0} style={{width:24,height:24,border:'1px solid #ddd',borderRadius:5,background:di===0?'#f5f5f5':'#fff',cursor:di===0?'default':'pointer',fontSize:10,color:di===0?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↑</button>
            <button onClick={()=>{if(di<drinks.length-1){const a=[...drinks];[a[di],a[di+1]]=[a[di+1],a[di]];onReorder(a);}}} disabled={di===drinks.length-1} style={{width:24,height:24,border:'1px solid #ddd',borderRadius:5,background:di===drinks.length-1?'#f5f5f5':'#fff',cursor:di===drinks.length-1?'default':'pointer',fontSize:10,color:di===drinks.length-1?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↓</button>
          </div>
          <DrinkImg src={d.image} alt="" style={{width:50,height:50,borderRadius:10,objectFit:'cover',background:'#f5f5f5',flexShrink:0}} />
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</div>
            <div style={{fontSize:11,color:'#888',display:'flex',gap:4,marginTop:2}}>
              <span>{d.sizes?.[0]?.price?.toLocaleString()}원~</span>
              {d.dailyMax>0&&<span style={{color:'#1565c0'}}>일{d.dailyMax}잔</span>}
              {d.tagsEnabled!==false&&d.tags?.length>0&&<span style={{color:'#e65100'}}>{d.tagLabel||d.tags[0]}</span>}
            </div>
          </div>
          {/* 숨김 토글 */}
          <button onClick={()=>onToggleVisible(d.id)} title={d.visible===false?'숨김 중 (클릭시 표시)':'표시 중 (클릭시 숨김)'} style={{width:32,height:32,borderRadius:8,border:`1px solid ${d.visible===false?'#ffcdd2':'#c8e6c9'}`,background:d.visible===false?'#ffebee':'#e8f5e9',cursor:'pointer',fontSize:15,flexShrink:0}}>
            {d.visible===false?'🙈':'👁️'}
          </button>
          <button onClick={()=>onEdit(d)} style={{...S.editBtn,flexShrink:0}}>수정</button>
          <button onClick={()=>setConfirm(d.id)} style={{...S.delBtn,flexShrink:0}}>삭제</button>
        </div>
      ))}
      {confirm&&<div style={S.overlay}><div style={{background:'#fff',borderRadius:20,padding:24,width:260,margin:'auto'}}><div style={{fontWeight:700,textAlign:'center',marginBottom:4}}>음료를 삭제할까요?</div><div style={{fontSize:13,color:'#888',textAlign:'center',marginBottom:20}}>삭제 후 복구할 수 없습니다</div><div style={{display:'flex',gap:10}}><button onClick={()=>setConfirm(null)} style={{flex:1,height:44,borderRadius:22,border:'1px solid #ddd',background:'#f5f5f5',cursor:'pointer',fontWeight:600,color:'#333'}}>취소</button><button onClick={()=>{onDelete(confirm);setConfirm(null);}} style={{flex:1,height:44,borderRadius:22,border:'2px solid #e53935',background:'#fff0f0',color:'#c62828',fontWeight:700,cursor:'pointer'}}>삭제</button></div></div></div>}
    </div>
  );
}

function NewCatForm({ onAdd }) {
  const [show,setShow] = useState(false);
  const [icon,setIcon] = useState('');
  const [label,setLabel] = useState('');
  const save = () => {
    if(!label.trim()) return;
    onAdd({ icon: icon||'☕', label: label.trim() });
    setIcon(''); setLabel(''); setShow(false);
  };
  return (
    <div style={{marginBottom:12}}>
      {!show ? (
        <button onClick={()=>setShow(true)} style={{width:'100%',padding:'10px',border:`1.5px dashed ${P}`,borderRadius:12,background:'#f0faf4',color:P,fontSize:13,fontWeight:700,cursor:'pointer'}}>
          + 새 카테고리 추가
        </button>
      ) : (
        <div style={{background:'#f0faf4',borderRadius:14,padding:14,marginBottom:8}}>
          <div style={{fontSize:13,fontWeight:600,color:P,marginBottom:10}}>새 카테고리</div>
          <div style={{display:'flex',gap:8,marginBottom:8}}>
            <input value={icon} onChange={e=>setIcon(e.target.value)} placeholder="🍵" style={{...S.input,width:56,marginBottom:0,textAlign:'center',fontSize:22}} />
            <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="카테고리 이름" style={{...S.input,flex:1,marginBottom:0}} autoFocus onKeyDown={e=>e.key==='Enter'&&save()} />
          </div>
          <div style={{display:'flex',gap:8}}>
            <button onClick={save} disabled={!label.trim()} style={{flex:1,height:38,borderRadius:19,border:'none',background:label.trim()?P:'#ddd',color:'#fff',fontWeight:700,cursor:label.trim()?'pointer':'default',fontSize:13}}>추가</button>
            <button onClick={()=>{setShow(false);setIcon('');setLabel('');}} style={{flex:1,height:38,borderRadius:19,border:'1px solid #ddd',background:'#fff',cursor:'pointer',fontSize:13}}>취소</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CategoriesTab({ cats, onToggle, onUpdate, onAdd, onReorder }) {
  const [editing,setEditing]=useState(null);
  const [ef,setEf]=useState({label:'',icon:''});
  return (
    <div style={{flex:1,overflowY:'auto',minHeight:0,padding:16}}>
      <div style={{fontSize:13,color:'#555',lineHeight:1.6,padding:'10px 14px',background:'#f0faf4',borderRadius:12,marginBottom:16,borderLeft:`3px solid ${P}`}}>💡 이름·아이콘 수정 및 노출 여부 설정</div>
      {/* 새 카테고리 추가 */}
      <NewCatForm onAdd={onAdd} />
      {cats.map((cat,ci)=>(
        <div key={cat.id} style={{borderBottom:'1px solid #f5f5f5',display:'flex',alignItems:'stretch'}}>
          <div style={{display:'flex',flexDirection:'column',justifyContent:'center',gap:2,padding:'8px 4px 8px 0',flexShrink:0}}>
            <button onClick={()=>{ if(ci>0){const a=[...cats];[a[ci-1],a[ci]]=[a[ci],a[ci-1]];onReorder(a);} }} disabled={ci===0} style={{width:24,height:24,border:'1px solid #ddd',borderRadius:5,background:ci===0?'#f9f9f9':'#fff',cursor:ci===0?'default':'pointer',fontSize:11,color:ci===0?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↑</button>
            <button onClick={()=>{ if(ci<cats.length-1){const a=[...cats];[a[ci],a[ci+1]]=[a[ci+1],a[ci]];onReorder(a);} }} disabled={ci===cats.length-1} style={{width:24,height:24,border:'1px solid #ddd',borderRadius:5,background:ci===cats.length-1?'#f9f9f9':'#fff',cursor:ci===cats.length-1?'default':'pointer',fontSize:11,color:ci===cats.length-1?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↓</button>
          </div>
          <div style={{flex:1}}>
          {editing===cat.id?(
            <div style={{padding:'14px 0'}}>
              <div style={{display:'flex',gap:8,marginBottom:10}}>
                <input value={ef.icon} onChange={e=>setEf(p=>({...p,icon:e.target.value}))} placeholder="🍵" style={{...S.input,width:60,marginBottom:0,textAlign:'center',fontSize:22}} />
                <input value={ef.label} onChange={e=>setEf(p=>({...p,label:e.target.value}))} placeholder="카테고리 이름" style={{...S.input,flex:1,marginBottom:0}} />
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>{onUpdate(cat.id,ef);setEditing(null);}} style={{flex:1,height:38,borderRadius:19,border:'none',background:P,color:'#fff',fontWeight:700,cursor:'pointer',fontSize:13}}>저장</button>
                <button onClick={()=>setEditing(null)} style={{flex:1,height:38,borderRadius:19,border:'1px solid #ddd',background:'#f5f5f5',cursor:'pointer',fontSize:13,color:'#333'}}>취소</button>
              </div>
            </div>
          ):(
            <div style={{display:'flex',alignItems:'center',gap:12,padding:'13px 0'}}>
              <span style={{fontSize:26,width:34,textAlign:'center'}}>{cat.icon}</span>
              <div style={{flex:1}}><div style={{fontSize:15,fontWeight:600}}>{cat.label}</div><div style={{fontSize:11,color:cat.visible?P:'#aaa',marginTop:1}}>{cat.visible?'✅ 표시 중':'🔒 숨김'}</div></div>
              <button onClick={()=>{setEditing(cat.id);setEf({label:cat.label,icon:cat.icon});}} style={S.editBtn}>수정</button>
              <Tog on={cat.visible} color={P} onChange={()=>onToggle(cat.id)} />
            </div>
          )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── ADMIN ORDERS ─────────────────────────────────────────────
function AdminOrdersTab() {
  const [orders,setOrders]=useState(null);
  const [subTab,setSubTab]=useState('daily');
  const [open,setOpen]=useState({});
  const [delConfirm,setDelConfirm]=useState(null);
  useEffect(()=>{ getAllOrders().then(setOrders); },[]);
  const handleDelete=async(orderId)=>{
    await deleteOrder(orderId);
    setOrders(p=>p.filter(o=>String(o.id)!==String(orderId)));
    setDelConfirm(null);
  };
  if (!orders) return <div style={S.empty}>로딩 중...<br/><span style={{fontSize:12,color:'#aaa'}}>전체 주문 내역을 불러오는 중</span></div>;
  if (delConfirm!==null) return (
    <div style={S.overlay}><div style={{background:'#fff',borderRadius:20,padding:24,width:270,margin:'auto',textAlign:'center'}}>
      <div style={{fontSize:18,marginBottom:8}}>🗑️</div>
      <div style={{fontWeight:700,marginBottom:6}}>주문을 삭제할까요?</div>
      <div style={{fontSize:13,color:'#888',marginBottom:20}}>삭제 후 복구할 수 없습니다</div>
      <div style={{display:'flex',gap:10}}>
        <button onClick={()=>setDelConfirm(null)} style={{flex:1,height:44,borderRadius:22,border:'1px solid #ddd',background:'#f5f5f5',cursor:'pointer',fontWeight:600,color:'#333'}}>취소</button>
        <button onClick={()=>handleDelete(delConfirm)} style={{flex:1,height:44,borderRadius:22,border:'2px solid #e53935',background:'#fff0f0',color:'#c62828',fontWeight:700,cursor:'pointer'}}>삭제</button>
      </div>
    </div></div>
  );

  const today=new Date().toISOString().split('T')[0];
  const thisMonth=today.substring(0,7);
  const todayCnt=orders.filter(o=>o.orderTime?.startsWith(today)).length;
  const totalRevenue=orders.reduce((s,o)=>s+(o.totalPrice||0),0);
  const monthRevenue=orders.filter(o=>o.orderTime?.startsWith(thisMonth)).reduce((s,o)=>s+(o.totalPrice||0),0);

  const byDate=groupByDate(orders);
  const byMon=groupByMonth(orders);
  const byCust=groupByCustomer(orders);
  const dateKeys=Object.keys(byDate).sort().reverse();
  const monKeys=Object.keys(byMon).sort().reverse();
  const custKeys=Object.keys(byCust).sort();

  const toggle=(k)=>setOpen(p=>({...p,[k]:!p[k]}));

  const GroupRow=({label,sub,orders:grpOrders,groupKey})=>{
    const total=grpOrders.reduce((s,o)=>s+(o.totalPrice||0),0);
    const isOpen=!!open[groupKey];
    return (
      <div style={{margin:'0 16px 10px',border:'1px solid #f0f0f0',borderRadius:14,overflow:'hidden'}}>
        <button onClick={()=>toggle(groupKey)} style={{width:'100%',padding:'12px 16px',background:isOpen?'#f0faf4':'#fafafa',border:'none',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',color:'#111'}}>
          <div style={{textAlign:'left'}}>
            <div style={{fontSize:14,fontWeight:700,color:'#111'}}>{label}</div>
            <div style={{fontSize:12,color:'#888',marginTop:2}}>{sub} · {grpOrders.length}건 · <span style={{color:P,fontWeight:700}}>{fmt(total)}</span></div>
          </div>
          <span style={{color:'#555',fontSize:18}}>{isOpen?'∧':'∨'}</span>
        </button>
        {isOpen&&(
          <div style={{background:'#fff',padding:'0 16px 12px',borderTop:'1px solid #f5f5f5'}}>
            {grpOrders.map((o,i)=>(
              <div key={o.id||i} style={{padding:'10px 0',borderBottom:i<grpOrders.length-1?'1px dashed #f0f0f0':'none'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700}}>{o.name} → {o.location}</div>
                    <div style={{fontSize:11,color:'#888',marginTop:2}}>📅 {o.deliveryLabel} {o.deliveryTime}</div>
                    {o.extraRequest&&<div style={{fontSize:11,color:'#666',marginTop:1}}>📝 {o.extraRequest}</div>}
                    <div style={{fontSize:11,color:'#bbb',marginTop:2}}>{o.orderTime?new Date(o.orderTime).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):''} 주문</div>
                    {o.items?.map((item,j)=><div key={j} style={{fontSize:12,color:'#555',marginTop:2}}>• {item.name} ({item.size}) ×{item.qty}</div>)}
                  </div>
                  <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6,flexShrink:0,marginLeft:8}}>
                    <span style={{fontSize:14,fontWeight:700,color:P}}>{fmt(o.totalPrice||0)}</span>
                    <button onClick={()=>setDelConfirm(o.id||i)} style={{fontSize:11,padding:'3px 8px',border:'1px solid #ffcdd2',borderRadius:8,background:'#ffebee',color:'#c62828',cursor:'pointer',fontWeight:600}}>삭제</button>
                  </div>
                </div>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:6,borderTop:'1px solid #f0f0f0'}}>
              <span style={{fontSize:13,fontWeight:600}}>소계</span>
              <span style={{fontSize:14,fontWeight:800,color:P}}>{fmt(total)}</span>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{display:'flex',flexDirection:'column',flex:1,minHeight:0}}>
      {/* 요약 카드 */}
      <div style={{display:'flex',gap:8,padding:'12px 16px',flexShrink:0}}>
        {[{label:'전체 주문',val:`${orders.length}건`,sub:fmt(totalRevenue)},{label:'이번달',val:`${(byMon[thisMonth]||[]).length}건`,sub:fmt(monthRevenue)},{label:'오늘',val:`${todayCnt}건`,sub:''}].map(c=>(
          <div key={c.label} style={{flex:1,background:'#f0faf4',borderRadius:12,padding:'10px 8px',textAlign:'center'}}>
            <div style={{fontSize:10,color:'#888',marginBottom:2}}>{c.label}</div>
            <div style={{fontSize:16,fontWeight:800,color:P}}>{c.val}</div>
            {c.sub&&<div style={{fontSize:10,color:'#888',marginTop:1}}>{c.sub}</div>}
          </div>
        ))}
      </div>
      {/* 서브탭 */}
      <div style={{display:'flex',borderBottom:'2px solid #f0f0f0',flexShrink:0}}>
        {[{id:'daily',label:'📅 일별'},{id:'monthly',label:'🗓 월별'},{id:'customer',label:'👤 주문자별'}].map(t=>(
          <button key={t.id} onClick={()=>setSubTab(t.id)} style={{flex:1,padding:'10px 4px',border:'none',background:'none',fontSize:12,fontWeight:700,cursor:'pointer',color:'#111',borderBottom:`2px solid ${subTab===t.id?P:'transparent'}`,marginBottom:-2}}>{t.label}</button>
        ))}
      </div>
      <div style={{flex:1,overflowY:'auto',minHeight:0,paddingTop:8}}>
        {orders.length===0&&<div style={S.empty}>주문 내역이 없습니다</div>}
        {subTab==='daily'&&dateKeys.map(k=>(
          <GroupRow key={k} groupKey={`d_${k}`} label={fmtDate(k)} sub={`${byDate[k].length}건`} orders={byDate[k]} />
        ))}
        {subTab==='monthly'&&monKeys.map(k=>(
          <GroupRow key={k} groupKey={`m_${k}`} label={fmtMonth(k)} sub={`${byMon[k].length}건`} orders={byMon[k]} />
        ))}
        {subTab==='customer'&&custKeys.map(k=>(
          <GroupRow key={k} groupKey={`c_${k}`} label={`👤 ${k}`} sub={`${byCust[k].length}건`} orders={byCust[k]} />
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────
const ICON_SECTIONS = [
  { label:'☕ 커피/에스프레소', icons:['☕','🫖','🧋','🤎','🫘','⚗️','🫙','🥐','🧇','🍵','🫧','🧉','🍶','🥃','🫚','🥜','🌰','🧆','🍫','🍬','🍭','🍩','🍪','🧁','🎂','🍰','🍮','🍯','🥧','🍡','🍢','🧇','🥞','🫓','🥨','🧀'] },
  { label:'🥤 탄산/청량음료',   icons:['🥤','🧃','💧','🫧','🧊','❄️','🌊','🫙','🍺','🍻','🥂','🍷','🍾','🫗','🍸','🍹','🧉','🥛','🍼','🌿','🍃','🌱','🍀','🌺','🌸','🌼','🌻','🌹','🌷','💐','🌾','🍁','🍂','🍄','🫑','🥒'] },
  { label:'🍹 특별/칵테일',     icons:['🍹','🍸','🥂','🍷','🍾','🫗','🍻','🧉','🍶','🥃','🫖','☕','🧋','🍵','🥤','🧃','🫙','💧','🧊','❄️','🔥','✨','⭐','🌟','💫','🎊','🎉','🎈','🎀','🎁','🏆','🥇','🥈','🥉','💎','👑'] },
  { label:'🥛 밀크/유제품',     icons:['🥛','🍦','🍧','🍨','🧈','🫙','🍮','🥮','🧁','🎂','🍰','🍩','🍪','🍫','🍬','🍭','🥧','🍡','🍢','🧆','🥞','🧇','🥐','🍞','🫓','🥨','🧀','🥚','🍳','🫕','🥘','🍲','🫔','🌮','🌯','🍱'] },
  { label:'🍓 딸기/베리류',     icons:['🍓','🫐','🍒','🍑','🍇','🍈','🍎','🍏','🍐','🍊','🍋','🍌','🍉','🥭','🍍','🥥','🥝','🍅','🍆','🥑','🫑','🥦','🥬','🥒','🌽','🫛','🧄','🧅','🥕','🌶️','🫚','🥜','🌰','🫘','🍄','🪸'] },
  { label:'🥭 트로피컬/열대',   icons:['🥭','🍍','🥥','🍌','🍉','🥝','🌴','🌺','🌸','🌼','🌻','🌹','🌷','💐','🌾','🎋','🎍','🍀','🌿','🍃','🌱','🌲','🌵','🍁','🍂','🍄','🌊','🏖️','🏝️','🌅','🌄','⛅','🌤️','☀️','🌞','🌈'] },
  { label:'🌿 티/허브/건강',    icons:['🌿','🍃','🌱','🌾','🍀','🌲','🌵','🌴','🎋','🎍','🍁','🍂','🍄','🌺','🌸','🌼','🌻','🌹','🌷','💐','🫧','💧','🧊','❄️','🔥','☀️','🌙','⭐','✨','💫','🌟','🌈','⛅','🌤️','🌊','🏔️'] },
  { label:'🍫 디저트/간식',     icons:['🍫','🍬','🍭','🍩','🍪','🧁','🎂','🍰','🍮','🍯','🥧','🍡','🍢','🧆','🥞','🧇','🥐','🍞','🫓','🥨','🧀','🍦','🍧','🍨','🥮','🍱','🍣','🍤','🍙','🍚','🍘','🍥','🥟','🫙','🧂','🍡'] },
  { label:'✨ 이벤트/특별',     icons:['⭐','🌟','✨','🔥','❄️','🌈','🎉','🎊','🏆','🥇','💎','🎁','🎀','🎈','🎂','🎆','🎇','🧨','🎠','🎡','🎢','🎪','🎭','🎨','🎬','🎤','🎧','🎵','🎶','🎺','🎸','🎹','🥁','🎲','🎯','🎳'] },
  { label:'💚 색상/테마',       icons:['💚','💛','🩷','💙','🩵','❤️','🧡','💜','🤍','🩶','🤎','🖤','💝','💖','💗','💓','💞','💕','💟','❣️','💔','🫀','🫶','👍','✌️','🤞','🙌','👏','🤝','🫂','💪','🦾','🙏','☝️','🫵','💫'] },
  { label:'🏫 학교/교육',       icons:['🏫','📚','✏️','🎒','🎓','📝','🔖','📌','🎯','🏅','🌏','🙌','📖','📕','📗','📘','📙','📒','📓','📔','📃','📄','📑','📊','📈','📉','🗒️','🗓️','📅','📆','🗑️','📁','📂','🗂️','🖇️','📎'] },
  { label:'🎨 기타/재미',       icons:['🎨','🎭','🎪','🎠','🎡','🎢','🎯','🎲','🎮','🕹️','🎸','🎵','🎶','🎤','🎧','🎺','🎹','🥁','🎻','🎷','🪗','🪘','🎬','🎥','📷','📸','🔭','🔬','🧪','🧫','🧬','🔋','💡','🔦','🕯️','🪔'] },
  { label:'🐾 동물/자연',       icons:['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🐔','🐧','🐦','🦆','🦅','🦉','🦇','🐺','🐗','🦄','🐝','🦋','🐛','🐌','🐞','🐜','🦟','🦗','🕷️','🦂','🐢'] },
];

function IconPicker({ value, onChange, placeholder='🥤', small=false }) {
  const [open,setOpen]=useState(false);
  const btnSize = small ? {width:48,height:44,fontSize:22} : {width:56,height:52,fontSize:26};
  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(p=>!p)} style={{...btnSize,border:'2px solid #e0e0e0',borderRadius:12,background:'#f8f8f8',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {value?.startsWith('emoji:')?value.replace('emoji:',''):value||placeholder}
      </button>
      {open&&(
        <div style={{position:'absolute',top:60,left:0,background:'#fff',border:'1px solid #e0e0e0',borderRadius:16,padding:14,zIndex:300,boxShadow:'0 8px 40px rgba(0,0,0,0.18)',width:320,maxHeight:420,overflowY:'auto'}}>
          <div style={{fontSize:12,fontWeight:700,color:P,marginBottom:10}}>아이콘 선택</div>
          {ICON_SECTIONS.map(sec=>(
            <div key={sec.label} style={{marginBottom:12}}>
              <div style={{fontSize:11,fontWeight:700,color:'#888',marginBottom:6,paddingBottom:4,borderBottom:'1px solid #f0f0f0'}}>{sec.label}</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                {sec.icons.map(ic=>(
                  <button key={ic} onClick={()=>{onChange(ic);setOpen(false);}} style={{width:34,height:34,fontSize:19,border:`2px solid ${value===ic?P:'transparent'}`,borderRadius:8,background:value===ic?'#f0faf4':'none',cursor:'pointer'}}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div style={{borderTop:'1px solid #f0f0f0',paddingTop:10,marginTop:4}}>
            <div style={{fontSize:11,fontWeight:700,color:'#888',marginBottom:4}}>직접 입력</div>
            <input value={value?.startsWith('emoji:')?value.replace('emoji:',''):value||''} onChange={e=>onChange(e.target.value)} placeholder="이모지 직접 입력" style={{...S.input,marginBottom:0,fontSize:18,textAlign:'center'}} />
          </div>
          <button onClick={()=>setOpen(false)} style={{width:'100%',marginTop:8,padding:'8px',border:'none',borderRadius:10,background:'#f5f5f5',cursor:'pointer',fontSize:13,fontWeight:600,color:'#555'}}>닫기 ✕</button>
        </div>
      )}
    </div>
  );
}

// 음료 이미지/아이콘 렌더러
function DrinkImg({ src, alt, style }) {
  if (!src || src === '') return <div style={{...style,display:'flex',alignItems:'center',justifyContent:'center',background:'#f0faf4',fontSize:28}}>🥤</div>;
  if (src.startsWith('emoji:')) {
    const em = src.replace('emoji:','');
    return <div style={{...style,display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#f0faf4,#e8f5e9)',fontSize:Math.floor((parseInt(style.width)||60)*0.55)}}>{em}</div>;
  }
  return <img src={src} alt={alt||''} style={style} onError={e=>{e.target.onerror=null;e.target.parentNode.innerHTML=`<div style="width:${style.width}px;height:${style.height}px;display:flex;align-items:center;justify-content:center;background:#f0faf4;border-radius:${style.borderRadius||0}px;font-size:28px">🥤</div>`;}} />;
}

// 카테고리용 EmojiPicker (기존 호환)
function EmojiPicker({ value, onChange }) {
  return <IconPicker value={value} onChange={onChange} placeholder='🏫' />;
}

function TextStyleBar({ label, value={}, onChange }) {
  const upd = (k,v) => onChange({...value,[k]:v});
  return (
    <div style={{marginBottom:16}}>
      <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:6}}>{label}</div>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}>
        <button onClick={()=>upd('bold',!value.bold)} style={{width:34,height:34,borderRadius:8,border:`1.5px solid ${value.bold?P:'#ddd'}`,background:value.bold?PLIGHT:'#fff',fontWeight:800,fontSize:14,cursor:'pointer',color:value.bold?P:'#555'}}>B</button>
        <button onClick={()=>upd('italic',!value.italic)} style={{width:34,height:34,borderRadius:8,border:`1.5px solid ${value.italic?P:'#ddd'}`,background:value.italic?PLIGHT:'#fff',fontStyle:'italic',fontWeight:700,fontSize:14,cursor:'pointer',color:value.italic?P:'#555'}}>I</button>
        <button onClick={()=>upd('underline',!value.underline)} style={{width:34,height:34,borderRadius:8,border:`1.5px solid ${value.underline?P:'#ddd'}`,background:value.underline?PLIGHT:'#fff',textDecoration:'underline',fontWeight:700,fontSize:14,cursor:'pointer',color:value.underline?P:'#555'}}>U</button>
        <div style={{display:'flex',alignItems:'center',gap:4}}>
          <button onClick={()=>upd('size',Math.max(8,(value.size||14)-1))} style={{width:28,height:34,borderRadius:8,border:'1px solid #ddd',background:'#fff',cursor:'pointer',fontSize:14,color:'#555'}}>−</button>
          <span style={{fontSize:13,fontWeight:700,minWidth:28,textAlign:'center'}}>{value.size||14}px</span>
          <button onClick={()=>upd('size',Math.min(40,(value.size||14)+1))} style={{width:28,height:34,borderRadius:8,border:'1px solid #ddd',background:'#fff',cursor:'pointer',fontSize:14,color:'#555'}}>+</button>
        </div>
        <div style={{display:'flex',gap:4,alignItems:'center'}}>
          <input type="color" value={value.color||'#ffffff'} onChange={e=>upd('color',e.target.value)} style={{width:34,height:34,border:'1px solid #ddd',borderRadius:8,cursor:'pointer',padding:2}} />
          <button onClick={()=>upd('color','')} style={{padding:'4px 8px',border:'1px solid #ddd',borderRadius:8,background:'#f5f5f5',fontSize:11,cursor:'pointer',color:'#666'}}>기본</button>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ settings, onSave }) {
  const [form,setForm]=useState({...INIT_SETTINGS,...settings,school:{...INIT_SETTINGS.school,...settings.school},banner:{...INIT_SETTINGS.banner,...settings.banner},deliveryHours:{...INIT_DH,...settings.deliveryHours},themeId:settings.themeId||'green',dailyLimit:settings.dailyLimit??15,slotLimit:settings.slotLimit??3});
  const [saved,setSaved]=useState(false);
  const [testing,setTesting]=useState(null);
  const [testResult,setTestResult]=useState(null);
  const [bannerImgRef]=useState({current:null});

  const save=()=>{ onSave(form); setSaved(true); setTimeout(()=>setSaved(false),2000); };
  const upSchool=(k,v)=>setForm(p=>({...p,school:{...p.school,[k]:v}}));
  const upBanner=(k,v)=>setForm(p=>({...p,banner:{...p.banner,[k]:v}}));
  const upDH=(day,k,v)=>setForm(p=>({...p,deliveryHours:{...p.deliveryHours,[day]:{...p.deliveryHours[day],[k]:v}}}));
  const toggleBlockSlot=(day,slot)=>setForm(p=>{
    const cur=p.deliveryHours[day]||{};
    const blocked=cur.blockedSlots||[];
    const next=blocked.includes(slot)?blocked.filter(s=>s!==slot):[...blocked,slot];
    return {...p,deliveryHours:{...p.deliveryHours,[day]:{...cur,blockedSlots:next}}};
  });
  const getAllSlotsForDay=(cfg)=>{
    if(!cfg?.enabled) return [];
    const s2=parseTimeMin(cfg.start), e2=parseTimeMin(cfg.end);
    const all=[]; for(let m=s2; m<=e2; m+=10){ all.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`); }
    return all;
  };
  const upTg=(k,v)=>setForm(p=>({...p,telegram:{...p.telegram,[k]:v}}));
  const upKk=(k,v)=>setForm(p=>({...p,kakao:{...p.kakao,[k]:v}}));

  const handleBannerImg=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>upBanner('image',ev.target.result); r.readAsDataURL(f); };
  const testTg=async()=>{ setTesting('tg');setTestResult(null); const r=await sendTelegram(form.telegram.token,form.telegram.chatId,`✅ [${form.school?.name||'학교'}] 텔레그램 연결 테스트 성공!`); setTestResult({s:'tg',...r}); setTesting(null); };
  const testKk=async()=>{ setTesting('kk');setTestResult(null); const r=await sendKakao(form.kakao.accessToken,`✅ 카카오톡 연결 테스트 성공!`); setTestResult({s:'kk',...r}); setTesting(null); };
  const imgFileRef=useRef();

  return (
    <div style={{flex:1,overflowY:'auto',minHeight:0,padding:16}}>

      {/* 학교 정보 */}
      <SH>🏫 학교 정보</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:14,marginBottom:20}}>
        <div style={{fontSize:12,color:'#888',marginBottom:10}}>홈 화면에 표시될 학교 아이콘과 이름</div>
        <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:10}}>
          <EmojiPicker value={form.school?.icon||'🏫'} onChange={v=>upSchool('icon',v)} />
          <input value={form.school?.name||''} onChange={e=>upSchool('name',e.target.value)} placeholder="학교 이름" style={{...S.input,flex:1,marginBottom:0}} />
        </div>
        <div style={{padding:'8px 12px',background:'#fff',borderRadius:10,fontSize:13,color:P,fontWeight:600}}>미리보기: {form.school?.icon||'🏫'} {form.school?.name||'학교 이름'}</div>
      </div>

      {/* 앱 테마 */}
      <div style={{marginBottom:24}}>
        <div style={{fontSize:15,fontWeight:700,textAlign:'center',marginBottom:4}}>🎨 앱 테마</div>
        <div style={{width:'100%',height:1,background:'#f0f0f0',marginBottom:16}} />
        <div style={{fontSize:13,color:'#555',marginBottom:12}}>앱 전체 색상 테마를 선택합니다</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          {THEME_PRESETS.map(t=>(
            <button key={t.id} onClick={()=>setForm(p=>({...p,themeId:t.id}))} style={{padding:'10px 8px',border:`2px solid ${(form.themeId||'green')===t.id?t.P:'#e0e0e0'}`,borderRadius:12,background:(form.themeId||'green')===t.id?t.light:'#fff',cursor:'pointer',display:'flex',alignItems:'center',gap:8}}>
              <div style={{width:20,height:20,borderRadius:50,background:t.P,flexShrink:0}} />
              <span style={{fontSize:12,fontWeight:700,color:(form.themeId||'green')===t.id?t.P:'#555'}}>{t.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 배너 설정 */}
      <SH>🖼 배너 설정</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:14,marginBottom:20}}>
        <div style={{fontSize:12,color:'#888',marginBottom:10}}>홈 화면 배너의 문구와 이미지를 설정합니다</div>
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>서비스 라벨 (배너 상단 작은 글씨)</div>
        <input value={form.banner?.serviceLabel||''} onChange={e=>upBanner('serviceLabel',e.target.value)} placeholder="음료 주문 서비스" style={S.input} />
        <TextStyleBar label="서비스 라벨 스타일" value={form.banner?.serviceLabelStyle||{}} onChange={v=>upBanner('serviceLabelStyle',v)} />
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>헤드라인 문구</div>
        <input value={form.banner?.headline||''} onChange={e=>upBanner('headline',e.target.value)} placeholder="음료를 주문하세요 🍹" style={S.input} />
        <TextStyleBar label="헤드라인 스타일" value={form.banner?.headlineStyle||{}} onChange={v=>upBanner('headlineStyle',v)} />
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>서브 문구</div>
        <input value={form.banner?.subtext||''} onChange={e=>upBanner('subtext',e.target.value)} placeholder="매일 신선하게 준비됩니다" style={S.input} />
        <TextStyleBar label="서브 문구 스타일" value={form.banner?.subtextStyle||{}} onChange={v=>upBanner('subtextStyle',v)} />
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:6}}>배너 이미지</div>
        {form.banner?.image&&(
          <div style={{marginBottom:8,position:'relative'}}>
            <img src={form.banner.image} alt="" style={{width:'100%',height:80,objectFit:'cover',borderRadius:10}} onError={e=>e.target.style.display='none'} />
            <button onClick={()=>upBanner('image','')} style={{position:'absolute',top:4,right:4,background:'rgba(0,0,0,0.5)',border:'none',borderRadius:50,width:24,height:24,color:'#fff',fontSize:12,cursor:'pointer'}}>✕</button>
          </div>
        )}
        <input ref={imgFileRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleBannerImg} />
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>imgFileRef.current?.click()} style={{flex:1,...S.addRowBtn,marginBottom:0,padding:'8px'}}>📁 이미지 파일</button>
        </div>
        <input value={form.banner?.image?.startsWith('data:')?'':(form.banner?.image||'')} onChange={e=>upBanner('image',e.target.value)} placeholder="또는 이미지 URL 입력" style={{...S.input,marginTop:8}} />
        {/* 미리보기 */}
        <div style={{marginTop:10,borderRadius:12,background:`linear-gradient(135deg,${P},${PGRAD})`,padding:'12px 16px',color:'#fff',overflow:'hidden',position:'relative',minHeight:60}}>
          {form.banner?.image&&<img src={form.banner.image} alt="" style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.25}} onError={e=>e.target.style.display='none'} />}
          <div style={{position:'relative',zIndex:1}}>
            <div style={{fontSize:10,opacity:0.8,marginBottom:2}}>음료 주문 서비스</div>
            <div style={{fontSize:14,fontWeight:800}}>{form.banner?.headline||'헤드라인'}</div>
            <div style={{fontSize:11,opacity:0.8,marginTop:3}}>{form.banner?.subtext||'서브 문구'}</div>
          </div>
        </div>
      </div>

      {/* 요일별 배달 시간 */}
      <SH>🕐 요일별 배달 시간</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:'4px 14px 10px',marginBottom:20}}>
        {[1,2,3,4,5,6,0].map(day=>{
          const cfg=form.deliveryHours[day]||{enabled:false,start:'10:30',end:'14:30'};
          return (
            <div key={day} style={{borderBottom:'1px solid #ececec',paddingBottom:4}}>
              <div style={{display:'flex',alignItems:'center',gap:8,padding:'9px 0'}}>
              <div onClick={()=>upDH(day,'enabled',!cfg.enabled)} style={{width:44,height:24,borderRadius:12,background:cfg.enabled?P:'#ddd',position:'relative',cursor:'pointer',transition:'background 0.2s',flexShrink:0}}>
                <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:cfg.enabled?22:2,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}} />
              </div>
              <span style={{fontSize:13,fontWeight:700,width:30,color:cfg.enabled?'#111':'#bbb'}}>{WDAY[day]}요일</span>
              {cfg.enabled?(
                <>
                  <select value={cfg.start} onChange={e=>upDH(day,'start',e.target.value)} style={{flex:1,padding:'6px 4px',border:`1.5px solid ${P}`,borderRadius:8,fontSize:12,background:'#fff',cursor:'pointer',color:'#111',fontWeight:600}}>
                    {ALL_TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{fontSize:11,color:'#888'}}>~</span>
                  <select value={cfg.end} onChange={e=>upDH(day,'end',e.target.value)} style={{flex:1,padding:'6px 4px',border:`1.5px solid ${P}`,borderRadius:8,fontSize:12,background:'#fff',cursor:'pointer',color:'#111',fontWeight:600}}>
                    {ALL_TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              ):<span style={{fontSize:12,color:'#bbb',flex:1}}>배달 없음</span>}
              </div>
            {/* 슬롯 개별 활성/비활성 */}
            {cfg.enabled&&(()=>{
              const allSlots=getAllSlotsForDay(cfg);
              const blocked=cfg.blockedSlots||[];
              if(!allSlots.length) return null;
              const hours=[...new Set(allSlots.map(t=>t.split(':')[0]))];
              return (
                <div style={{paddingBottom:10,paddingLeft:4}}>
                  <div style={{fontSize:11,color:'#888',marginBottom:6}}>시간대별 활성화 (클릭으로 비활성)</div>
                  {hours.map(h=>(
                    <div key={h} style={{display:'flex',alignItems:'center',gap:4,marginBottom:4}}>
                      <span style={{fontSize:11,fontWeight:700,color:'#555',width:30}}>{h}시</span>
                      <div style={{display:'flex',gap:3,flexWrap:'wrap'}}>
                        {allSlots.filter(t=>t.startsWith(h+':')).map(t=>{
                          const isBlocked=blocked.includes(t);
                          return (
                            <button key={t} onClick={()=>toggleBlockSlot(day,t)}
                              style={{padding:'3px 7px',border:`1.5px solid ${isBlocked?'#ffcdd2':P}`,borderRadius:12,background:isBlocked?'#ffebee':PLIGHT,color:isBlocked?'#e53935':P,fontSize:11,fontWeight:700,cursor:'pointer',textDecoration:isBlocked?'line-through':'none'}}>
                              {t.split(':')[1]}분
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
            </div>
          );
        })}
      </div>

      {/* 텔레그램 */}
      <SH>✈️ 텔레그램 알림</SH>
      <div style={{background:'#f0f4ff',borderRadius:14,padding:14,marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:form.telegram.enabled?12:0}}>
          <span style={{fontWeight:600,fontSize:14}}>텔레그램 (단체방 지원)</span>
          <Tog on={form.telegram.enabled} color={P} onChange={()=>upTg('enabled',!form.telegram.enabled)} />
        </div>
        {form.telegram.enabled&&<>
          <div style={{fontSize:11,color:'#555',background:'#fff',borderRadius:10,padding:'10px 12px',marginBottom:10,lineHeight:1.65}}>1. @BotFather → /newbot → Token 발급<br/>2. 봇을 그룹에 초대 → getUpdates로 Chat ID 확인<br/><span style={{color:P,fontWeight:600}}>✅ 학급 단체방으로 알림 가능!</span></div>
          <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>Bot Token</div>
          <input value={form.telegram.token} onChange={e=>upTg('token',e.target.value)} placeholder="1234567890:AAH..." style={S.input} />
          <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>Chat ID</div>
          <input value={form.telegram.chatId} onChange={e=>upTg('chatId',e.target.value)} placeholder="-1001234567890" style={S.input} />
          <button onClick={testTg} disabled={!form.telegram.token||!!testing} style={{...S.testBtn,opacity:!form.telegram.token||testing?0.5:1}}>{testing==='tg'?'⏳ 테스트 중...':'🔗 연결 테스트'}</button>
          {testResult?.s==='tg'&&<TestBadge result={testResult} />}
        </>}
      </div>

      {/* 카카오톡 */}
      <SH>💬 카카오톡 알림</SH>
      <div style={{background:'#fffde7',borderRadius:14,padding:14,marginBottom:24}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:form.kakao.enabled?12:0}}>
          <span style={{fontWeight:600,fontSize:14}}>카카오톡 (나에게 보내기)</span>
          <Tog on={form.kakao.enabled} color='#FAE100' onChange={()=>upKk('enabled',!form.kakao.enabled)} />
        </div>
        {form.kakao.enabled&&<>
          <div style={{fontSize:11,color:'#555',background:'#fff',borderRadius:10,padding:'10px 12px',marginBottom:10,lineHeight:1.65}}>developers.kakao.com → 앱 생성 → Access Token 발급<br/><span style={{color:'#e65100'}}>⚠️ 단체방 불가, 나에게 보내기만 지원</span></div>
          <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>Access Token</div>
          <input value={form.kakao.accessToken} onChange={e=>upKk('accessToken',e.target.value)} placeholder="카카오 Access Token" style={S.input} />
          <button onClick={testKk} disabled={!form.kakao.accessToken||!!testing} style={{...S.testBtn,background:'#FAE100',color:'#3C1E1E',opacity:!form.kakao.accessToken||testing?0.5:1}}>{testing==='kk'?'⏳ 테스트 중...':'🔗 연결 테스트'}</button>
          {testResult?.s==='kk'&&<TestBadge result={testResult} />}
        </>}
      </div>

      <button onClick={save} style={{width:'100%',height:48,borderRadius:24,border:'none',background:saved?'#4caf50':P,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',transition:'background 0.3s'}}>{saved?'✅ 저장 완료':'전체 설정 저장'}</button>

      {/* 하루 주문 수량 설정 */}
      <SH>🧋 하루 주문 수량 한도</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:14,marginBottom:16}}>
        <div style={{fontSize:13,color:'#555',marginBottom:12}}>하루 전체 주문 가능한 최대 음료 잔 수를 설정합니다</div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setForm(p=>({...p,dailyLimit:Math.max(1,(p.dailyLimit??15)-1)}))} style={{width:40,height:40,borderRadius:50,border:`1.5px solid ${P}`,background:'#fff',fontSize:20,cursor:'pointer',color:P,fontWeight:700}}>－</button>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:36,fontWeight:800,color:P}}>{form.dailyLimit??15}</div>
            <div style={{fontSize:12,color:'#888'}}>잔 / 하루</div>
          </div>
          <button onClick={()=>setForm(p=>({...p,dailyLimit:Math.min(100,(p.dailyLimit??15)+1)}))} style={{width:40,height:40,borderRadius:50,border:`1.5px solid ${P}`,background:'#fff',fontSize:20,cursor:'pointer',color:P,fontWeight:700}}>＋</button>
        </div>
        <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
          {[5,10,15,20,30,50].map(n=>(
            <button key={n} onClick={()=>setForm(p=>({...p,dailyLimit:n}))} style={{flex:1,minWidth:40,padding:'6px 0',border:`1.5px solid ${(form.dailyLimit??15)===n?P:'#ddd'}`,borderRadius:20,background:(form.dailyLimit??15)===n?P:'#fff',color:(form.dailyLimit??15)===n?'#fff':'#555',fontSize:13,fontWeight:700,cursor:'pointer'}}>{n}잔</button>
          ))}
        </div>
      </div>

      {/* QR 코드 */}
      <SH>📱 QR 코드</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:16,marginBottom:16}}>
        <div style={{fontSize:13,color:'#555',marginBottom:12}}>앱 주소를 QR코드로 공유하세요</div>
        {(()=>{
          const url = encodeURIComponent(window.location.origin);
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${url}&bgcolor=ffffff&color=000000&margin=10`;
          return (
            <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
              <div style={{background:'#fff',borderRadius:12,padding:12,boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
                <img src={qrUrl} alt="QR코드" style={{width:180,height:180,borderRadius:8}} />
              </div>
              <div style={{fontSize:12,color:'#888',textAlign:'center',wordBreak:'break-all',padding:'0 8px'}}>{window.location.origin}</div>
              <div style={{display:'flex',gap:8,width:'100%'}}>
                <button onClick={()=>{
                  const a=document.createElement('a');
                  a.href=qrUrl; a.download='daun-drinks-qr.png'; a.click();
                }} style={{flex:1,padding:'10px 0',border:`1.5px solid ${P}`,borderRadius:12,background:'#fff',color:P,fontSize:13,fontWeight:700,cursor:'pointer'}}>
                  💾 QR 저장
                </button>
                <button onClick={()=>{
                  navigator.clipboard?.writeText(window.location.origin)
                  .then(()=>alert('주소가 복사되었습니다!'))
                  .catch(()=>alert(window.location.origin));
                }} style={{flex:1,padding:'10px 0',border:'1.5px solid #ddd',borderRadius:12,background:'#fff',color:'#555',fontSize:13,fontWeight:700,cursor:'pointer'}}>
                  🔗 주소 복사
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 10분 슬롯당 주문 건수 */}
      <SH>⏱️ 10분당 최대 주문 건수</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:14,marginBottom:16}}>
        <div style={{fontSize:13,color:'#555',marginBottom:12}}>같은 배달 시간(10분 슬롯)에 받을 수 있는 최대 주문 건수</div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <button onClick={()=>setForm(p=>({...p,slotLimit:Math.max(1,(p.slotLimit??3)-1)}))} style={{width:40,height:40,borderRadius:50,border:`1.5px solid ${P}`,background:'#fff',cursor:'pointer',fontSize:20,color:P,fontWeight:700}}>－</button>
          <div style={{flex:1,textAlign:'center'}}>
            <div style={{fontSize:36,fontWeight:800,color:P}}>{form.slotLimit??3}</div>
            <div style={{fontSize:12,color:'#888'}}>건 / 10분</div>
          </div>
          <button onClick={()=>setForm(p=>({...p,slotLimit:Math.min(20,(p.slotLimit??3)+1)}))} style={{width:40,height:40,borderRadius:50,border:`1.5px solid ${P}`,background:'#fff',cursor:'pointer',fontSize:20,color:P,fontWeight:700}}>＋</button>
        </div>
        <div style={{display:'flex',gap:8,marginTop:12,flexWrap:'wrap'}}>
          {[1,2,3,5,10,20].map(n=>(
            <button key={n} onClick={()=>setForm(p=>({...p,slotLimit:n}))} style={{flex:1,minWidth:40,padding:'6px 0',border:`1.5px solid ${(form.slotLimit??3)===n?P:'#ddd'}`,borderRadius:20,background:(form.slotLimit??3)===n?P:'#fff',color:(form.slotLimit??3)===n?'#fff':'#555',fontSize:13,fontWeight:700,cursor:'pointer'}}>{n}건</button>
          ))}
        </div>
        <div style={{fontSize:11,color:'#888',marginTop:8}}>예: 3건 설정 시 10:30에 3건 주문 후 해당 시간 마감 표시</div>
      </div>

      {/* 비밀번호 변경 */}
      <div style={{marginTop:24}}>
        <SH>🔐 관리자 비밀번호 변경</SH>
        <PwChangeSection currentPw={form.adminPassword||'admin1234'} onSave={newPw=>{const updated={...form,adminPassword:newPw}; setForm(updated); onSave(updated);}} />
      </div>
    </div>
  );
}

function PwChangeSection({ currentPw, onSave }) {
  const [cur, setCur] = useState("");
  const [nw, setNw] = useState("");
  const [nw2, setNw2] = useState("");
  const [msg, setMsg] = useState(null);
  const submit = () => {
    if (cur !== currentPw) { setMsg({ok:false,text:"현재 비밀번호가 틀렸습니다"}); return; }
    if (nw.length < 4) { setMsg({ok:false,text:"새 비밀번호는 4자 이상이어야 합니다"}); return; }
    if (nw !== nw2) { setMsg({ok:false,text:"새 비밀번호가 일치하지 않습니다"}); return; }
    onSave(nw);
    setCur(""); setNw(""); setNw2("");
    setMsg({ok:true,text:"비밀번호가 변경되었습니다 ✅"});
    setTimeout(()=>setMsg(null), 3000);
  };
  return (
    <div style={{background:'#f8f8f8',borderRadius:14,padding:14}}>
      <input type="password" value={cur} onChange={e=>setCur(e.target.value)} placeholder="현재 비밀번호" style={S.input} />
      <input type="password" value={nw} onChange={e=>setNw(e.target.value)} placeholder="새 비밀번호 (4자 이상)" style={S.input} />
      <input type="password" value={nw2} onChange={e=>setNw2(e.target.value)} placeholder="새 비밀번호 확인" style={{...S.input,marginBottom:10}} onKeyDown={e=>e.key==='Enter'&&submit()} />
      {msg&&<div style={{fontSize:13,color:msg.ok?'#2e7d32':'#e53935',marginBottom:8}}>{msg.text}</div>}
      <button onClick={submit} style={{width:'100%',height:42,borderRadius:21,border:'none',background:'#444',color:'#fff',fontSize:14,fontWeight:700,cursor:'pointer'}}>비밀번호 변경</button>
    </div>
  );
}

function SH({ children }) { return <div style={{fontSize:14,fontWeight:700,color:'#333',marginBottom:10,paddingBottom:6,borderBottom:`2px solid ${P}20`}}>{children}</div>; }
function Tog({ on, color, onChange }) { return <div onClick={onChange} style={{width:50,height:28,borderRadius:14,background:on?color:'#ddd',position:'relative',cursor:'pointer',transition:'background 0.25s',flexShrink:0}}><div style={{width:24,height:24,borderRadius:12,background:'#fff',position:'absolute',top:2,left:on?24:2,transition:'left 0.25s',boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}} /></div>; }
function TestBadge({ result }) { return <div style={{marginTop:10,padding:'10px 14px',borderRadius:10,background:result.ok?'#e8f5e9':'#ffebee'}}><span style={{fontWeight:700,color:result.ok?'#2e7d32':'#c62828',fontSize:14}}>{result.ok?'✅ 성공!':'❌ 실패'}</span>{!result.ok&&result.error&&<div style={{fontSize:12,color:'#888',marginTop:4}}>{result.error}</div>}</div>; }

// ─── ADMIN EDIT ───────────────────────────────────────────────
function AdminEditScreen({ drink, cats, onBack, onSave }) {
  const EMPTY = {name:'',nameEn:'',price:'',description:'',categoryId:(cats?.[0]?.id||'coffee'),image:'',imgMode:'url',tags:[],tagsEnabled:true,tagLabel:'BEST',tagStyle:{text:'#e65100',bg:'#fff3e0'},sizes:[{label:'M',ml:355,price:0},{label:'L',ml:473,price:500}],options:[],dailyMax:0,visible:true,featured:false};
  const [form,setForm]=useState({...EMPTY,...(drink||{}), tags:Array.isArray(drink?.tags)?drink.tags:[], options:Array.isArray(drink?.options)?drink.options:[], sizes:Array.isArray(drink?.sizes)&&drink.sizes.length?drink.sizes:EMPTY.sizes });
  const [newOpt,setNewOpt]=useState({label:'',choices:''});
  const imgRef=useRef();
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const handleImg=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>upd('image',ev.target.result); r.readAsDataURL(f); };
  const addOpt=()=>{ if(!newOpt.label||!newOpt.choices)return; const choices=newOpt.choices.split(',').map(c=>c.trim()).filter(Boolean); upd('options',[...form.options,{id:Date.now().toString(),label:newOpt.label,choices,default:choices[0]}]); setNewOpt({label:'',choices:''}); };
  const moveOpt=(id,dir)=>{ const idx=form.options.findIndex(o=>o.id===id); if(dir==='up'&&idx===0) return; if(dir==='down'&&idx===(form.options||[]).length-1) return; const arr=[...form.options]; const ti=dir==='up'?idx-1:idx+1; [arr[idx],arr[ti]]=[arr[ti],arr[idx]]; upd('options',arr); };
  const handleSave=()=>{ if(!form.name.trim()||!form.price){alert('이름과 가격을 입력해주세요');return;} onSave({...form,price:Number(form.price)}); };
  return (
    <div style={{...S.screen,overflowY:'auto'}}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>{drink?'음료 수정':'음료 추가'}</span><button onClick={handleSave} style={S.newBtn}>저장</button></div>
      <div style={{flex:1,overflowY:'auto',minHeight:0,padding:'0 16px 80px'}}>
        <div style={{padding:'12px 0 8px',fontSize:15,fontWeight:700}}>음료 이미지/아이콘</div>
        {/* 탭 선택 */}
        <div style={{display:'flex',gap:6,marginBottom:10}}>
          {[{id:'url',label:'🔗 URL'},     {id:'file',label:'📷 파일'},  {id:'icon',label:'🎨 아이콘'}].map(t=>(
            <button key={t.id} onClick={()=>upd('imgMode',t.id)}
              style={{flex:1,padding:'7px 4px',border:`1.5px solid ${(form.imgMode||'url')===t.id?P:'#ddd'}`,borderRadius:10,background:(form.imgMode||'url')===t.id?'#f0faf4':'#fff',fontSize:12,fontWeight:700,color:(form.imgMode||'url')===t.id?P:'#666',cursor:'pointer'}}>
              {t.label}
            </button>
          ))}
        </div>
        {/* 미리보기 */}
        <div style={{width:'100%',height:120,border:'2px dashed #ddd',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',marginBottom:10,background:'#fafafa'}}>
          <DrinkImg src={form.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover',borderRadius:12}} />
        </div>
        {/* URL 모드 */}
        {(!form.imgMode||form.imgMode==='url')&&(
          <input placeholder="이미지 URL 입력 (https://...)" value={form.image?.startsWith('data:')||form.image?.startsWith('emoji:')?'':(form.image||'')} onChange={e=>upd('image',e.target.value)} style={S.input} />
        )}
        {/* 파일 모드 */}
        {form.imgMode==='file'&&(
          <>
            <input ref={imgRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImg} />
            <button onClick={()=>imgRef.current.click()} style={{width:'100%',padding:10,border:'1.5px dashed #aaa',borderRadius:10,background:'#f8f8f8',fontSize:13,cursor:'pointer',marginBottom:8,color:'#444'}}>📁 이미지 파일 선택</button>
          </>
        )}
        {/* 아이콘 모드 */}
        {form.imgMode==='icon'&&(
          <div style={{background:'#f0faf4',borderRadius:14,padding:12,marginBottom:8}}>
            <div style={{fontSize:12,color:'#666',marginBottom:8}}>아이콘을 선택하면 음료 이미지로 사용됩니다</div>
            <IconPicker value={form.image?.startsWith('emoji:')?form.image.replace('emoji:',''):''} onChange={v=>upd('image',`emoji:${v}`)} placeholder='🥤' />
          </div>
        )}
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>기본 정보</div>
        <input placeholder="음료 이름 (한국어) *" value={form.name} onChange={e=>upd('name',e.target.value)} style={S.input} />
        <input placeholder="음료 이름 (영어)" value={form.nameEn} onChange={e=>upd('nameEn',e.target.value)} style={S.input} />
        <input placeholder="간단한 설명" value={form.description} onChange={e=>upd('description',e.target.value)} style={S.input} />
        <input placeholder="가격 (원) *" type="number" value={form.price} onChange={e=>upd('price',e.target.value)} style={S.input} />
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>카테고리</div>
        <select value={form.categoryId} onChange={e=>upd('categoryId',e.target.value)} style={S.input}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
        {/* 하루 판매 한도 */}
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>하루 판매 한도</div>
        <div style={{background:'#f8f8f8',borderRadius:12,padding:12,marginBottom:12}}>
          <div style={{fontSize:12,color:'#555',marginBottom:8}}>0 = 무제한 / 숫자 입력 시 하루 해당 잔수로 제한</div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <button onClick={()=>upd('dailyMax',Math.max(0,(form.dailyMax||0)-1))} style={{width:36,height:36,borderRadius:50,border:'1.5px solid #ddd',background:'#fff',cursor:'pointer',fontSize:18,color:'#555'}}>−</button>
            <div style={{flex:1,textAlign:'center'}}>
              <span style={{fontSize:28,fontWeight:800,color:form.dailyMax>0?P:'#aaa'}}>{form.dailyMax||0}</span>
              <span style={{fontSize:13,color:'#888'}}> 잔/일</span>
            </div>
            <button onClick={()=>upd('dailyMax',(form.dailyMax||0)+1)} style={{width:36,height:36,borderRadius:50,border:'1.5px solid #ddd',background:'#fff',cursor:'pointer',fontSize:18,color:'#555'}}>+</button>
          </div>
          {form.dailyMax>0&&<div style={{fontSize:11,color:P,marginTop:6,textAlign:'center'}}>하루 {form.dailyMax}잔 판매 후 자동 품절</div>}
        </div>
        {/* 추천 카테고리 표시 */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 14px',background:'#f8f8f8',borderRadius:12,marginBottom:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>⭐ 추천 카테고리에도 표시</div>
            <div style={{fontSize:11,color:'#888',marginTop:2}}>기본 카테고리 외에 추천에도 보입니다</div>
          </div>
          <button onClick={()=>upd('featured',!form.featured)} style={{width:48,height:26,borderRadius:13,border:'none',background:form.featured?P:'#ccc',cursor:'pointer',position:'relative',transition:'background 0.2s'}}>
            <div style={{width:20,height:20,borderRadius:50,background:'#fff',position:'absolute',top:3,left:form.featured?25:3,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}} />
          </button>
        </div>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'4px 0 8px'}}>
          <span style={{fontSize:15,fontWeight:700}}>태그</span>
          <button onClick={()=>upd('tagsEnabled',form.tagsEnabled!==false?false:true)} style={{fontSize:12,padding:'4px 10px',border:`1px solid ${form.tagsEnabled!==false?P:'#ddd'}`,borderRadius:12,background:form.tagsEnabled!==false?PLIGHT:'#f5f5f5',color:form.tagsEnabled!==false?P:'#888',cursor:'pointer',fontWeight:600}}>
            {form.tagsEnabled!==false?'✅ 태그 활성':'⛔ 태그 비활성'}
          </button>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
          <button onClick={()=>upd('tags',form.tags?.includes('BEST')?form.tags.filter(t=>t!=='BEST'):[...form.tags,'BEST'])} style={{padding:'6px 18px',border:`1.5px solid ${form.tags?.includes('BEST')?(form.tagStyle?.text||'#e65100'):'#ddd'}`,borderRadius:20,background:form.tags?.includes('BEST')?(form.tagStyle?.bg||'#fff3e0'):'#fff',color:form.tags?.includes('BEST')?(form.tagStyle?.text||'#e65100'):'#666',fontSize:13,cursor:'pointer',fontWeight:700}}>
            {form.tagLabel||'BEST'}
          </button>
          {form.tags?.includes('BEST')&&<span style={{fontSize:12,color:'#888'}}>← 미리보기</span>}
        </div>
        {form.tags?.includes('BEST')&&(
          <div style={{background:'#f8f8f8',borderRadius:12,padding:12,marginBottom:10}}>
            <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:8}}>태그 커스터마이징</div>
            <div style={{display:'flex',gap:8,marginBottom:8}}>
              <input placeholder="태그 글자 (예: NEW, HOT)" value={form.tagLabel||'BEST'} onChange={e=>upd('tagLabel',e.target.value)} style={{...S.input,flex:1,marginBottom:0,fontSize:13}} />
            </div>
            <div style={{display:'flex',gap:10,alignItems:'center'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:'#888',marginBottom:4}}>글자색</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="color" value={form.tagStyle?.text||'#e65100'} onChange={e=>upd('tagStyle',{...form.tagStyle,text:e.target.value})} style={{width:36,height:32,border:'1px solid #ddd',borderRadius:6,cursor:'pointer',padding:2}} />
                  <input value={form.tagStyle?.text||'#e65100'} onChange={e=>upd('tagStyle',{...form.tagStyle,text:e.target.value})} style={{...S.input,flex:1,marginBottom:0,fontSize:12}} placeholder="#e65100" />
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,color:'#888',marginBottom:4}}>배경색</div>
                <div style={{display:'flex',gap:6,alignItems:'center'}}>
                  <input type="color" value={form.tagStyle?.bg||'#fff3e0'} onChange={e=>upd('tagStyle',{...form.tagStyle,bg:e.target.value})} style={{width:36,height:32,border:'1px solid #ddd',borderRadius:6,cursor:'pointer',padding:2}} />
                  <input value={form.tagStyle?.bg||'#fff3e0'} onChange={e=>upd('tagStyle',{...form.tagStyle,bg:e.target.value})} style={{...S.input,flex:1,marginBottom:0,fontSize:12}} placeholder="#fff3e0" />
                </div>
              </div>
            </div>
          </div>
        )}
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>컵 사이즈</div>
        {(form.sizes||[]).map((sz,i)=>(
          <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
            <input value={sz.label} onChange={e=>{const s=[...form.sizes];s[i]={...s[i],label:e.target.value};upd('sizes',s);}} style={{...S.input,width:60,marginBottom:0}} />
            <input value={sz.ml} type="number" onChange={e=>{const s=[...form.sizes];s[i]={...s[i],ml:Number(e.target.value)};upd('sizes',s);}} style={{...S.input,flex:1,marginBottom:0}} placeholder="ml" />
            <input value={sz.price} type="number" onChange={e=>{const s=[...form.sizes];s[i]={...s[i],price:Number(e.target.value)};upd('sizes',s);}} style={{...S.input,flex:1,marginBottom:0}} placeholder="+원" />
            <button onClick={()=>upd('sizes',form.sizes.filter((_,j)=>j!==i))} style={{...S.delBtn,padding:'8px'}}>✕</button>
          </div>
        ))}
        <button onClick={()=>upd('sizes',[...form.sizes,{label:'XL',ml:591,price:1000}])} style={S.addRowBtn}>+ 사이즈 추가</button>
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>퍼스널 옵션</div>
        {(form.options||[]).map((opt,idx)=>(
          <div key={opt.id} style={{background:'#f8f8f8',borderRadius:12,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
            {/* 순서 조정 버튼 */}
            <div style={{display:'flex',flexDirection:'column',gap:3}}>
              <button onClick={()=>moveOpt(opt.id,'up')} disabled={idx===0} style={{width:26,height:26,border:'1px solid #ddd',borderRadius:6,background:idx===0?'#f5f5f5':'#fff',cursor:idx===0?'default':'pointer',fontSize:12,color:idx===0?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↑</button>
              <button onClick={()=>moveOpt(opt.id,'down')} disabled={idx===(form.options||[]).length-1} style={{width:26,height:26,border:'1px solid #ddd',borderRadius:6,background:idx===(form.options||[]).length-1?'#f5f5f5':'#fff',cursor:idx===(form.options||[]).length-1?'default':'pointer',fontSize:12,color:idx===(form.options||[]).length-1?'#ccc':'#555',display:'flex',alignItems:'center',justifyContent:'center'}}>↓</button>
            </div>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:13}}>{opt.label}</div><div style={{fontSize:12,color:'#888',marginTop:2}}>{opt.choices.join(' / ')}</div></div>
            <button onClick={()=>upd('options',form.options.filter(o=>o.id!==opt.id))} style={{...S.delBtn,padding:'4px 8px'}}>✕</button>
          </div>
        ))}
        <div style={{background:'#f0faf4',borderRadius:14,padding:14}}>
          <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:8}}>새 옵션 추가</div>
          <input placeholder="옵션명" value={newOpt.label} onChange={e=>setNewOpt(p=>({...p,label:e.target.value}))} style={S.input} />
          <input placeholder="선택지 (쉼표 구분): 적게, 보통, 많이" value={newOpt.choices} onChange={e=>setNewOpt(p=>({...p,choices:e.target.value}))} style={S.input} />
          <button onClick={addOpt} style={S.addRowBtn}>+ 옵션 추가</button>
        </div>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────
function BottomNav({ screen, setScreen, cartCount }) {
  return (
    <div style={{display:'flex',borderTop:'1px solid #f0f0f0',background:'#fff',flexShrink:0,paddingBottom:'env(safe-area-inset-bottom, 12px)'}}>
      {[{id:"home",icon:"🏠",label:"Home"},{id:"cart",icon:"🛒",label:"Cart"},{id:"list",icon:"☕",label:"Order"}].map(t=>{
        const active=screen===t.id||(t.id==='list'&&screen==='detail');
        return (
          <button key={t.id} onClick={()=>setScreen(t.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'10px 0 14px',background:'none',border:'none',cursor:'pointer',color:'#111'}}>
            <div style={{position:'relative',fontSize:22,lineHeight:1.2}}>{t.icon}{t.id==='cart'&&cartCount>0&&<span style={S.badge}>{cartCount}</span>}</div>
            <span style={{fontSize:10,color:'#111',fontWeight:active?800:500,marginTop:2}}>{t.label}</span>
            {active&&<div style={{width:4,height:4,borderRadius:'50%',background:P,marginTop:2}} />}
          </button>
        );
      })}
    </div>
  );
}

// ─── STYLES ───────────────────────────────────────────────────
const S = {
  shell:{width:'100%',minHeight:'100vh',minHeight:'100dvh',display:'flex',justifyContent:'center',alignItems:'flex-start',background:'#f0f2f5',fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif"},
  phone:{width:'100%',maxWidth:480,height:'100vh',height:'100dvh',background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',color:'#111',boxShadow:'0 0 40px rgba(0,0,0,0.12)'},
  statusBar:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 24px 6px',fontSize:13,fontWeight:600,flexShrink:0},
  screen:{flex:1,display:'flex',flexDirection:'column',overflow:'hidden'},
  navBar:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 16px',borderBottom:'1px solid #f0f0f0',flexShrink:0},
  backBtn:{background:'none',border:'none',fontSize:28,cursor:'pointer',color:'#333',width:36,display:'flex',alignItems:'center'},
  navTitle:{fontSize:17,fontWeight:700,color:'#111'},
  iconBtn:{background:'#fff',border:'1px solid #e8e8e8',borderRadius:20,padding:'4px 10px',fontSize:18,cursor:'pointer',color:'#333'},
  badge:{position:'absolute',top:-6,right:-6,background:'#ff4444',color:'#fff',borderRadius:10,fontSize:10,fontWeight:700,padding:'1px 5px',minWidth:16,textAlign:'center'},
  qtyBtn:{width:36,height:36,borderRadius:50,border:'1.5px solid #ccc',background:'#f5f5f5',fontSize:18,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#333'},
  overlay:{position:'absolute',inset:0,background:'rgba(0,0,0,0.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:100},
  toast:{position:'absolute',bottom:80,left:'50%',transform:'translateX(-50%)',background:'rgba(0,0,0,0.78)',color:'#fff',borderRadius:20,padding:'9px 18px',fontSize:13,fontWeight:600,whiteSpace:'nowrap',zIndex:200,pointerEvents:'none'},
  empty:{textAlign:'center',color:'#aaa',padding:48,fontSize:14},
  newBtn:{border:'none',background:P,color:'#fff',borderRadius:20,padding:'4px 14px',fontSize:12,fontWeight:700,cursor:'pointer'},
  editBtn:{border:`1px solid ${P}`,borderRadius:8,padding:'4px 10px',fontSize:12,color:P,background:'none',cursor:'pointer',flexShrink:0},
  delBtn:{border:'1px solid #e53935',borderRadius:8,padding:'4px 10px',fontSize:12,color:'#e53935',background:'none',cursor:'pointer',flexShrink:0},
  fLabel:{fontSize:13,fontWeight:600,color:'#444',marginBottom:6},
  mInput:{width:'100%',padding:'11px 14px',border:'1.5px solid #e0e0e0',borderRadius:12,fontSize:14,marginBottom:14,boxSizing:'border-box',outline:'none',fontFamily:'inherit'},
  input:{width:'100%',padding:'10px 12px',border:'1px solid #e0e0e0',borderRadius:10,fontSize:14,marginBottom:10,boxSizing:'border-box',outline:'none',fontFamily:'inherit',display:'block'},
  testBtn:{width:'100%',padding:10,border:'none',borderRadius:10,background:P,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',marginTop:4},
  addRowBtn:{width:'100%',border:`1px dashed ${P}`,borderRadius:10,padding:9,color:P,background:'none',fontSize:13,cursor:'pointer',marginBottom:8},
};
