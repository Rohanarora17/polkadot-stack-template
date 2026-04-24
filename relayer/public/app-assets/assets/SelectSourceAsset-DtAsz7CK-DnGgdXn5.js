import{Y as y,ba as g,y as t}from"./EmbeddedWalletProvider-BjHMkXIO.js";import{j as e,r as h}from"./index-CiCy0wPm.js";import{n as j}from"./ScreenLayout-DGbEZh8t-pcdWInov.js";import{c as k}from"./createLucideIcon-B73hX4bI.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"m6 9 6 6 6-6",key:"qrunsl"}]],A=k("chevron-down",C),N=async({operation:n,until:a,delay:i,interval:s,attempts:c,signal:f})=>{let d,u,o=0;for(;o<c;){if(f?.aborted)return{status:"aborted",result:d,attempts:o,error:u};o++;try{if(u=void 0,d=await n(),a(d))return{status:"success",result:d,attempts:o};o<c&&await y(s)}catch(m){m instanceof Error&&(u=m),o<c&&await y(s)}}return{status:"max_attempts",result:d,attempts:o,error:u}},O=({currency:n="usd",value:a,onChange:i,inputMode:s="decimal",autoFocus:c})=>{let[f,d]=h.useState("0"),u=h.useRef(null),o=a??f,m=g[n]?.symbol??"$",w=h.useCallback((l=>{let r=l.target.value,p=(r=r.replace(/[^\d.]/g,"")).split(".");p.length>2&&(r=p[0]+"."+p.slice(1).join("")),p.length===2&&p[1].length>2&&(r=`${p[0]}.${p[1].slice(0,2)}`),r.length>1&&r[0]==="0"&&r[1]!=="."&&(r=r.slice(1)),(r===""||r===".")&&(r="0"),i?i(r):d(r)}),[i]),b=h.useCallback((l=>{!(["Delete","Backspace","Tab","Escape","Enter",".","ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End"].includes(l.key)||(l.ctrlKey||l.metaKey)&&["a","c","v","x"].includes(l.key.toLowerCase()))&&(l.key>="0"&&l.key<="9"||l.preventDefault())}),[]),v=h.useMemo((()=>(o.includes("."),o)),[o]);return e.jsxs(S,{onClick:()=>u.current?.focus(),children:[e.jsx(x,{children:m}),v,e.jsx("input",{ref:u,type:"text",inputMode:s,value:v,onChange:w,onKeyDown:b,autoFocus:c,placeholder:"0",style:{width:1,height:"1rem",opacity:0,alignSelf:"center",fontSize:"1rem"}}),e.jsx(x,{style:{opacity:0},children:m})]})},T=({selectedAsset:n,onEditSourceAsset:a})=>{let{icon:i}=g[n];return e.jsxs(E,{onClick:a,children:[e.jsx(L,{children:i}),e.jsx(z,{children:n.toLocaleUpperCase()}),e.jsx(D,{children:e.jsx(A,{})})]})};let S=t.span`
  background-color: var(--privy-color-background);
  width: 100%;
  text-align: center;
  border: none;
  font-kerning: none;
  font-feature-settings: 'calt' off;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  cursor: pointer;

  &:focus {
    outline: none !important;
    border: none !important;
    box-shadow: none !important;
  }

  && {
    color: var(--privy-color-foreground);
    font-size: 3.75rem;
    font-style: normal;
    font-weight: 600;
    line-height: 5.375rem;
  }
`,x=t.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 1rem;
  font-style: normal;
  font-weight: 600;
  line-height: 1.5rem;
  margin-top: 0.75rem;
`,E=t.button`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: auto;
  gap: 0.5rem;
  border: 1px solid var(--privy-color-border-default);
  border-radius: var(--privy-border-radius-full);

  && {
    margin: auto;
    padding: 0.5rem 1rem;
  }
`,L=t.div`
  svg {
    width: 1rem;
    height: 1rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
  }
`,z=t.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem;
`,D=t.div`
  color: var(--privy-color-foreground);

  svg {
    width: 1.25rem;
    height: 1.25rem;
  }
`;const Y=({opts:n,isLoading:a,onSelectSource:i})=>e.jsx(j,{showClose:!1,showBack:!0,onBack:()=>i(n.source.selectedAsset),title:"Select currency",children:e.jsx(B,{children:n.source.assets.map((s=>{let{icon:c,name:f}=g[s];return e.jsx(K,{onClick:()=>i(s),disabled:a,children:e.jsxs(M,{children:[e.jsx(R,{children:c}),e.jsxs(U,{children:[e.jsx(_,{children:f}),e.jsx(F,{children:s.toLocaleUpperCase()})]})]})},s)}))})});let B=t.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
`,K=t.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;

  && {
    padding: 0.75rem 1rem;
  }
`,M=t.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,R=t.div`
  svg {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: var(--privy-border-radius-full);
    overflow: hidden;
  }
`,U=t.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
`,_=t.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.25rem;
`,F=t.span`
  color: var(--privy-color-foreground-3);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.125rem;
`;export{Y as b,O as m,T as p,N as u};
