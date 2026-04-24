import{r as o,j as t}from"./index-DRyq2Hq5.js";import{J as A,I as M,P as N,bf as k,T as b,aJ as E,aK as T,D as I,y as u,a0 as O,bg as z,bh as P}from"./EmbeddedWalletProvider-CamoBLTb.js";import{h as $}from"./CopyToClipboard-DSTf_eKU-e0l24vLs.js";import{a as q}from"./Layouts-BlFm53ED-DM0mT-Ag.js";import{a as F,i as J}from"./JsonTree-aPaJmPx7-DXeHb2Z3.js";import{n as V}from"./ScreenLayout-DGbEZh8t-Da_4WfmI.js";import{c as H}from"./createLucideIcon-7XVcqml7.js";import"./hostApi-B7Whi15c.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-YHjPAZcu.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./ModalHeader-ByY2wsBw-B3a4ZPGb.js";import"./Screen-17GDtJCX-B9K4aUfQ.js";import"./index-Dq_xe9dz-2dgfB1sU.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7",key:"1m0v6g"}],["path",{d:"M18.375 2.625a1 1 0 0 1 3 3l-9.013 9.014a2 2 0 0 1-.853.505l-2.873.84a.5.5 0 0 1-.62-.62l.84-2.873a2 2 0 0 1 .506-.852z",key:"ohrbg2"}]],Q=H("square-pen",K),W=u.img`
  && {
    height: ${e=>e.size==="sm"?"65px":"140px"};
    width: ${e=>e.size==="sm"?"65px":"140px"};
    border-radius: 16px;
    margin-bottom: 12px;
  }
`;let B=e=>{if(!O(e))return e;try{let a=z(e);return a.includes("�")?e:a}catch{return e}},G=e=>{try{let a=P.decode(e),s=new TextDecoder().decode(a);return s.includes("�")?e:s}catch{return e}},X=e=>{let{types:a,primaryType:s,...l}=e.typedData;return t.jsxs(t.Fragment,{children:[t.jsx(te,{data:l}),t.jsx($,{text:(n=e.typedData,JSON.stringify(n,null,2)),itemName:"full payload to clipboard"})," "]});var n};const Y=({method:e,messageData:a,copy:s,iconUrl:l,isLoading:n,success:g,walletProxyIsLoading:m,errorMessage:x,isCancellable:d,onSign:c,onCancel:y,onClose:p})=>t.jsx(V,{title:s.title,subtitle:s.description,showClose:!0,onClose:p,icon:Q,iconVariant:"subtle",helpText:x?t.jsx(ee,{children:x}):void 0,primaryCta:{label:s.buttonText,onClick:c,disabled:n||g||m,loading:n},secondaryCta:d?{label:"Not now",onClick:y,disabled:n||g||m}:void 0,watermark:!0,children:t.jsxs(q,{children:[l?t.jsx(W,{style:{alignSelf:"center"},size:"sm",src:l,alt:"app image"}):null,t.jsxs(Z,{children:[e==="personal_sign"&&t.jsx(w,{children:B(a)}),e==="eth_signTypedData_v4"&&t.jsx(X,{typedData:a}),e==="solana_signMessage"&&t.jsx(w,{children:G(a)})]})]})}),ye={component:()=>{let{authenticated:e}=A(),{initializeWalletProxy:a,closePrivyModal:s}=M(),{navigate:l,data:n,onUserCloseViaDialogOrKeybindRef:g}=N(),[m,x]=o.useState(!0),[d,c]=o.useState(""),[y,p]=o.useState(),[f,C]=o.useState(null),[j,S]=o.useState(!1);o.useEffect((()=>{e||l("LandingScreen")}),[e]),o.useEffect((()=>{a(k).then((i=>{x(!1),i||(c("An error has occurred, please try again."),p(new b(new E(d,T.E32603_DEFAULT_INTERNAL_ERROR.eipCode))))}))}),[]);let{method:R,data:_,confirmAndSign:v,onSuccess:D,onFailure:U,uiOptions:r}=n.signMessage,L={title:r?.title||"Sign message",description:r?.description||"Signing this message will not cost you any fees.",buttonText:r?.buttonText||"Sign and continue"},h=i=>{i?D(i):U(y||new b(new E("The user rejected the request.",T.E4001_USER_REJECTED_REQUEST.eipCode))),s({shouldCallAuthOnSuccess:!1}),setTimeout((()=>{C(null),c(""),p(void 0)}),200)};return g.current=()=>{h(f)},t.jsx(Y,{method:R,messageData:_,copy:L,iconUrl:r?.iconUrl&&typeof r.iconUrl=="string"?r.iconUrl:void 0,isLoading:j,success:f!==null,walletProxyIsLoading:m,errorMessage:d,isCancellable:r?.isCancellable,onSign:async()=>{S(!0),c("");try{let i=await v();C(i),S(!1),setTimeout((()=>{h(i)}),I)}catch(i){console.error(i),c("An error has occurred, please try again."),p(new b(new E(d,T.E32603_DEFAULT_INTERNAL_ERROR.eipCode))),S(!1)}},onCancel:()=>h(null),onClose:()=>h(f)})}};let Z=u.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 16px;
`,ee=u.p`
  && {
    margin: 0;
    width: 100%;
    text-align: center;
    color: var(--privy-color-error-dark);
    font-size: 14px;
    line-height: 22px;
  }
`,te=u(F)`
  margin-top: 0;
`,w=u(J)`
  margin-top: 0;
`;export{ye as SignRequestScreen,Y as SignRequestView,ye as default};
