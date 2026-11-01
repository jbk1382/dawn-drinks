import { Shader, MeshGradient, Swirl, Aurora } from 'shaders/react';

// WebGPU가 실패하면 캔버스가 투명하게 남아 아래의 CSS 대체 애니메이션이 보입니다
export default function ShaderBanner({ style, colorA, colorB, speed }) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const s = reduceMotion ? 0 : speed;
  return (
    <Shader key={style} disableTelemetry colorSpace="srgb" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
      {style==='swirl' && <Swirl colorA={colorA} colorB={colorB} stops={null} speed={s} />}
      {style==='aurora' && <Aurora colorA={colorA} colorB={colorB} colorC={colorA} speed={s*5} />}
      {style!=='swirl' && style!=='aurora' && <MeshGradient colorA={colorA} colorB={colorB} stops={null} speed={s} />}
    </Shader>
  );
}
