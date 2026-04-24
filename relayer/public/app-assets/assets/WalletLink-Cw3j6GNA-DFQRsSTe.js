import{j as n}from"https://bafybeidkcgg67fl5mea5csvoarnpow624tnzw54iglnvmjyzw7cy75bkxe.app.dot.li/assets/index-DRyq2Hq5.js";import{f as j,L as $,y as l}from"./EmbeddedWalletProvider-CamoBLTb.js";import{i as g,m as a,o as d,c as p}from"./ethers-C123aV2r-BTgB3eap.js";import{C as y}from"./getFormattedUsdFromLamports-B6EqSEho-C-HCdwKa.js";import{t as k}from"./transaction-CnfuREWo-nROljJQP.js";const P=({weiQuantities:e,tokenPrice:r,tokenSymbol:o})=>{let i=a(e),t=r?d(i,r):void 0,s=p(i,o);return n.jsx(c,{children:t||s})},D=({weiQuantities:e,tokenPrice:r,tokenSymbol:o})=>{let i=a(e),t=r?d(i,r):void 0,s=p(i,o);return n.jsx(c,{children:t?n.jsxs(n.Fragment,{children:[n.jsx(S,{children:"USD"}),t==="<$0.01"?n.jsxs(m,{children:[n.jsx(h,{children:"<"}),"$0.01"]}):t]}):s})},F=({quantities:e,tokenPrice:r,tokenSymbol:o="SOL",tokenDecimals:i=9})=>{let t=e.reduce(((f,u)=>f+u),0n),s=r&&o==="SOL"&&i===9?y(t,r):void 0,x=o==="SOL"&&i===9?k(t):`${j(t,i)} ${o}`;return n.jsx(c,{children:s?n.jsx(n.Fragment,{children:s==="<$0.01"?n.jsxs(m,{children:[n.jsx(h,{children:"<"}),"$0.01"]}):s}):x})};let c=l.span`
  font-size: 14px;
  line-height: 140%;
  display: flex;
  gap: 4px;
  align-items: center;
`,S=l.span`
  font-size: 12px;
  line-height: 12px;
  color: var(--privy-color-foreground-3);
`,h=l.span`
  font-size: 10px;
`,m=l.span`
  display: flex;
  align-items: center;
`;function v(e,r){return`https://explorer.solana.com/account/${e}?chain=${r}`}const I=e=>n.jsx(w,{href:e.chainType==="ethereum"?g(e.chainId,e.walletAddress):v(e.walletAddress,e.chainId),target:"_blank",children:$(e.walletAddress)});let w=l.a`
  &:hover {
    text-decoration: underline;
  }
`;export{F as f,D as h,P as p,I as v};
