import{r as m,j as t}from"https://bafybeidkcgg67fl5mea5csvoarnpow624tnzw54iglnvmjyzw7cy75bkxe.app.dot.li/assets/index-DRyq2Hq5.js";import{J as B,P as M,bu as F,bv as V,G as z,y as b}from"./EmbeddedWalletProvider-CamoBLTb.js";import{u as A,b as D,m as N,p as R}from"./SelectSourceAsset-DtAsz7CK-j74--rub.js";import{p as Y}from"./CopyableText-BCytXyJL-BWIu6DIf.js";import{n as k}from"./ScreenLayout-DGbEZh8t-Da_4WfmI.js";import{i as q}from"./InfoBanner-DkQEPd77-BG55rx6l.js";import{c as S}from"./createLucideIcon-7XVcqml7.js";import{C as H}from"./check-CKy_ZlDk.js";import{C as E}from"./circle-x-C4eUjtYg.js";import"./hostApi-B7Whi15c.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-YHjPAZcu.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./copy-DgiqTkh6.js";import"./ModalHeader-ByY2wsBw-B3a4ZPGb.js";import"./Screen-17GDtJCX-B9K4aUfQ.js";import"./index-Dq_xe9dz-2dgfB1sU.js";/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M5 22h14",key:"ehvnwv"}],["path",{d:"M5 2h14",key:"pdyrp9"}],["path",{d:"M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22",key:"1d314k"}],["path",{d:"M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2",key:"1vvvr6"}]],O=S("hourglass",K);/**
 * @license lucide-react v0.554.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const G=[["path",{d:"m16 11 2 2 4-4",key:"9rsbq5"}],["path",{d:"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2",key:"1yyitq"}],["circle",{cx:"9",cy:"7",r:"4",key:"nufk8"}]],J=S("user-check",G),X=e=>{try{return e.location.origin}catch{return}},Q=({data:e,onClose:i})=>t.jsx(k,{showClose:!0,onClose:i,title:"Initiate bank transfer",subtitle:"Use the details below to complete a bank transfer from your bank.",primaryCta:{label:"Done",onClick:i},watermark:!1,footerText:"Exchange rates and fees are set when you authorize and determine the amount you receive. You'll see the applicable rates and fees for your transaction separately",children:t.jsx(Z,{children:(V[e.deposit_instructions.asset]||[]).map((([u,f],y)=>{let d=e.deposit_instructions[u];if(!d||Array.isArray(d))return null;let r=u==="asset"?d.toUpperCase():d,h=r.length>100?`${r.slice(0,9)}...${r.slice(-9)}`:r;return t.jsxs(ee,{children:[t.jsx(te,{children:f}),t.jsx(Y,{value:r,includeChildren:z.isMobile,children:t.jsx(se,{children:h})})]},y)}))})});let Z=b.ol`
  border-color: var(--privy-color-border-default);
  border-width: 1px;
  border-radius: var(--privy-border-radius-mdlg);
  border-style: solid;
  display: flex;
  flex-direction: column;

  && {
    padding: 0 1rem;
  }
`,ee=b.li`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;

  &:not(:first-of-type) {
    border-top: 1px solid var(--privy-color-border-default);
  }

  & > {
    :nth-child(1) {
      flex-basis: 30%;
    }

    :nth-child(2) {
      flex-basis: 60%;
    }
  }
`,te=b.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-variant-numeric: lining-nums proportional-nums;
  font-feature-settings: 'calt' off;

  /* text-xs/font-regular */
  font-size: 0.75rem;
  font-style: normal;
  font-weight: 400;
  line-height: 1.125rem; /* 150% */

  text-align: left;
  flex-shrink: 0;
`,se=b.span`
  color: var(--privy-color-foreground);
  font-kerning: none;
  font-feature-settings: 'calt' off;

  /* text-sm/font-medium */
  font-size: 0.875rem;
  font-style: normal;
  font-weight: 500;
  line-height: 1.375rem; /* 157.143% */

  text-align: right;
  word-break: break-all;
