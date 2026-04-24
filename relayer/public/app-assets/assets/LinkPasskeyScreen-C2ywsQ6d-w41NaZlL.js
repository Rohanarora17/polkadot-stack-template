import{r as h,j as e}from"./index-SWaW1Ukh.js";import{y as a,J as C,I as E,i as v,E as k,g as b,b5 as I}from"./EmbeddedWalletProvider-B0T2InJj.js";import{a as P,c as x}from"./TodoList-CgrU7uwu-67C8dlmX.js";import{n as L}from"./ScreenLayout-DGbEZh8t-B5mumA6z.js";import{C as S}from"./circle-check-big-oTMZBqYR.js";import{F as w}from"./fingerprint-pattern-DlvNw8Pp.js";import{c as N}from"./createLucideIcon-B6n0EQup.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-Bdptgswe.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./check-C9lVIBh3.js";import"./ModalHeader-ByY2wsBw-DVviRVLl.js";import"./Screen-17GDtJCX-CEwj_AH8.js";import"./index-Dq_xe9dz-kuV4TcwE.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const A=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],$=N("trash-2",A),B=({passkeys:o,isLoading:l,errorReason:u,success:y,expanded:n,onLinkPasskey:d,onUnlinkPasskey:s,onExpand:r,onBack:t,onClose:i})=>e.jsx(L,y?{title:"Passkeys updated",icon:S,iconVariant:"success",primaryCta:{label:"Done",onClick:i},onClose:i,watermark:!0}:n?{icon:w,title:"Your passkeys",onBack:t,onClose:i,watermark:!0,children:e.jsx(j,{passkeys:o,expanded:n,onUnlink:s,onExpand:r})}:{icon:w,title:"Set up passkey verification",subtitle:"Verify with passkey",primaryCta:{label:"Add new passkey",onClick:d,loading:l},onClose:i,watermark:!0,helpText:u||void 0,children:o.length===0?e.jsx(U,{}):e.jsx(M,{children:e.jsx(j,{passkeys:o,expanded:n,onUnlink:s,onExpand:r})})});let M=a.div`
  margin-bottom: 12px;
`,j=({passkeys:o,expanded:l,onUnlink:u,onExpand:y})=>{let[n,d]=h.useState([]),s=l?o.length:2;return e.jsxs("div",{children:[e.jsx(V,{children:"Your passkeys"}),e.jsxs(T,{children:[o.slice(0,s).map((r=>{return e.jsxs(D,{children:[e.jsxs("div",{children:[e.jsx(z,{children:(t=r,t.authenticatorName?t.createdWithBrowser?`${t.authenticatorName} on ${t.createdWithBrowser}`:t.authenticatorName:t.createdWithBrowser?t.createdWithOs?`${t.createdWithBrowser} on ${t.createdWithOs}`:`${t.createdWithBrowser}`:"Unknown device")}),e.jsxs(O,{children:["Last used:"," ",(r.latestVerifiedAt??r.firstVerifiedAt)?.toLocaleString()??"N/A"]})]}),e.jsx(R,{disabled:n.includes(r.credentialId),onClick:()=>(async i=>{d((p=>p.concat([i]))),await u(i),d((p=>p.filter((m=>m!==i))))})(r.credentialId),children:n.includes(r.credentialId)?e.jsx(I,{}):e.jsx($,{size:16})})]},r.credentialId);var t})),o.length>2&&!l&&e.jsx(_,{onClick:y,children:"View all"})]})]})},U=()=>e.jsxs(P,{style:{color:"var(--privy-color-foreground)"},children:[e.jsx(x,{children:"Verify with Touch ID, Face ID, PIN, or hardware key"}),e.jsx(x,{children:"Takes seconds to set up and use"}),e.jsx(x,{children:"Use your passkey to verify transactions and login to your account"})]});const se={component:()=>{let{user:o,unlinkPasskey:l}=C(),{linkWithPasskey:u,closePrivyModal:y}=E(),n=o?.linkedAccounts.filter((c=>c.type==="passkey")),[d,s]=h.useState(!1),[r,t]=h.useState(""),[i,p]=h.useState(!1),[m,f]=h.useState(!1);return h.useEffect((()=>{n.length===0&&f(!1)}),[n.length]),e.jsx(B,{passkeys:n,isLoading:d,errorReason:r,success:i,expanded:m,onLinkPasskey:()=>{s(!0),u().then((()=>p(!0))).catch((c=>{if(c instanceof v){if(c.privyErrorCode===k.CANNOT_LINK_MORE_OF_TYPE)return void t("Cannot link more passkeys to account.");if(c.privyErrorCode===k.PASSKEY_NOT_ALLOWED)return void t("Passkey request timed out or rejected by user.")}t("Unknown error occurred.")})).finally((()=>{s(!1)}))},onUnlinkPasskey:async c=>(s(!0),await l(c).then((()=>p(!0))).catch((g=>{g instanceof v&&g.privyErrorCode===k.MISSING_MFA_CREDENTIALS?t("Cannot unlink a passkey enrolled in MFA"):t("Unknown error occurred.")})).finally((()=>{s(!1)}))),onExpand:()=>f(!0),onBack:()=>f(!1),onClose:()=>y()})}},ae=a.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 90px;
  border-radius: 50%;
  svg + svg {
    margin-left: 12px;
  }
  > svg {
    z-index: 2;
    color: var(--privy-color-accent) !important;
    stroke: var(--privy-color-accent) !important;
    fill: var(--privy-color-accent) !important;
  }
`;let W=b`
  && {
    width: 100%;
    font-size: 0.875rem;
    line-height: 1rem;

    /* Tablet and Up */
    @media (min-width: 440px) {
      font-size: 14px;
    }

    display: flex;
    gap: 12px;
    justify-content: center;

    padding: 6px 8px;
    background-color: var(--privy-color-background);
    transition: background-color 200ms ease;
    color: var(--privy-color-accent) !important;

    :focus {
      outline: none;
      box-shadow: none;
    }
  }
`;const _=a.button`
  ${W}
`;let T=a.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.8rem;
  padding: 0.5rem 0rem 0rem;
  flex-grow: 1;
  width: 100%;
`,V=a.div`
  line-height: 20px;
  height: 20px;
  font-size: 1em;
  font-weight: 450;
  display: flex;
  justify-content: flex-beginning;
  width: 100%;
`,z=a.div`
  font-size: 1em;
  line-height: 1.3em;
  font-weight: 500;
  color: var(--privy-color-foreground-2);
  padding: 0.2em 0;
`,O=a.div`
  font-size: 0.875rem;
  line-height: 1rem;
  color: #64668b;
  padding: 0.2em 0;
`,D=a.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1em;
  gap: 10px;
  font-size: 0.875rem;
  line-height: 1rem;
  text-align: left;
  border-radius: 8px;
  border: 1px solid #e2e3f0 !important;
  width: 100%;
  height: 5em;
`,F=b`
  :focus,
  :hover,
  :active {
    outline: none;
  }
  display: flex;
  width: 2em;
  height: 2em;
  justify-content: center;
  align-items: center;
  svg {
    color: var(--privy-color-error);
  }
  svg:hover {
    color: var(--privy-color-foreground-3);
  }
`,R=a.button`
  ${F}
`;export{ae as DoubleIconWrapper,_ as LinkButton,se as LinkPasskeyScreen,B as LinkPasskeyView,se as default};
