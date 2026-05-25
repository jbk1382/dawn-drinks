import { useState, useEffect, useRef } from "react";

const P = "#1a7a4a";
const fmt = (n) => n.toLocaleString("ko-KR") + "원";
const WDAY = ['일','월','화','수','목','금','토'];
const WDAY_FULL = ['일요일','월요일','화요일','수요일','목요일','금요일','토요일'];

// ─── Storage (localStorage) ───────────────────────────────────
function stGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function stSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
async function getStoredUser() { return stGet('hb_user'); }
async function setStoredUser(n) { stSet('hb_user', n); }
async function getStoredSettings() { try { return JSON.parse(stGet('hb_settings') || 'null'); } catch { return null; } }
async function saveStoredSettings(s) { stSet('hb_settings', JSON.stringify(s)); }
async function getUserOrders(name) { try { return JSON.parse(stGet(`hb_orders:${name}`) || '[]'); } catch { return []; } }
async function pushOrder(name, order) {
  const prev = await getUserOrders(name);
  const updated = [order, ...prev].slice(0, 300);
  stSet(`hb_orders:${name}`, JSON.stringify(updated));
}
async function getAllOrders() {
  try {
    const all = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('hb_orders:')) {
        const orders = JSON.parse(localStorage.getItem(key) || '[]');
        all.push(...orders);
      }
    }
    return all.sort((a, b) => new Date(b.orderTime) - new Date(a.orderTime));
  } catch { return []; }
}

