import{j as t}from"https://bafybeidkcgg67fl5mea5csvoarnpow624tnzw54iglnvmjyzw7cy75bkxe.app.dot.li/assets/index-DRyq2Hq5.js";import{P as L,cw as q,cx as g,cy as a,cz as z,cA as M,bu as R,cB as T,y as m}from"./EmbeddedWalletProvider-CamoBLTb.js";import{b as D,u as I,m as Q,p as U}from"./SelectSourceAsset-DtAsz7CK-j74--rub.js";import{n as x}from"./ScreenLayout-DGbEZh8t-Da_4WfmI.js";import{t as B,h as N}from"./GooglePay-DA-Ff7zK-W6N2J4YR.js";import{T as W}from"./triangle-alert-Ce8GGTB8.js";import{c as f}from"./createLucideIcon-7XVcqml7.js";import{C as Y}from"./circle-x-C4eUjtYg.js";import{C as G}from"./check-CKy_ZlDk.js";import{W as O}from"./wallet-BJxcdXj7.js";import{S as b}from"./smartphone-DXZGIYdT.js";import"./hostApi-B7Whi15c.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-YHjPAZcu.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./ModalHeader-ByY2wsBw-B3a4ZPGb.js";import"./Screen-17GDtJCX-B9K4aUfQ.js";import"./index-Dq_xe9dz-2dgfB1sU.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const $=[["path",{d:"M12 10h.01",key:"1nrarc"}],["path",{d:"M12 14h.01",key:"1etili"}],["path",{d:"M12 6h.01",key:"1vi96p"}],["path",{d:"M16 10h.01",key:"1m94wz"}],["path",{d:"M16 14h.01",key:"1gbofw"}],["path",{d:"M16 6h.01",key:"1x0f13"}],["path",{d:"M8 10h.01",key:"19clt8"}],["path",{d:"M8 14h.01",key:"6423bh"}],["path",{d:"M8 6h.01",key:"1dz90k"}],["path",{d:"M9 22v-3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3",key:"cabbwy"}],["rect",{x:"4",y:"2",width:"16",height:"20",rx:"2",key:"1uxh74"}]],j=f("building",$);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const F=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],X=f("chevron-right",F);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["rect",{width:"20",height:"14",x:"2",y:"5",rx:"2",key:"ynyp8z"}],["line",{x1:"2",x2:"22",y1:"10",y2:"10",key:"1b3vmo"}]],v=f("credit-card",H);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M10 18v-7",key:"wt116b"}],["path",{d:"M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z",key:"1m329m"}],["path",{d:"M14 18v-7",key:"vav6t3"}],["path",{d:"M18 18v-7",key:"aexdmj"}],["path",{d:"M3 22h18",key:"8prr45"}],["path",{d:"M6 18v-7",key:"1ivflk"}]],C=f("landmark",K),[_,V]=((e,o=750)=>{let r;return[(...s)=>{r&&clearTimeout(r),r=setTimeout((()=>{e(...s)}),o)},()=>{r&&clearTimeout(r)}]})((async(e,o)=>{a({isLoading:!0});try{let{getQuotes:r}=g(),s=await r({source:{asset:o.source.selectedAsset.toUpperCase(),amount:e},destination:{asset:o.destination.asset.toUpperCase(),chain:o.destination.chain,address:o.destination.address},environment:o.environment}),i=s.quotes??[],p=s.provider_errors,l=T(i,e);a({localQuotes:i,localSelectedQuote:i[0]??null,isLoading:!1,quotesWarning:l,quotesErrors:p??null})}catch{a({localQuotes:[],localSelectedQuote:null,quotesWarning:"provider_errors",quotesErrors:null})}})),J=e=>{a({amount:e});let{opts:o}=g();_(e,o)},k=async()=>{let{error:e,state:o,onFailure:r,onSuccess:s}=g();V(),e?r(e):o.status==="provider-success"?await s({status:"confirmed"}):o.status==="provider-confirming"?await s({status:"submitted"}):r(Error("User exited flow"))},Z=async()=>{let e,o=M();if(!o)return;let r=R();if(!r)return void a({state:{status:"provider-error"},error:Error("Unable to open payment window")});a({isLoading:!0});let{opts:s,amount:i,getProviderUrl:p,getStatus:l,controller:d}=g(),u=()=>{try{r.closed||r.close()}catch{}};d.current=new AbortController;try{let c=await p({source:{asset:s.source.selectedAsset.toUpperCase(),amount:i||"0"},destination:{asset:s.destination.asset.toUpperCase(),chain:s.destination.chain,address:s.destination.address},provider:o.provider,sub_provider:o.sub_provider??void 0,payment_method:o.payment_method,redirect_url:window.location.origin});r.location.href=c.url,e=c.session_id}catch{return u(),void a({state:{status:"provider-error"},isLoading:!1,error:Error("Unable to start payment session")})}a({isLoading:!1}),a({state:{status:"provider-confirming"}});let n=await I({operation:()=>l({session_id:e,provider:o.provider}),until:c=>c.status==="completed"||c.status==="failed"||c.status==="cancelled",delay:0,interval:2e3,attempts:60,signal:d.current.signal});if(n.status!=="aborted"){if(n.status==="max_attempts")return u(),n.error?(console.error(n.error),void a({state:{status:"select-amount"},isLoading:!1,error:Error("Unable to check payment status. Please try again.")})):void a({state:{status:"provider-error"},error:Error("Could not confirm payment status yet.")});n.result?.status==="completed"?(u(),a({state:{status:"provider-success"}})):(u(),a({state:{status:"provider-error"},error:Error(`Transaction ${n.result?.status??"failed"}`)}))}},ee=()=>{let e=z();e&&e.length>0&&a({state:{status:"select-payment-method",quotes:e}})},te=()=>{a({state:{status:"select-source-asset"}})},oe=()=>{a({error:null,state:{status:"select-amount"}})},re=e=>{a({localSelectedQuote:e,state:{status:"select-amount"}})},se=e=>{let{opts:o,amount:r}=g(),s={...o,source:{...o.source,selectedAsset:e}};a({opts:s,state:{status:"select-amount"}}),_(r,s)},ne=({onClose:e})=>t.jsx(x,{showClose:!0,onClose:e,iconVariant:"loading",title:"Processing transaction",subtitle:"Your purchase is in progress. You can leave this screen — we’ll notify you when it’s complete.",primaryCta:{label:"Done",onClick:e},watermark:!0}),ae=({onClose:e,onRetry:o})=>t.jsx(x,{showClose:!0,onClose:e,icon:Y,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete your transaction. Please try again.",primaryCta:{label:"Try again",onClick:o},secondaryCta:{label:"Close",onClick:e},watermark:!0}),ie=({onClose:e})=>t.jsx(x,{showClose:!0,onClose:e,icon:G,iconVariant:"success",title:"Transaction confirmed",subtitle:"Your purchase is processing. Funds should arrive in your wallet within a few minutes.",primaryCta:{label:"Done",onClick:e},watermark:!0});let le={CREDIT_DEBIT_CARD:"card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"bank deposit",ACH:"bank deposit",SEPA:"bank deposit",PIX:"PIX"},de={CREDIT_DEBIT_CARD:t.jsx(v,{size:14}),APPLE_PAY:t.jsx(b,{size:14}),GOOGLE_PAY:t.jsx(b,{size:14}),BANK_TRANSFER:t.jsx(j,{size:14}),ACH:t.jsx(j,{size:14}),SEPA:t.jsx(j,{size:14}),PIX:t.jsx(O,{size:14})},ce=e=>de[e]??t.jsx(v,{size:14});const ue=({opts:e,onClose:o,onEditSourceAsset:r,onEditPaymentMethod:s,onContinue:i,onAmountChange:p,amount:l,selectedQuote:d,quotesWarning:u,quotesErrors:n,quotesCount:c,isLoading:h})=>{return t.jsxs(x,{showClose:!0,onClose:o,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:i,loading:h,disabled:!d},helpText:u?t.jsxs(pe,{children:[t.jsx(W,{size:16,strokeWidth:2}),t.jsx(me,{children:t.jsxs(t.Fragment,u==="amount_too_low"?{children:[t.jsx(E,{children:"Amount too low"}),t.jsx(P,{children:"Please choose a higher amount to continue."})]}:{children:[t.jsx(E,{children:"Unable to get quotes"}),t.jsx(P,{children:n?.[0]?.error??"Something went wrong. Please try again."})]})})]}):d&&c>1?t.jsxs(he,{onClick:s,children:[ce(d.payment_method),t.jsxs("span",{children:["Pay with ",(y=d.payment_method,le[y]??y.replace(/_/g," ").toLowerCase().replace(/^\w/,(w=>w.toUpperCase())))]}),t.jsx(X,{size:14})]}):null,watermark:!0,children:[t.jsx(Q,{currency:e.source.selectedAsset,value:l,onChange:p,inputMode:"decimal",autoFocus:!0}),t.jsx(U,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:r})]});var y};let pe=m.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.75rem;
  border-radius: 0.5rem;
  background-color: var(--privy-color-warn-bg, #fffbbb);
  border: 1px solid var(--privy-color-border-warning, #facd63);
  overflow: clip;
  width: 100%;

  svg {
    flex-shrink: 0;
    color: var(--privy-color-icon-warning, #facd63);
  }
`,me=m.div`
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.125rem;
  color: var(--privy-color-foreground);
  font-feature-settings:
    'calt' 0,
    'kern' 0;
  text-align: left;
`,E=m.span`
  font-weight: 600;
`,P=m.span`
  font-weight: 400;
`,he=m.button`
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;

  && {
    padding: 0;
    color: var(--privy-color-accent);
    font-size: 0.875rem;
    font-style: normal;
    font-weight: 500;
    line-height: 1.375rem;
  }
`,ye={CREDIT_DEBIT_CARD:"Credit / debit card",APPLE_PAY:"Apple Pay",GOOGLE_PAY:"Google Pay",BANK_TRANSFER:"Bank transfer",ACH:"ACH",SEPA:"SEPA",PIX:"PIX"},ge={CREDIT_DEBIT_CARD:t.jsx(v,{size:20}),APPLE_PAY:t.jsx(N,{width:20,height:20}),GOOGLE_PAY:t.jsx(B,{width:20,height:20}),BANK_TRANSFER:t.jsx(C,{size:20}),ACH:t.jsx(C,{size:20}),SEPA:t.jsx(C,{size:20}),PIX:t.jsx(C,{size:20})},xe=e=>ge[e]??t.jsx(v,{size:20});const Ce=({onClose:e,onSelectPaymentMethod:o,quotes:r,isLoading:s})=>t.jsx(x,{showClose:!0,onClose:e,title:"Select payment method",subtitle:"Choose how you'd like to pay",watermark:!0,children:t.jsx(fe,{children:r.map(((i,p)=>{return t.jsx(ve,{onClick:()=>o(i),disabled:s,children:t.jsxs(we,{children:[t.jsx(Ae,{children:xe(i.payment_method)}),t.jsx(je,{children:t.jsx(be,{children:(l=i.payment_method,ye[l]??l.replace(/_/g," ").toLowerCase().replace(/^\w/,(d=>d.toUpperCase())))})})]})},`${i.provider}-${i.payment_method}-${p}`);var l}))})});let fe=m.div`
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  width: 100%;
`,ve=m.button`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-md);
  border-style: solid;
  display: flex;

  && {
    padding: 1rem 1rem;
  }
`,we=m.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
`,Ae=m.div`
  color: var(--privy-color-foreground-3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
`,je=m.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.125rem;
  flex: 1;
`,be=m.span`
  color: var(--privy-color-foreground);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.25rem;
`;const ke=({onClose:e,onContinue:o,onAmountChange:r,onSelectSource:s,onEditSourceAsset:i,onEditPaymentMethod:p,onSelectPaymentMethod:l,onRetry:d,opts:u,state:n,amount:c,selectedQuote:h,quotesWarning:y,quotesErrors:w,quotesCount:S,isLoading:A})=>n.status==="select-amount"?t.jsx(ue,{onClose:e,onContinue:o,onAmountChange:r,onEditSourceAsset:i,onEditPaymentMethod:p,opts:u,amount:c,selectedQuote:h,quotesWarning:y,quotesErrors:w,quotesCount:S,isLoading:A}):n.status==="select-source-asset"?t.jsx(D,{onSelectSource:s,opts:u,isLoading:A}):n.status==="select-payment-method"?t.jsx(Ce,{onClose:e,onSelectPaymentMethod:l,quotes:n.quotes,isLoading:A}):n.status==="provider-confirming"?t.jsx(ne,{onClose:e}):n.status==="provider-error"?t.jsx(ae,{onClose:e,onRetry:d}):n.status==="provider-success"?t.jsx(ie,{onClose:e}):null,Oe={component:()=>{let{onUserCloseViaDialogOrKeybindRef:e}=L(),o=q();if(!o)return null;let{opts:r,state:s,isLoading:i,amount:p,quotesWarning:l,quotesErrors:d,localQuotes:u,localSelectedQuote:n,initialQuotes:c,initialSelectedQuote:h}=o;return e.current=k,t.jsx(ke,{onClose:k,opts:r,state:s,isLoading:i,amount:p,selectedQuote:n??h,quotesWarning:l,quotesErrors:d,quotesCount:(u??c)?.length??0,onAmountChange:J,onContinue:Z,onSelectSource:se,onEditSourceAsset:te,onEditPaymentMethod:ee,onSelectPaymentMethod:re,onRetry:oe})}};export{Oe as FiatOnrampScreen,Oe as default};
