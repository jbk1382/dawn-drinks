import { Shader, MeshGradient } from 'shaders/react';

// WebGPU를 못 쓰는 기기에서는 캔버스가 투명하게 남아 부모의 CSS 그라디언트가 그대로 보입니다
export default function ShaderBanner({ colorA, colorB }) {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  return (
    <Shader disableTelemetry colorSpace="srgb" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none'}}>
      <MeshGradient colorA={colorA} colorB={colorB} stops={null} speed={reduceMotion?0:0.6} />
    </Shader>
  );
}
