import React from 'react';

const ShaderBanner = React.lazy(() => import('./ShaderBanner'));

const DEFAULT_COLOR_B = '#22d3ee';
const FX_STYLES = [
  {id:'mesh',   name:'메시'},
  {id:'swirl',  name:'소용돌이'},
  {id:'aurora', name:'오로라'},
];

// 배너 배경 효과. 아래부터 CSS 대체 애니메이션 → 셰이더 → 글자 가독성용 어두운 막 순서로 쌓입니다
export function BannerFx({ banner, themeColor }) {
  if (banner?.fxEnabled === false) return null;
  const colorA = banner?.fxColorA || themeColor;
  const colorB = banner?.fxColorB || DEFAULT_COLOR_B;
  const speed = banner?.fxSpeed ?? 1;
  return (
    <>
      <div className="banner-fx-fallback" style={{background:`linear-gradient(120deg,${colorA},${colorB},${colorA})`,backgroundSize:'300% 300%',animationPlayState:speed>0?'running':'paused',animationDuration:`${speed>0?10/speed:10}s`}} />
      {navigator.gpu && <React.Suspense fallback={null}><ShaderBanner style={banner?.fxStyle||'mesh'} colorA={colorA} colorB={colorB} speed={speed} /></React.Suspense>}
      <div style={{position:'absolute',inset:0,background:'rgba(0,0,0,0.18)',pointerEvents:'none'}} />
    </>
  );
}

// 관리자 > 배너 설정의 효과 항목
export function BannerFxSettings({ banner, themeColor, onChange }) {
  const enabled = banner?.fxEnabled !== false;
  const label = {fontSize:12,fontWeight:600,color:'#555',marginBottom:6};
  const swatch = {width:'100%',height:36,padding:2,border:'1px solid #ddd',borderRadius:8,background:'#fff',cursor:'pointer'};
  const link = {border:'none',background:'none',padding:'4px 0',fontSize:11,color:'#888',cursor:'pointer',textDecoration:'underline'};
  return (
    <div style={{marginBottom:12}}>
      <label style={{...label,display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}>
        <span>✨ 움직이는 배경 효과</span>
        <input type="checkbox" checked={enabled} onChange={e=>onChange('fxEnabled',e.target.checked)} />
      </label>
      {enabled && <>
        <div style={label}>효과 종류</div>
        <div style={{display:'flex',gap:6,marginBottom:10}}>
          {FX_STYLES.map(s=>{
            const on=(banner?.fxStyle||'mesh')===s.id;
            return <button key={s.id} onClick={()=>onChange('fxStyle',s.id)} style={{flex:1,padding:'8px 4px',border:`2px solid ${on?themeColor:'#e0e0e0'}`,borderRadius:10,background:'#fff',fontSize:12,fontWeight:700,color:on?themeColor:'#555',cursor:'pointer'}}>{s.name}</button>;
          })}
        </div>
        <div style={{display:'flex',gap:10,marginBottom:6}}>
          <div style={{flex:1}}>
            <div style={label}>색상 1</div>
            <input type="color" aria-label="색상 1" value={banner?.fxColorA||themeColor} onChange={e=>onChange('fxColorA',e.target.value)} style={swatch} />
            <button onClick={()=>onChange('fxColorA','')} style={link}>테마색으로</button>
          </div>
          <div style={{flex:1}}>
            <div style={label}>색상 2</div>
            <input type="color" aria-label="색상 2" value={banner?.fxColorB||DEFAULT_COLOR_B} onChange={e=>onChange('fxColorB',e.target.value)} style={swatch} />
            <button onClick={()=>onChange('fxColorB','')} style={link}>기본색으로</button>
          </div>
        </div>
        <div style={label}>속도 ({banner?.fxSpeed ?? 1}배, 0은 정지)</div>
        <input type="range" aria-label="효과 속도" min="0" max="3" step="0.5" value={banner?.fxSpeed ?? 1} onChange={e=>onChange('fxSpeed',Number(e.target.value))} style={{width:'100%'}} />
        <div style={{fontSize:11,color:'#888',marginTop:4}}>{navigator.gpu?'이 기기: 셰이더 효과 지원':'이 기기: 셰이더 미지원 → 단순 그라디언트 애니메이션으로 표시'}</div>
      </>}
    </div>
  );
}