`;const re=({onClose:e})=>t.jsx(k,{showClose:!0,onClose:e,icon:E,iconVariant:"error",title:"Something went wrong",subtitle:"We couldn't complete account setup. This isn't caused by anything you did.",primaryCta:{label:"Close",onClick:e},watermark:!0}),oe=({onClose:e,reason:i})=>{let u=i?i.charAt(0).toLowerCase()+i.slice(1):void 0;return t.jsx(k,{showClose:!0,onClose:e,icon:E,iconVariant:"error",title:"Identity verification failed",subtitle:u?`We can't complete identity verification because ${u}. Please try again or contact support for assistance.`:"We couldn't verify your identity. Please try again or contact support for assistance.",primaryCta:{label:"Close",onClick:e},watermark:!0})},ae=({onClose:e,email:i})=>t.jsx(k,{showClose:!0,onClose:e,icon:O,title:"Identity verification in progress",subtitle:"We're waiting for Persona to approve your identity verification. This usually takes a few minutes, but may take up to 24 hours.",primaryCta:{label:"Done",onClick:e},watermark:!0,children:t.jsxs(q,{theme:"light",children:["You'll receive an email at ",i," once approved with instructions for completing your deposit."]})}),ie=({onClose:e,onAcceptTerms:i,isLoading:u})=>t.jsx(k,{showClose:!0,onClose:e,icon:J,title:"Verify your identity to continue",subtitle:"Finish verification with Persona — it takes just a few minutes and requires a government ID.",helpText:t.jsxs(t.Fragment,{children:[`This app uses Bridge to securely connect accounts and move funds. By clicking "Accept," you agree to Bridge's`," ",t.jsx("a",{href:"https://www.bridge.xyz/legal",target:"_blank",rel:"noopener noreferrer",children:"Terms of Service"})," ","and"," ",t.jsx("a",{href:"https://www.bridge.xyz/legal/row-privacy-policy/bridge-building-limited",target:"_blank",rel:"noopener noreferrer",children:"Privacy Policy"}),"."]}),primaryCta:{label:"Accept and continue",onClick:i,loading:u},watermark:!0}),ne=({onClose:e})=>t.jsx(k,{showClose:!0,onClose:e,icon:H,iconVariant:"success",title:"Identity verified successfully",subtitle:"We've successfully verified your identity. Now initiate a bank transfer to view instructions.",primaryCta:{label:"Initiate bank transfer",onClick:()=>{},loading:!0},watermark:!0}),le=({opts:e,onClose:i,onEditSourceAsset:u,onSelectAmount:f,isLoading:y})=>t.jsxs(k,{showClose:!0,onClose:i,headerTitle:`Buy ${e.destination.asset.toLocaleUpperCase()}`,primaryCta:{label:"Continue",onClick:f,loading:y},watermark:!0,children:[t.jsx(N,{currency:e.source.selectedAsset,inputMode:"decimal",autoFocus:!0}),t.jsx(R,{selectedAsset:e.source.selectedAsset,onEditSourceAsset:u})]}),ce=({onClose:e,onAcceptTerms:i,onSelectAmount:u,onSelectSource:f,onEditSourceAsset:y,opts:d,state:r,email:h,isLoading:n})=>r.status==="select-amount"?t.jsx(le,{onClose:e,onSelectAmount:u,onEditSourceAsset:y,opts:d,isLoading:n}):r.status==="select-source-asset"?t.jsx(D,{onSelectSource:f,opts:d,isLoading:n}):r.status==="kyc-prompt"?t.jsx(ie,{onClose:e,onAcceptTerms:i,opts:d,isLoading:n}):r.status==="kyc-incomplete"?t.jsx(ae,{onClose:e,email:h}):r.status==="kyc-success"?t.jsx(ne,{onClose:e}):r.status==="kyc-error"?t.jsx(oe,{onClose:e,reason:r.reason}):r.status==="account-details"?t.jsx(Q,{onClose:e,data:r.data}):r.status==="create-customer-error"||r.status==="get-customer-error"?t.jsx(re,{onClose:e}):null,Ue={component:()=>{let{user:e}=B(),i=M().data;if(!i?.FundWithBankDepositScreen)throw Error("Missing data");let{onSuccess:u,onFailure:f,opts:y,createOrUpdateCustomer:d,getCustomer:r,getOrCreateVirtualAccount:h}=i.FundWithBankDepositScreen,[n,j]=m.useState(y),[v,s]=m.useState({status:"select-amount"}),[w,c]=m.useState(null),[U,a]=m.useState(!1),C=m.useRef(null),_=m.useCallback((async()=>{let o;a(!0),c(null);try{o=await r({kycRedirectUrl:window.location.origin})}catch(l){if(!l||typeof l!="object"||!("status"in l)||l.status!==404)return s({status:"get-customer-error"}),c(l),void a(!1)}if(!o)try{o=await d({hasAcceptedTerms:!1,kycRedirectUrl:window.location.origin})}catch(l){return s({status:"create-customer-error"}),c(l),void a(!1)}if(!o)return s({status:"create-customer-error"}),c(Error("Unable to create customer")),void a(!1);if(o.status==="not_started"&&o.kyc_url)return s({status:"kyc-prompt",kycUrl:o.kyc_url}),void a(!1);if(o.status==="not_started")return s({status:"get-customer-error"}),c(Error("Unexpected user state")),void a(!1);if(o.status==="rejected")return s({status:"kyc-error",reason:o.rejection_reasons?.[0]?.reason}),c(Error("User KYC rejected.")),void a(!1);if(o.status==="incomplete")return s({status:"kyc-incomplete"}),void a(!1);if(o.status!=="active")return s({status:"get-customer-error"}),c(Error("Unexpected user state")),void a(!1);o.status;try{let l=await h({destination:n.destination,provider:n.provider,source:{asset:n.source.selectedAsset}});s({status:"account-details",data:l})}catch(l){return s({status:"create-customer-error"}),c(l),void a(!1)}}),[n]),T=m.useCallback((async()=>{if(c(null),a(!0),v.status!=="kyc-prompt")return c(Error("Unexpected state")),void a(!1);let o=F({location:v.kycUrl});if(await d({hasAcceptedTerms:!0}),!o)return c(Error("Unable to begin kyc flow.")),a(!1),void s({status:"create-customer-error"});C.current=new AbortController;let l=await(async(p,I)=>{let x=await A({operation:async()=>({done:X(p)===window.location.origin,closed:p.closed}),until:({done:P,closed:W})=>P||W,delay:0,interval:500,attempts:360,signal:I});return x.status==="aborted"?(p.close(),{status:"aborted"}):x.status==="max_attempts"?{status:"timeout"}:x.result.done?(p.close(),{status:"redirected"}):{status:"closed"}})(o,C.current.signal);if(l.status==="aborted")return;if(l.status==="closed")return void a(!1);l.status;let g=await A({operation:()=>r({}),until:p=>p.status==="active"||p.status==="rejected",delay:0,interval:2e3,attempts:60,signal:C.current.signal});if(g.status!=="aborted"){if(g.status==="max_attempts")return s({status:"kyc-incomplete"}),void a(!1);if(g.status,g.result.status==="rejected")return s({status:"kyc-error",reason:g.result.rejection_reasons?.[0]?.reason}),c(Error("User KYC rejected.")),void a(!1);if(g.result.status!=="active")return s({status:"kyc-incomplete"}),void a(!1);o.closed||o.close(),g.result.status;try{s({status:"kyc-success"});let p=await h({destination:n.destination,provider:n.provider,source:{asset:n.source.selectedAsset}});s({status:"account-details",data:p})}catch(p){s({status:"create-customer-error"}),c(p)}finally{a(!1)}}}),[s,c,a,d,h,v,n,C]),L=m.useCallback((o=>{s({status:"select-amount"}),j({...n,source:{...n.source,selectedAsset:o}})}),[s,j]),$=m.useCallback((()=>{s({status:"select-source-asset"})}),[s]);return t.jsx(ce,{onClose:m.useCallback((async()=>{C.current?.abort(),w?f(w):await u()}),[w,C]),opts:n,state:v,isLoading:U,email:e.email.address,onAcceptTerms:T,onSelectAmount:_,onSelectSource:L,onEditSourceAsset:$})}};export{Ue as FundWithBankDepositScreen,Ue as default};
