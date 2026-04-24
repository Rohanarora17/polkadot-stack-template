import{r as y,j as e}from"./index-SWaW1Ukh.js";import{F as E}from"./ExclamationTriangleIcon-Ba4R12cj.js";import{F}from"./LockClosedIcon-Cmti6mwg.js";import{J as I,I as P,P as R,a6 as g,ay as w,D as U,y as W}from"./EmbeddedWalletProvider-B0T2InJj.js";import{T as x,k as v,u as j}from"./ModalHeader-ByY2wsBw-DVviRVLl.js";import{r as A}from"./Subtitle-CV-2yKE4-BkIAdctb.js";import{e as S}from"./Title-BnzYV3Is-aG_NY8eS.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-Bdptgswe.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";const M=W.div`
  && {
    border-width: 4px;
  }

  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  aspect-ratio: 1;
  border-style: solid;
  border-color: ${t=>t.$color??"var(--privy-color-accent)"};
  border-radius: 50%;
`,L={component:()=>{let{user:t}=I(),{client:$,walletProxy:m,refreshSessionAndUser:b,closePrivyModal:s}=P(),r=R(),{entropyId:u,entropyIdVerifier:T}=r.data?.recoverWallet,[a,f]=y.useState(!1),[i,k]=y.useState(null),[l,p]=y.useState(null);function n(){if(!a){if(l)return r.data?.setWalletPassword?.onFailure(l),void s();if(!i)return r.data?.setWalletPassword?.onFailure(Error("User exited set recovery flow")),void s()}}r.onUserCloseViaDialogOrKeybindRef.current=n;let C=!(!a&&!i);return e.jsxs(e.Fragment,l?{children:[e.jsx(x,{onClose:n},"header"),e.jsx(M,{$color:"var(--privy-color-error)",style:{alignSelf:"center"},children:e.jsx(E,{height:38,width:38,stroke:"var(--privy-color-error)"})}),e.jsx(S,{style:{marginTop:"0.5rem"},children:"Something went wrong"}),e.jsx(g,{style:{minHeight:"2rem"}}),e.jsx(v,{onClick:()=>p(null),children:"Try again"}),e.jsx(j,{})]}:{children:[e.jsx(x,{onClose:n},"header"),e.jsx(F,{style:{width:"3rem",height:"3rem",alignSelf:"center"}}),e.jsx(S,{style:{marginTop:"0.5rem"},children:"Automatically secure your account"}),e.jsx(A,{style:{marginTop:"1rem"},children:"When you log into a new device, you’ll only need to authenticate to access your account. Never get logged out if you forget your password."}),e.jsx(g,{style:{minHeight:"2rem"}}),e.jsx(v,{loading:a,disabled:C,onClick:()=>(async function(){f(!0);try{let o=await $.getAccessToken(),c=w(t,u);if(!o||!m||!c)return;if(!(await m.setRecovery({accessToken:o,entropyId:u,entropyIdVerifier:T,existingRecoveryMethod:c.recoveryMethod,recoveryMethod:"privy"})).entropyId)throw Error("Unable to set recovery on wallet");let d=await b();if(!d)throw Error("Unable to set recovery on wallet");let h=w(d,c.address);if(!h)throw Error("Unabled to set recovery on wallet");k(!!d),setTimeout((()=>{r.data?.setWalletPassword?.onSuccess(h),s()}),U)}catch(o){p(o)}finally{f(!1)}})(),children:i?"Success":"Confirm"}),e.jsx(j,{})]})}};export{L as SetAutomaticRecoveryScreen,L as default};
