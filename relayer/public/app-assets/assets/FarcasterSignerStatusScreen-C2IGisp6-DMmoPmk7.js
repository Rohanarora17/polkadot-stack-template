import{r as c,j as t}from"./index-CiCy0wPm.js";import{P as F,r as T,I,D as w,G as h,A as O,y as o}from"./EmbeddedWalletProvider-BjHMkXIO.js";import{h as q}from"./CopyToClipboard-DSTf_eKU-DrBf6jTj.js";import{n as B}from"./OpenLink-DZHy38vr-Dtj7wvQN.js";import{C as E}from"./QrCode-De3KTDSW-C7KNmxRW.js";import{n as A}from"./ScreenLayout-DGbEZh8t-pcdWInov.js";import{l as x}from"./farcaster-DPlSjvF5-CWteEY9c.js";import"./browser-CrI7x-3E.js";import"./hostApi-DoTpJ2AL.js";import"./events-CGNrK1KB.js";import"./privateKeyToAccount-CL3fkk98.js";import"./formatEther-C8NgF844.js";import"./index-C7ToLFr8.js";import"./ModalHeader-ByY2wsBw-CHkg0ykn.js";import"./Screen-17GDtJCX-D7pIcJvl.js";import"./index-Dq_xe9dz-CP37cUpk.js";import"./dijkstra-COg3n3zL.js";let S="#8a63d2";const M=({appName:p,loading:m,success:u,errorMessage:e,connectUri:a,onBack:r,onClose:l,onOpenFarcaster:s})=>t.jsx(A,h.isMobile||m?h.isIOS?{title:e?e.message:"Add a signer to Farcaster",subtitle:e?e.detail:`This will allow ${p} to add casts, likes, follows, and more on your behalf.`,icon:x,iconVariant:"loading",iconLoadingStatus:{success:u,fail:!!e},primaryCta:a&&s?{label:"Open Farcaster app",onClick:s}:void 0,onBack:r,onClose:l,watermark:!0}:{title:e?e.message:"Requesting signer from Farcaster",subtitle:e?e.detail:"This should only take a moment",icon:x,iconVariant:"loading",iconLoadingStatus:{success:u,fail:!!e},onBack:r,onClose:l,watermark:!0,children:a&&h.isMobile&&t.jsx(_,{children:t.jsx(B,{text:"Take me to Farcaster",url:a,color:S})})}:{title:"Add a signer to Farcaster",subtitle:`This will allow ${p} to add casts, likes, follows, and more on your behalf.`,onBack:r,onClose:l,watermark:!0,children:t.jsxs(P,{children:[t.jsx(R,{children:a?t.jsx(E,{url:a,size:275,squareLogoElement:x}):t.jsx(N,{children:t.jsx(O,{})})}),t.jsxs(D,{children:[t.jsx(L,{children:"Or copy this link and paste it into a phone browser to open the Farcaster app."}),a&&t.jsx(q,{text:a,itemName:"link",color:S})]})]})});let _=o.div`
  margin-top: 24px;
`,P=o.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
`,R=o.div`
  padding: 24px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 275px;
`,D=o.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
`,L=o.div`
  font-size: 0.875rem;
  text-align: center;
  color: var(--privy-color-foreground-2);
`,N=o.div`
  position: relative;
  width: 82px;
  height: 82px;
`;const se={component:()=>{let{lastScreen:p,navigateBack:m,data:u}=F(),e=T(),{requestFarcasterSignerStatus:a,closePrivyModal:r}=I(),[l,s]=c.useState(void 0),[k,v]=c.useState(!1),[j,y]=c.useState(!1),g=c.useRef([]),n=u?.farcasterSigner;c.useEffect((()=>{let b=Date.now(),i=setInterval((async()=>{if(!n?.public_key)return clearInterval(i),void s({retryable:!0,message:"Connect failed",detail:"Something went wrong. Please try again."});n.status==="approved"&&(clearInterval(i),v(!1),y(!0),g.current.push(setTimeout((()=>r({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w)));let d=await a(n?.public_key),C=Date.now()-b;d.status==="approved"?(clearInterval(i),v(!1),y(!0),g.current.push(setTimeout((()=>r({shouldCallAuthOnSuccess:!1,isSuccess:!0})),w))):C>3e5?(clearInterval(i),s({retryable:!0,message:"Connect failed",detail:"The request timed out. Try again."})):d.status==="revoked"&&(clearInterval(i),s({retryable:!0,message:"Request rejected",detail:"The request was rejected. Please try again."}))}),2e3);return()=>{clearInterval(i),g.current.forEach((d=>clearTimeout(d)))}}),[]);let f=n?.status==="pending_approval"?n.signer_approval_url:void 0;return t.jsx(M,{appName:e.name,loading:k,success:j,errorMessage:l,connectUri:f,onBack:p?m:void 0,onClose:r,onOpenFarcaster:()=>{f&&(window.location.href=f)}})}};export{se as FarcasterSignerStatusScreen,M as FarcasterSignerStatusView,se as default};
