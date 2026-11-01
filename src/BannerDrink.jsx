const Steam = ({ xs, y=24 }) => xs.map((x,i)=>(
  <path key={x} className="dk-steam" style={{animationDelay:`${i*0.7}s`}} d={`M${x} ${y}c-3-3 3-5 0-8s3-5 0-8`} fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
));
const Bubbles = ({ items, color='#fff' }) => items.map(([x,y,r],i)=>(
  <circle key={i} className="dk-bubble" style={{animationDelay:`${i*0.45}s`}} cx={x} cy={y} r={r} fill={color} />
));
const Glass = () => <path d="M17 18h30l-4 40H21z" fill="rgba(255,255,255,0.22)" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />;
const Liquid = ({ color, top=24, className }) => {
  const inset = (top-18)*0.1;
  return <path className={className} d={`M${17.8+inset} ${top}h${28.4-inset*2}l-3.2 ${33-(top-24)}H21.4z`} fill={color} />;
};
const Straw = ({ color='#ff5a5f', d='M38 42L45 6' }) => <path d={d} stroke={color} strokeWidth="3.4" strokeLinecap="round" fill="none" />;

const Mug = ({ top }) => (
  <>
    <path d="M45 34h4a6 6 0 0 1 0 12h-4" fill="none" stroke="#fff" strokeWidth="3.4" />
    <path d="M13 28h32v18a9 9 0 0 1-9 9H22a9 9 0 0 1-9-9z" fill="#fff" />
    <ellipse cx="29" cy="28.5" rx="16" ry="3.6" fill={top} stroke="#fff" strokeWidth="1.6" />
    <ellipse cx="29" cy="58" rx="20" ry="2.4" fill="rgba(255,255,255,0.75)" />
  </>
);

const DRINKS = [
  {id:'coffee', name:'핫 커피', art:<><Steam xs={[22,29,36]} /><Mug top="#5b3420" /></>},
  {id:'latte', name:'카페라떼', art:<>
    <Steam xs={[25,32,39]} y={18} />
    <Glass />
    <Liquid color="#f6e7d4" />
    <path d="M19.2 34h25.6l-1.2 12H20.4z" fill="#b5835a" />
    <path d="M18 22h28l-.4 4H18.4z" fill="#fff" />
  </>},
  {id:'iced', name:'아이스 커피', art:<>
    <Straw color="#2ee59d" />
    <Glass />
    <Liquid color="rgba(91,52,32,0.9)" top={26} />
    <rect className="dk-bob" x="23" y="28" width="10" height="10" rx="2" fill="rgba(255,255,255,0.8)" />
    <rect className="dk-bob" style={{animationDelay:'0.6s'}} x="33" y="33" width="8" height="8" rx="2" fill="rgba(255,255,255,0.65)" />
    <rect className="dk-bob" style={{animationDelay:'1.2s'}} x="26" y="42" width="8" height="8" rx="2" fill="rgba(255,255,255,0.55)" />
  </>},
  {id:'smoothie', name:'스무디', art:<>
    <Straw color="#fff" d="M36 22L42 2" />
    <path d="M16 22a16 13 0 0 1 32 0" fill="rgba(255,255,255,0.3)" stroke="#fff" strokeWidth="2" />
    <Glass />
    <Liquid color="#ff7aa8" top={20} />
    <path className="dk-swirl" d="M22 33c6-5 13 5 20 0M23 44c5-5 12 5 18 0" fill="none" stroke="#ffd1e0" strokeWidth="3" strokeLinecap="round" />
    <Bubbles items={[[27,52,1.8],[37,53,1.5]]} color="#ffd1e0" />
  </>},
  {id:'ade', name:'에이드', art:<>
    <Straw />
    <Glass />
    <Liquid color="rgba(255,213,79,0.92)" />
    <Bubbles items={[[24,52,1.6],[31,54,2],[38,52,1.5],[27,50,1.2],[35,54,1.3]]} />
    <g className="dk-spin"><circle cx="17" cy="17" r="9" fill="#ffee58" stroke="#fff" strokeWidth="2" /><path d="M17 9v16M9 17h16M11.3 11.3l11.4 11.4M22.7 11.3L11.3 22.7" stroke="#fff" strokeWidth="1.2" /></g>
  </>},
  {id:'tea', name:'따뜻한 차', art:<>
    <Steam xs={[20,28,36]} />
    <Mug top="#d9902f" />
    <g className="dk-swing"><path d="M36 27v12" stroke="#c9c9c9" strokeWidth="1.3" /><rect x="32" y="39" width="8" height="9" rx="1.5" fill="#7fb069" /></g>
  </>},
  {id:'boba', name:'버블티', art:<>
    <Straw color="#ff8fb1" d="M34 40L39 3" />
    <Glass />
    <Liquid color="#d9b38c" top={23} />
    <path d="M15 18h34" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" />
    {[[25,52],[32,53],[39,52],[28,46],[36,46]].map(([x,y],i)=>(
      <circle key={i} className="dk-bob" style={{animationDelay:`${i*0.3}s`}} cx={x} cy={y} r="3.1" fill="#33211a" />
    ))}
  </>},
  {id:'juice', name:'생과일 주스', art:<>
    <Straw color="#fff" />
    <Glass />
    <Liquid color="#ef3f5f" />
    <Bubbles items={[[26,52,1.4],[35,53,1.7]]} color="#ff9db0" />
    <g className="dk-tilt">
      <path d="M17 11c5-4 11 0 9 6s-6 9-9 10c-3-1-7-4-9-10s4-10 9-6z" fill="#ff2d4b" stroke="#fff" strokeWidth="1.4" />
      <path d="M12 8l5 3 5-3-2 5h-6z" fill="#3fbf5f" />
    </g>
  </>},
];

function DrinkArt({ drink, size }) {
  return <svg className="dk-icon" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">{drink.art}</svg>;
}

export function BannerDrink({ id, size=68 }) {
  if (id === 'none') return null;
  const drink = DRINKS.find(d=>d.id===id) || DRINKS[0];
  return <div style={{flexShrink:0,marginLeft:8,lineHeight:0}}><DrinkArt drink={drink} size={size} /></div>;
}

// 관리자 > 배너 설정의 음료 아이콘 선택
export function BannerDrinkPicker({ value, themeColor, onChange }) {
  const selected = value || 'coffee';
  const btn = (on) => ({padding:'6px 2px',border:`2px solid ${on?themeColor:'#e0e0e0'}`,borderRadius:10,background:on?themeColor:'#fff',color:on?'#fff':'#555',fontSize:11,fontWeight:700,cursor:'pointer',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:2,minHeight:66});
  return (
    <div style={{marginBottom:12}}>
      <div style={{fontSize:12,fontWeight:600,color:'#555',marginBottom:6}}>🥤 배너 음료 애니메이션</div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
        {DRINKS.map(d=>{
          const on=selected===d.id;
          return <button key={d.id} aria-pressed={on} onClick={()=>onChange('drinkIcon',d.id)} style={btn(on)}><span style={{display:'block',lineHeight:0,borderRadius:8,background:on?'transparent':'#5a7d8c'}}><DrinkArt drink={d} size={40} /></span>{d.name}</button>;
        })}
        <button aria-pressed={selected==='none'} onClick={()=>onChange('drinkIcon','none')} style={btn(selected==='none')}>표시 안 함</button>
      </div>
    </div>
  );
}
