import{r as m,j as e}from"./index-DRyq2Hq5.js";import{y as r}from"./EmbeddedWalletProvider-CamoBLTb.js";import{$ as d}from"./ModalHeader-ByY2wsBw-B3a4ZPGb.js";import{e as f}from"./ErrorMessage-D8VaAP5m-CeQVO9jB.js";import{r as x}from"./LabelXs-oqZNqbm_-CXunl_P4.js";import{p as h}from"./Address-CYbJNMNd-CswYn9p9.js";import{d as j}from"./shared-FM0rljBt-CV8sGWm6.js";import{C as g}from"./check-CKy_ZlDk.js";import{C as u}from"./copy-DgiqTkh6.js";let y=r(j)`
  && {
    padding: 0.75rem;
    height: 56px;
  }
`,v=r.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
`,C=r.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`,z=r.div`
  font-size: 12px;
  line-height: 1rem;
  color: var(--privy-color-foreground-3);
`,b=r(x)`
  text-align: left;
  margin-bottom: 0.5rem;
`,w=r(f)`
  margin-top: 0.25rem;
`,E=r(d)`
  && {
    gap: 0.375rem;
    font-size: 14px;
  }
`;const S=({errMsg:t,balance:s,address:a,className:c,title:n,showCopyButton:p=!1})=>{let[o,l]=m.useState(!1);return m.useEffect((()=>{if(o){let i=setTimeout((()=>l(!1)),3e3);return()=>clearTimeout(i)}}),[o]),e.jsxs("div",{children:[n&&e.jsx(b,{children:n}),e.jsx(y,{className:c,$state:t?"error":void 0,children:e.jsxs(v,{children:[e.jsxs(C,{children:[e.jsx(h,{address:a,showCopyIcon:!1}),s!==void 0&&e.jsx(z,{children:s})]}),p&&e.jsx(E,{onClick:function(i){i.stopPropagation(),navigator.clipboard.writeText(a).then((()=>l(!0))).catch(console.error)},size:"sm",children:e.jsxs(e.Fragment,o?{children:["Copied",e.jsx(g,{size:14})]}:{children:["Copy",e.jsx(u,{size:14})]})})]})}),t&&e.jsx(w,{children:t})]})};export{S as j};
