import{r as a,j as e}from"https://bafybeidkcgg67fl5mea5csvoarnpow624tnzw54iglnvmjyzw7cy75bkxe.app.dot.li/assets/index-DRyq2Hq5.js";import{F as I}from"./ShieldCheckIcon--nmq5hpx.js";import{J as T,I as _,P as E,ay as F,az as U,ah as W,y as h,g as N}from"./EmbeddedWalletProvider-CamoBLTb.js";import{m as O}from"./ModalHeader-ByY2wsBw-B3a4ZPGb.js";import{l as V}from"./Layouts-BlFm53ED-DM0mT-Ag.js";import{g as z,h as H,u as M,b as B,k as D}from"./shared-DkB_Ojl5-CNGWlUSS.js";import{w as s}from"./Screen-17GDtJCX-B9K4aUfQ.js";import"./hostApi-B7Whi15c.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-YHjPAZcu.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./index-Dq_xe9dz-2dgfB1sU.js";const ne={component:()=>{let[o,p]=a.useState(!0),{authenticated:u,user:g}=T(),{walletProxy:m,closePrivyModal:y,createAnalyticsEvent:v,client:j}=_(),{navigate:b,data:k,onUserCloseViaDialogOrKeybindRef:A}=E(),[n,C]=a.useState(void 0),[x,l]=a.useState(""),[d,f]=a.useState(!1),{entropyId:c,entropyIdVerifier:S,onCompleteNavigateTo:w,onSuccess:$,onFailure:P}=k.recoverWallet,i=(r="User exited before their wallet could be recovered")=>{y({shouldCallAuthOnSuccess:!1}),P(typeof r=="string"?new W(r):r)};return A.current=i,a.useEffect((()=>{if(!u)return i("User must be authenticated and have a Privy wallet before it can be recovered")}),[u]),e.jsxs(s,{children:[e.jsx(s.Header,{icon:I,title:"Enter your password",subtitle:"Please provision your account on this new device. To continue, enter your recovery password.",showClose:!0,onClose:i}),e.jsx(s.Body,{children:e.jsx(J,{children:e.jsxs("div",{children:[e.jsxs(z,{children:[e.jsx(H,{type:o?"password":"text",onChange:r=>(t=>{t&&C(t)})(r.target.value),disabled:d,style:{paddingRight:"2.3rem"}}),e.jsx(M,{style:{right:"0.75rem"},children:o?e.jsx(B,{onClick:()=>p(!1)}):e.jsx(D,{onClick:()=>p(!0)})})]}),!!x&&e.jsx(K,{children:x})]})})}),e.jsxs(s.Footer,{children:[e.jsx(s.HelpText,{children:e.jsxs(V,{children:[e.jsx("h4",{children:"Why is this necessary?"}),e.jsx("p",{children:"You previously set a password for this wallet. This helps ensure only you can access it"})]})}),e.jsx(s.Actions,{children:e.jsx(L,{loading:d||!m,disabled:!n,onClick:async()=>{f(!0);let r=await j.getAccessToken(),t=F(g,c);if(!r||!t||n===null)return i("User must be authenticated and have a Privy wallet before it can be recovered");try{v({eventName:"embedded_wallet_recovery_started",payload:{walletAddress:t.address}}),await m?.recover({accessToken:r,entropyId:c,entropyIdVerifier:S,recoveryPassword:n}),l(""),w?b(w):y({shouldCallAuthOnSuccess:!1}),$?.(t),v({eventName:"embedded_wallet_recovery_completed",payload:{walletAddress:t.address}})}catch(R){U(R)?l("Invalid recovery password, please try again."):l("An error has occurred, please try again.")}finally{f(!1)}},$hideAnimations:!c&&d,children:"Recover your account"})}),e.jsx(s.Watermark,{})]})]})}};let J=h.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`,K=h.div`
  line-height: 20px;
  height: 20px;
  font-size: 13px;
  color: var(--privy-color-error);
  text-align: left;
  margin-top: 0.5rem;
`,L=h(O)`
  ${({$hideAnimations:o})=>o&&N`
      && {
        // Remove animations because the recoverWallet task on the iframe partially
        // blocks the renderer, so the animation stutters and doesn't look good
        transition: none;
      }
    `}
`;export{ne as PasswordRecoveryScreen,ne as default};