// ─── Notifications ────────────────────────────────────────────
async function sendTelegram(token, chatId, text) {
  if (!token || !chatId) return { ok: false, error: "설정 미완료" };
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    const d = await r.json();
    return { ok: r.ok, error: d.description };
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
  for (let h = 8; h <= 18; h++) [0,30].forEach(m => { if (!(h===18&&m>0)) o.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`); });
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
  const buf = isToday ? (() => { const n=new Date(); return n.getHours()*60+n.getMinutes()+30; })() : -1;
  const slots=[];
  for (let m=s; m<=e; m+=30) {
    if (isToday && m<=buf) continue;
    slots.push(`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`);
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
const INIT_DH = {0:{enabled:false,start:"10:30",end:"14:30"},1:{enabled:true,start:"10:30",end:"14:30"},2:{enabled:true,start:"10:30",end:"14:30"},3:{enabled:true,start:"10:30",end:"14:30"},4:{enabled:true,start:"10:30",end:"14:30"},5:{enabled:true,start:"10:30",end:"14:30"},6:{enabled:false,start:"10:30",end:"14:30"}};
const INIT_SETTINGS = {
  school: { name: "다운고등학교", icon: "🏫" },
  banner: { headline: "음료를 주문하세요 🍹", subtext: "매일 신선하게 준비됩니다", image: "" },
  telegram: { enabled: false, token: "", chatId: "" },
  kakao: { enabled: false, accessToken: "" },
  deliveryHours: INIT_DH,
  adminPassword: "admin1234",
};

// ─── APP ──────────────────────────────────────────────────────
export default function App() {
  const [booting, setBooting] = useState(true);
  const [userName, setUserName] = useState(null);
  const [screen, setScreen] = useState("home");
  const [selCat, setSelCat] = useState(null);
  const [selDrink, setSelDrink] = useState(null);
  const [cart, setCart] = useState([]);
  const [drinks, setDrinks] = useState(() => {
    try { const s = localStorage.getItem('hb_drinks'); return s ? JSON.parse(s) : INIT_DRINKS; } catch { return INIT_DRINKS; }
  });
  const [cats, setCats] = useState(() => {
    try { const s = localStorage.getItem('hb_cats'); return s ? JSON.parse(s) : INIT_CATS; } catch { return INIT_CATS; }
  });
  const [settings, setSettings] = useState(INIT_SETTINGS);
  const [editDrink, setEditDrink] = useState(null);
  const [orderModal, setOrderModal] = useState(false);
  const [successOrder, setSuccessOrder] = useState(null);
  const [adminTab, setAdminTab] = useState("drinks");
  const [toast, setToast] = useState(null);
  const [adminLoginModal, setAdminLoginModal] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    Promise.all([getStoredUser(), getStoredSettings()]).then(([user, stored]) => {
      if (user) setUserName(user);
      if (stored) setSettings(() => ({
        ...INIT_SETTINGS, ...stored,
        school: { ...INIT_SETTINGS.school, ...(stored.school||{}) },
        banner: { ...INIT_SETTINGS.banner, ...(stored.banner||{}) },
        deliveryHours: { ...INIT_DH, ...(stored.deliveryHours||{}) },
        adminPassword: stored.adminPassword || INIT_SETTINGS.adminPassword,
      }));
      setBooting(false);
    });
  }, []);

  // 음료·카테고리 변경 시 자동 저장
  useEffect(() => { try { localStorage.setItem('hb_drinks', JSON.stringify(drinks)); } catch {} }, [drinks]);
  useEffect(() => { try { localStorage.setItem('hb_cats', JSON.stringify(cats)); } catch {} }, [cats]);

  const notify = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };
  const cartCount = cart.length;
  const cartTotal = cart.reduce((s,i) => s+i.totalPrice, 0);

  const handleLogin = async (name) => { await setStoredUser(name); setUserName(name); };
  const addToCart = (item) => { setCart(p => [...p,{...item,cartId:Date.now()}]); notify("장바구니에 담겼습니다 🛒"); setScreen("list"); };

  const handleOrder = async (info) => {
    const order = { id:Date.now(), name:info.name, location:info.location, extraRequest:info.extraRequest||'', deliveryDate:info.deliveryDate, deliveryTime:info.deliveryTime, deliveryLabel:info.deliveryLabel, items:cart.map(i=>({name:i.drink.name,size:i.selectedSize.label,qty:i.qty,options:Object.values(i.optionChoices),price:i.totalPrice})), totalPrice:cartTotal, orderTime:new Date().toISOString(), status:"주문완료" };
    await pushOrder(userName, order);
    const msg = buildAdminMsg(info, cart, cartTotal, settings.school?.name||'');
    if (settings.telegram.enabled && settings.telegram.token) await sendTelegram(settings.telegram.token, settings.telegram.chatId, msg);
    if (settings.kakao.enabled && settings.kakao.accessToken) await sendKakao(settings.kakao.accessToken, msg);
    setCart([]); setOrderModal(false); setSuccessOrder(order);
  };

  const handleSaveSettings = async (s) => { setSettings(s); await saveStoredSettings(s); notify("설정 저장됨 ✅"); };

  if (booting) return <div style={S.shell}><div style={{...S.phone,display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{textAlign:'center'}}><div style={{fontSize:48}}>🥤</div><div style={{color:'#888',marginTop:10}}>로딩 중...</div></div></div></div>;
  if (!userName) return <div style={S.shell}><div style={S.phone}><LoginScreen onLogin={handleLogin} /></div></div>;
  if (successOrder) return <div style={S.shell}><div style={S.phone}><OrderSuccessScreen order={successOrder} onDone={()=>{setSuccessOrder(null);setScreen("home");}} /></div></div>;

  return (
    <div style={S.shell}>
      <div style={S.phone}>
        {screen==="home"     && <HomeScreen school={settings.school} banner={settings.banner} categories={cats.filter(c=>c.visible)} onSelect={cat=>{setSelCat(cat);setScreen("list");}} onAdmin={()=>{ if(isAdmin){setAdminTab("drinks");setScreen("admin");}else{setAdminLoginModal(true);} }} cartCount={cartCount} onCart={()=>setScreen("cart")} userName={userName} onHistory={()=>setScreen("history")} />}
        {screen==="list"     && <ListScreen category={selCat} drinks={drinks.filter(d=>!selCat||d.categoryId===selCat.id)} onBack={()=>setScreen("home")} onSelect={d=>{setSelDrink(d);setScreen("detail");}} cartCount={cartCount} onCart={()=>setScreen("cart")} />}
        {screen==="detail"   && selDrink && <DetailScreen drink={selDrink} onBack={()=>setScreen("list")} onAddToCart={addToCart} />}
        {screen==="cart"     && <CartScreen cart={cart} totalPrice={cartTotal} onBack={()=>setScreen("home")} onRemove={id=>setCart(p=>p.filter(i=>i.cartId!==id))} onCheckout={()=>setOrderModal(true)} />}
        {screen==="history"  && <HistoryScreen userName={userName} onBack={()=>setScreen("home")} />}
        {screen==="admin"    && <AdminScreen drinks={drinks} cats={cats} settings={settings} activeTab={adminTab} onTabChange={setAdminTab} onBack={()=>{setScreen("home");setIsAdmin(false);}} onEdit={d=>{setEditDrink(d);setScreen("adminEdit");}} onNew={()=>{setEditDrink(null);setScreen("adminEdit");}} onDelete={id=>{setDrinks(p=>p.filter(d=>d.id!==id));notify("삭제됨");}} onToggleCat={id=>setCats(p=>p.map(c=>c.id===id?{...c,visible:!c.visible}:c))} onUpdateCat={(id,u)=>setCats(p=>p.map(c=>c.id===id?{...c,...u}:c))} onSaveSettings={handleSaveSettings} />}
        {screen==="adminEdit"&& <AdminEditScreen drink={editDrink} cats={cats} onBack={()=>setScreen("admin")} onSave={d=>{setDrinks(p=>d.id?p.map(x=>x.id===d.id?d:x):[...p,{...d,id:Date.now()}]);notify("저장됨 ✅");setScreen("admin");}} />}
        {adminLoginModal && <AdminLoginModal correctPassword={settings.adminPassword||"admin1234"} onSuccess={()=>{setAdminLoginModal(false);setIsAdmin(true);setAdminTab("drinks");setScreen("admin");}} onCancel={()=>setAdminLoginModal(false)} />}
        {orderModal && <OrderModal totalPrice={cartTotal} userName={userName} deliveryHours={settings.deliveryHours} onCancel={()=>setOrderModal(false)} onConfirm={handleOrder} />}
        {toast && <div style={S.toast}>{toast}</div>}
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
function HomeScreen({ school, banner, categories, onSelect, onAdmin, cartCount, onCart, userName, onHistory }) {
  const icon = school?.icon || '🏫';
  const schoolName = school?.name || '학교 음료 주문';
  const bannerImg = banner?.image;
  return (
    <div style={S.screen}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 20px 6px'}}>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:P}}>{icon} {schoolName}</div>
          <div style={{fontSize:11,color:'#888'}}>안녕하세요, {userName}님 👋</div>
        </div>
        <div style={{display:'flex',gap:8}}>
          {cartCount>0 && <button onClick={onCart} style={{...S.iconBtn,position:'relative'}}>🛒<span style={S.badge}>{cartCount}</span></button>}
          <button onClick={onAdmin} style={S.iconBtn}>⚙️</button>
        </div>
      </div>

      {/* 배너 */}
      <div style={{margin:'10px 16px',borderRadius:18,background:`linear-gradient(135deg,${P},#2ea76a)`,overflow:'hidden',position:'relative',minHeight:110,flexShrink:0}}>
        {bannerImg && <img src={bannerImg} alt="" onError={e=>e.target.style.display='none'} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:0.25}} />}
        <div style={{padding:'18px 22px',color:'#fff',position:'relative',zIndex:1,display:'flex',alignItems:'center'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:11,opacity:0.8,marginBottom:4}}>음료 주문 서비스</div>
            <div style={{fontSize:19,fontWeight:800,lineHeight:1.35}}>{banner?.headline || `${schoolName} 음료를 주문하세요 🍹`}</div>
            <div style={{fontSize:12,marginTop:6,opacity:0.8}}>{banner?.subtext || '매일 신선하게 준비됩니다'}</div>
          </div>
          {!bannerImg && <div style={{fontSize:44,opacity:0.3}}>☕</div>}
        </div>
      </div>

      <button onClick={onHistory} style={{margin:'0 16px 12px',padding:'11px 16px',background:'#f0faf4',border:`1px solid ${P}30`,borderRadius:12,display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',width:'calc(100% - 32px)'}}>
        <div style={{display:'flex',alignItems:'center',gap:8}}><span>📋</span><span style={{fontSize:14,fontWeight:600,color:P}}>내 주문 내역 보기</span></div>
        <span style={{color:'#555',fontSize:18}}>›</span>
      </button>

      <div style={{padding:'4px 20px 8px',fontSize:15,fontWeight:700,color:'#222'}}>카테고리</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,padding:'0 16px 16px'}}>
        {categories.map(cat => (
          <button key={cat.id} onClick={()=>onSelect(cat)} style={{background:'#f8f8f8',border:'none',borderRadius:14,padding:'14px 4px',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer',color:'#111'}}>
            <div style={{fontSize:30,marginBottom:5}}>{cat.icon}</div>
            <div style={{fontSize:12,fontWeight:600,color:'#333'}}>{cat.label}</div>
          </button>
        ))}
        <button onClick={()=>onSelect(null)} style={{background:`linear-gradient(135deg,${P},#2ea76a)`,border:'none',borderRadius:14,padding:'14px 4px',display:'flex',flexDirection:'column',alignItems:'center',cursor:'pointer'}}>
          <div style={{fontSize:30,marginBottom:5}}>📋</div>
          <div style={{fontSize:12,fontWeight:600,color:'#fff'}}>전체</div>
        </button>
      </div>
    </div>
  );
}

// ─── LIST ─────────────────────────────────────────────────────
function ListScreen({ category, drinks, onBack, onSelect, cartCount, onCart }) {
  return (
    <div style={S.screen}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>{category?category.label:"전체 메뉴"}</span><button onClick={onCart} style={{...S.iconBtn,position:'relative'}}>🛒{cartCount>0&&<span style={S.badge}>{cartCount}</span>}</button></div>
      <div style={{flex:1,overflowY:'auto'}}>
        {drinks.length===0&&<div style={S.empty}>등록된 음료가 없습니다</div>}
        {drinks.map(d=>(
          <button key={d.id} onClick={()=>onSelect(d)} style={{width:'100%',background:'none',border:'none',borderBottom:'1px solid #f5f5f5',display:'flex',alignItems:'center',padding:'14px 16px',cursor:'pointer',gap:14,textAlign:'left',color:'#111'}}>
            <img src={d.image} alt={d.name} style={{width:80,height:80,borderRadius:50,objectFit:'cover',background:'#f5f5f5',flexShrink:0}} onError={e=>{e.target.src="https://via.placeholder.com/80x80?text=☕";}} />
            <div style={{flex:1}}>
              <div style={{display:'flex',gap:4,marginBottom:4}}>{d.tags.map(t=><span key={t} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:'#fff3e0',color:'#e65100'}}>{t}</span>)}</div>
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
    <div style={{...S.screen,overflowY:'auto',paddingBottom:90}}>
      <div style={{height:240,background:'#f8f8f8',position:'relative',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
        <button onClick={onBack} style={{position:'absolute',top:12,left:12,background:'rgba(255,255,255,0.9)',border:'none',borderRadius:50,width:36,height:36,fontSize:24,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#333'}}>‹</button>
        <img src={drink.image} alt={drink.name} style={{width:180,height:180,objectFit:'cover',borderRadius:20}} onError={e=>{e.target.src="https://via.placeholder.com/180x180?text=☕";}} />
      </div>
      <div style={{padding:'16px 20px'}}>
        <div style={{display:'flex',gap:4,marginBottom:6}}>{drink.tags.map(t=><span key={t} style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:6,background:'#fff3e0',color:'#e65100'}}>{t}</span>)}</div>
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
        <div style={{display:'flex',alignItems:'center',gap:12,marginTop:16,padding:'12px 0',borderTop:'1px solid #f0f0f0'}}>
          <button onClick={()=>setQty(q=>Math.max(1,q-1))} style={S.qtyBtn}>−</button>
          <span style={{fontSize:18,fontWeight:700,minWidth:24,textAlign:'center'}}>{qty}</span>
          <button onClick={()=>setQty(q=>q+1)} style={S.qtyBtn}>+</button>
          <span style={{marginLeft:'auto',fontSize:20,fontWeight:800}}>{fmt(total)}</span>
        </div>
      </div>
      <div style={{position:'sticky',bottom:0,background:'#fff',padding:'12px 16px',borderTop:'1px solid #f0f0f0',display:'flex',gap:10}}>
        <button style={{width:46,height:46,borderRadius:50,border:'1.5px solid #ddd',background:'#fff',fontSize:20,cursor:'pointer',color:'#e53935'}}>♡</button>
        <button onClick={onBack} style={{flex:1,height:46,borderRadius:24,border:'1.5px solid #ddd',background:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',color:'#333'}}>닫기</button>
        <button onClick={()=>onAddToCart({drink,selectedSize:selSz,optionChoices:opts,qty,totalPrice:total})} style={{flex:2,height:46,borderRadius:24,border:'none',background:P,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer'}}>담기</button>
      </div>
    </div>
  );
}

// ─── CART ─────────────────────────────────────────────────────
function CartScreen({ cart, totalPrice, onBack, onRemove, onCheckout }) {
  return (
    <div style={S.screen}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>장바구니</span><span style={{width:36}}/></div>
      <div style={{flex:1,overflowY:'auto',padding:'0 16px'}}>
        {cart.length===0&&<div style={S.empty}>장바구니가 비어있습니다 🛒</div>}
        {cart.map(item=>(
          <div key={item.cartId} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid #f5f5f5'}}>
            <img src={item.drink.image} alt="" style={{width:60,height:60,borderRadius:12,objectFit:'cover',background:'#f5f5f5'}} onError={e=>{e.target.src="https://via.placeholder.com/60x60?text=☕";}} />
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
function OrderModal({ totalPrice, userName, deliveryHours, onCancel, onConfirm }) {
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
  const dayEnabled=deliveryHours[date.dow]?.enabled;
  const handleDateChange=(d)=>{ setDate(d); const s=getTimeSlotsForDay(deliveryHours[d.dow],d.value===dates[0].value); setTime(s[0]||''); };
  const submit=async()=>{ if(!name.trim()){setErr("이름을 입력해주세요");return;} if(!location.trim()){setErr("배달 장소를 입력해주세요");return;} if(!time){setErr("배달 가능한 시간이 없습니다");return;} setErr(""); setLoading(true); await onConfirm({name:name.trim(),location:location.trim(),extraRequest:extraRequest.trim(),deliveryDate:date.value,deliveryLabel:`${date.tag} ${date.label}`,deliveryTime:time}); setLoading(false); };
  const canOrder=!!time&&dayEnabled;
  return (
    <div style={S.overlay}>
      <div style={{background:'#fff',borderRadius:'22px 22px 0 0',padding:'16px 20px 32px',position:'absolute',bottom:0,left:0,right:0,maxHeight:'90%',overflowY:'auto'}}>
        <div style={{width:36,height:4,background:'#ddd',borderRadius:2,margin:'0 auto 16px'}} />
        <div style={{fontWeight:800,fontSize:17,marginBottom:16}}>주문 정보 입력</div>
        <div style={S.fLabel}>주문자 이름</div>
        <input value={name} onChange={e=>{setName(e.target.value);setErr("");}} placeholder="이름" style={S.mInput} />
        <div style={S.fLabel}>배달 장소</div>
        <input value={location} onChange={e=>{setLocation(e.target.value);setErr("");}} placeholder="예) 3학년 2반, 교무실" style={S.mInput} />
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
         : <div style={{display:'flex',flexWrap:'wrap',gap:7,marginBottom:16}}>
             {slots.map(t=><button key={t} onClick={()=>setTime(t)} style={{padding:'7px 13px',border:`1.5px solid ${time===t?P:'#e0e0e0'}`,borderRadius:20,background:time===t?P:'#fff',color:time===t?'#fff':'#555',fontSize:13,fontWeight:time===t?700:400,cursor:'pointer'}}>{t}</button>)}
           </div>}
        {time&&dayEnabled&&<div style={{background:'#f0faf4',borderRadius:12,padding:'10px 14px',marginBottom:14,display:'flex',alignItems:'center',gap:8}}><span style={{fontSize:18}}>📅</span><div><div style={{fontSize:12,color:'#888'}}>선택된 배달 일시</div><div style={{fontSize:14,fontWeight:700,color:P}}>{date.tag} {date.label} {time}</div></div></div>}
        {err&&<div style={{color:'#e53935',fontSize:13,marginBottom:10}}>⚠️ {err}</div>}
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
    <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:`linear-gradient(160deg,${P} 0%,#2ea76a 100%)`,padding:'32px 24px'}}>
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
      <div style={{flex:1,overflowY:'auto',padding:'8px 0'}}>
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
function AdminScreen({ drinks, cats, settings, activeTab, onTabChange, onBack, onEdit, onNew, onDelete, onToggleCat, onUpdateCat, onSaveSettings }) {
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
      <div style={{flex:1,overflowY:'auto'}}>
        {activeTab==="drinks"     && <DrinksTab drinks={drinks} onEdit={onEdit} onDelete={onDelete} />}
        {activeTab==="categories" && <CategoriesTab cats={cats} onToggle={onToggleCat} onUpdate={onUpdateCat} />}
        {activeTab==="orders"     && <AdminOrdersTab />}
        {activeTab==="settings"   && <SettingsTab settings={settings} onSave={onSaveSettings} />}
      </div>
    </div>
  );
}

function DrinksTab({ drinks, onEdit, onDelete }) {
  const [confirm,setConfirm]=useState(null);
  return (
    <div style={{padding:'0 16px'}}>
      {drinks.length===0&&<div style={S.empty}>등록된 음료가 없습니다</div>}
      {drinks.map(d=>(
        <div key={d.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 0',borderBottom:'1px solid #f5f5f5'}}>
          <img src={d.image} alt="" style={{width:60,height:60,borderRadius:12,objectFit:'cover',background:'#f5f5f5',flexShrink:0}} onError={e=>{e.target.src="https://via.placeholder.com/60x60?text=☕";}} />
          <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:14,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.name}</div><div style={{fontSize:12,color:'#888'}}>{fmt(d.price)} · 옵션 {d.options.length}개</div></div>
          <button onClick={()=>onEdit(d)} style={S.editBtn}>수정</button>
          <button onClick={()=>setConfirm(d.id)} style={S.delBtn}>삭제</button>
        </div>
      ))}
      {confirm&&<div style={S.overlay}><div style={{background:'#fff',borderRadius:20,padding:24,width:260,margin:'auto'}}><div style={{fontWeight:700,textAlign:'center',marginBottom:4}}>음료를 삭제할까요?</div><div style={{fontSize:13,color:'#888',textAlign:'center',marginBottom:20}}>삭제 후 복구할 수 없습니다</div><div style={{display:'flex',gap:10}}><button onClick={()=>setConfirm(null)} style={{flex:1,height:44,borderRadius:22,border:'1px solid #ddd',background:'#f5f5f5',cursor:'pointer',fontWeight:600,color:'#333'}}>취소</button><button onClick={()=>{onDelete(confirm);setConfirm(null);}} style={{flex:1,height:44,borderRadius:22,border:'2px solid #e53935',background:'#fff0f0',color:'#c62828',fontWeight:700,cursor:'pointer'}}>삭제</button></div></div></div>}
    </div>
  );
}

function CategoriesTab({ cats, onToggle, onUpdate }) {
  const [editing,setEditing]=useState(null);
  const [ef,setEf]=useState({label:'',icon:''});
  return (
    <div style={{padding:16}}>
      <div style={{fontSize:13,color:'#555',lineHeight:1.6,padding:'10px 14px',background:'#f0faf4',borderRadius:12,marginBottom:16,borderLeft:`3px solid ${P}`}}>💡 이름·아이콘 수정 및 노출 여부 설정</div>
      {cats.map(cat=>(
        <div key={cat.id} style={{borderBottom:'1px solid #f5f5f5'}}>
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
      ))}
    </div>
  );
}

// ─── ADMIN ORDERS ─────────────────────────────────────────────
function AdminOrdersTab() {
  const [orders,setOrders]=useState(null);
  const [subTab,setSubTab]=useState('daily');
  const [open,setOpen]=useState({});
  useEffect(()=>{ getAllOrders().then(setOrders); },[]);
  if (!orders) return <div style={S.empty}>로딩 중...<br/><span style={{fontSize:12,color:'#aaa'}}>전체 주문 내역을 불러오는 중</span></div>;

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
                  <span style={{fontSize:14,fontWeight:700,color:P,flexShrink:0,marginLeft:8}}>{fmt(o.totalPrice||0)}</span>
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
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
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
      <div style={{flex:1,overflowY:'auto',paddingTop:8}}>
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
const PRESET_EMOJIS = ['🏫','🎓','🏛️','📚','🌟','🏆','🎒','🌈','🎪','🎨','☕','🥤','🍹','🧃','🍵','🧋','🍶','🥛','🍺','🧉','❤️','💚','💙','⭐','✨','🔥','🌸','🌺'];

function EmojiPicker({ value, onChange }) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{position:'relative'}}>
      <button onClick={()=>setOpen(p=>!p)} style={{width:56,height:52,fontSize:26,border:'2px solid #e0e0e0',borderRadius:12,background:'#f8f8f8',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
        {value||'🏫'}
      </button>
      {open&&(
        <div style={{position:'absolute',top:60,left:0,background:'#fff',border:'1px solid #e0e0e0',borderRadius:16,padding:12,zIndex:200,boxShadow:'0 8px 30px rgba(0,0,0,0.15)',width:240}}>
          <div style={{fontSize:11,color:'#888',marginBottom:8,fontWeight:600}}>아이콘 선택</div>
          <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
            {PRESET_EMOJIS.map(e=>(
              <button key={e} onClick={()=>{onChange(e);setOpen(false);}} style={{width:36,height:36,fontSize:20,border:`2px solid ${value===e?P:'transparent'}`,borderRadius:8,background:value===e?'#f0faf4':'none',cursor:'pointer'}}>
                {e}
              </button>
            ))}
          </div>
          <div style={{borderTop:'1px solid #f0f0f0',paddingTop:8,marginTop:8}}>
            <div style={{fontSize:11,color:'#888',marginBottom:4}}>직접 입력</div>
            <input value={value} onChange={e=>onChange(e.target.value)} placeholder="이모지 또는 텍스트" style={{...S.input,marginBottom:0,fontSize:18,textAlign:'center'}} />
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsTab({ settings, onSave }) {
  const [form,setForm]=useState({...INIT_SETTINGS,...settings,school:{...INIT_SETTINGS.school,...settings.school},banner:{...INIT_SETTINGS.banner,...settings.banner},deliveryHours:{...INIT_DH,...settings.deliveryHours}});
  const [saved,setSaved]=useState(false);
  const [testing,setTesting]=useState(null);
  const [testResult,setTestResult]=useState(null);
  const [bannerImgRef]=useState({current:null});

  const save=()=>{ onSave(form); setSaved(true); setTimeout(()=>setSaved(false),2000); };
  const upSchool=(k,v)=>setForm(p=>({...p,school:{...p.school,[k]:v}}));
  const upBanner=(k,v)=>setForm(p=>({...p,banner:{...p.banner,[k]:v}}));
  const upDH=(day,k,v)=>setForm(p=>({...p,deliveryHours:{...p.deliveryHours,[day]:{...p.deliveryHours[day],[k]:v}}}));
  const upTg=(k,v)=>setForm(p=>({...p,telegram:{...p.telegram,[k]:v}}));
  const upKk=(k,v)=>setForm(p=>({...p,kakao:{...p.kakao,[k]:v}}));

  const handleBannerImg=(e)=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>upBanner('image',ev.target.result); r.readAsDataURL(f); };
  const testTg=async()=>{ setTesting('tg');setTestResult(null); const r=await sendTelegram(form.telegram.token,form.telegram.chatId,`✅ [${form.school?.name||'학교'}] 텔레그램 연결 테스트 성공!`); setTestResult({s:'tg',...r}); setTesting(null); };
  const testKk=async()=>{ setTesting('kk');setTestResult(null); const r=await sendKakao(form.kakao.accessToken,`✅ 카카오톡 연결 테스트 성공!`); setTestResult({s:'kk',...r}); setTesting(null); };
  const imgFileRef=useRef();

  return (
    <div style={{padding:16}}>

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

      {/* 배너 설정 */}
      <SH>🖼 배너 설정</SH>
      <div style={{background:'#f8f8f8',borderRadius:14,padding:14,marginBottom:20}}>
        <div style={{fontSize:12,color:'#888',marginBottom:10}}>홈 화면 배너의 문구와 이미지를 설정합니다</div>
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>헤드라인 문구</div>
        <input value={form.banner?.headline||''} onChange={e=>upBanner('headline',e.target.value)} placeholder="음료를 주문하세요 🍹" style={S.input} />
        <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:4}}>서브 문구</div>
        <input value={form.banner?.subtext||''} onChange={e=>upBanner('subtext',e.target.value)} placeholder="매일 신선하게 준비됩니다" style={S.input} />
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
        <div style={{marginTop:10,borderRadius:12,background:`linear-gradient(135deg,${P},#2ea76a)`,padding:'12px 16px',color:'#fff',overflow:'hidden',position:'relative',minHeight:60}}>
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
            <div key={day} style={{display:'flex',alignItems:'center',gap:8,padding:'9px 0',borderBottom:'1px solid #ececec'}}>
              <div onClick={()=>upDH(day,'enabled',!cfg.enabled)} style={{width:44,height:24,borderRadius:12,background:cfg.enabled?P:'#ddd',position:'relative',cursor:'pointer',transition:'background 0.2s',flexShrink:0}}>
                <div style={{width:20,height:20,borderRadius:10,background:'#fff',position:'absolute',top:2,left:cfg.enabled?22:2,transition:'left 0.2s',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}} />
              </div>
              <span style={{fontSize:13,fontWeight:700,width:30,color:cfg.enabled?'#111':'#bbb'}}>{WDAY[day]}요일</span>
              {cfg.enabled?(
                <>
                  <select value={cfg.start} onChange={e=>upDH(day,'start',e.target.value)} style={{flex:1,padding:'6px 4px',border:'1px solid #e0e0e0',borderRadius:8,fontSize:12,background:'#fff',cursor:'pointer'}}>
                    {ALL_TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                  <span style={{fontSize:11,color:'#888'}}>~</span>
                  <select value={cfg.end} onChange={e=>upDH(day,'end',e.target.value)} style={{flex:1,padding:'6px 4px',border:'1px solid #e0e0e0',borderRadius:8,fontSize:12,background:'#fff',cursor:'pointer'}}>
                    {ALL_TIME_OPTIONS.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </>
              ):<span style={{fontSize:12,color:'#bbb',flex:1}}>배달 없음</span>}
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
  const [form,setForm]=useState(drink||{name:'',nameEn:'',price:'',description:'',categoryId:'coffee',image:'',tags:[],sizes:[{label:'M',ml:355,price:0},{label:'L',ml:473,price:500}],options:[]});
  const [newOpt,setNewOpt]=useState({label:'',choices:''});
  const imgRef=useRef();
  const upd=(k,v)=>setForm(p=>({...p,[k]:v}));
  const handleImg=e=>{ const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>upd('image',ev.target.result); r.readAsDataURL(f); };
  const addOpt=()=>{ if(!newOpt.label||!newOpt.choices)return; const choices=newOpt.choices.split(',').map(c=>c.trim()).filter(Boolean); upd('options',[...form.options,{id:Date.now().toString(),label:newOpt.label,choices,default:choices[0]}]); setNewOpt({label:'',choices:''}); };
  const handleSave=()=>{ if(!form.name.trim()||!form.price){alert('이름과 가격을 입력해주세요');return;} onSave({...form,price:Number(form.price)}); };
  return (
    <div style={{...S.screen,overflowY:'auto'}}>
      <div style={S.navBar}><button onClick={onBack} style={S.backBtn}>‹</button><span style={S.navTitle}>{drink?'음료 수정':'음료 추가'}</span><button onClick={handleSave} style={S.newBtn}>저장</button></div>
      <div style={{padding:'0 16px 100px'}}>
        <div style={{padding:'12px 0 8px',fontSize:15,fontWeight:700}}>음료 이미지</div>
        <div style={{width:'100%',height:130,border:'2px dashed #ddd',borderRadius:14,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',overflow:'hidden',marginBottom:10}} onClick={()=>imgRef.current.click()}>
          {form.image?<img src={form.image} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} />:<div style={{textAlign:'center',color:'#aaa'}}><div style={{fontSize:32}}>📷</div><div style={{fontSize:12}}>클릭하여 선택</div></div>}
        </div>
        <input ref={imgRef} type="file" accept="image/*" style={{display:'none'}} onChange={handleImg} />
        <input placeholder="또는 이미지 URL" value={form.image?.startsWith('data:')?'':(form.image||'')} onChange={e=>upd('image',e.target.value)} style={S.input} />
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>기본 정보</div>
        <input placeholder="음료 이름 (한국어) *" value={form.name} onChange={e=>upd('name',e.target.value)} style={S.input} />
        <input placeholder="음료 이름 (영어)" value={form.nameEn} onChange={e=>upd('nameEn',e.target.value)} style={S.input} />
        <input placeholder="간단한 설명" value={form.description} onChange={e=>upd('description',e.target.value)} style={S.input} />
        <input placeholder="가격 (원) *" type="number" value={form.price} onChange={e=>upd('price',e.target.value)} style={S.input} />
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>카테고리</div>
        <select value={form.categoryId} onChange={e=>upd('categoryId',e.target.value)} style={S.input}>{cats.map(c=><option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}</select>
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>태그</div>
        <button onClick={()=>upd('tags',form.tags.includes('BEST')?form.tags.filter(t=>t!=='BEST'):[...form.tags,'BEST'])} style={{padding:'6px 18px',border:`1.5px solid ${form.tags.includes('BEST')?'#e65100':'#ddd'}`,borderRadius:20,background:form.tags.includes('BEST')?'#fff3e0':'#fff',color:form.tags.includes('BEST')?'#e65100':'#666',fontSize:13,cursor:'pointer',fontWeight:700,marginBottom:10}}>BEST</button>
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>컵 사이즈</div>
        {form.sizes.map((sz,i)=>(
          <div key={i} style={{display:'flex',gap:8,marginBottom:8,alignItems:'center'}}>
            <input value={sz.label} onChange={e=>{const s=[...form.sizes];s[i]={...s[i],label:e.target.value};upd('sizes',s);}} style={{...S.input,width:60,marginBottom:0}} />
            <input value={sz.ml} type="number" onChange={e=>{const s=[...form.sizes];s[i]={...s[i],ml:Number(e.target.value)};upd('sizes',s);}} style={{...S.input,flex:1,marginBottom:0}} placeholder="ml" />
            <input value={sz.price} type="number" onChange={e=>{const s=[...form.sizes];s[i]={...s[i],price:Number(e.target.value)};upd('sizes',s);}} style={{...S.input,flex:1,marginBottom:0}} placeholder="+원" />
            <button onClick={()=>upd('sizes',form.sizes.filter((_,j)=>j!==i))} style={{...S.delBtn,padding:'8px'}}>✕</button>
          </div>
        ))}
        <button onClick={()=>upd('sizes',[...form.sizes,{label:'XL',ml:591,price:1000}])} style={S.addRowBtn}>+ 사이즈 추가</button>
        <div style={{padding:'4px 0 8px',fontSize:15,fontWeight:700}}>퍼스널 옵션</div>
        {form.options.map(opt=>(
          <div key={opt.id} style={{background:'#f8f8f8',borderRadius:12,padding:'10px 14px',marginBottom:8,display:'flex',alignItems:'center',gap:8}}>
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
    <div style={{display:'flex',borderTop:'1px solid #f0f0f0',background:'#fff',flexShrink:0,paddingBottom:'env(safe-area-inset-bottom, 6px)'}}>
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
  shell:{width:'100%',minHeight:'100vh',display:'flex',justifyContent:'center',alignItems:'flex-start',background:'#f0f2f5',fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif"},
  phone:{width:'100%',maxWidth:480,minHeight:'100vh',background:'#fff',display:'flex',flexDirection:'column',overflow:'hidden',position:'relative',color:'#111',boxShadow:'0 0 40px rgba(0,0,0,0.12)'},
  statusBar:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 24px 6px',fontSize:13,fontWeight:600,flexShrink:0},
  screen:{flex:1,display:'flex',flexDirection:'column',overflowY:'auto',overflowX:'hidden'},
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
