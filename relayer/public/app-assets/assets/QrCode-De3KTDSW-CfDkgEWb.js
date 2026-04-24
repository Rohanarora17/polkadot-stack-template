import{j as t,G as m}from"./index-SWaW1Ukh.js";import{t as d}from"./browser-DkmWcLVJ.js";import{r as p,y as u,U as f,$ as C}from"./EmbeddedWalletProvider-B0T2InJj.js";const $=()=>t.jsx("svg",{width:"200",height:"200",viewBox:"-77 -77 200 200",fill:"none",xmlns:"http://www.w3.org/2000/svg",style:{height:"28px",width:"28px"},children:t.jsx("rect",{width:"50",height:"50",fill:"black",rx:10,ry:10})});let x=(e,r,o,l,g)=>{for(let i=r;i<r+l;i++)for(let n=o;n<o+g;n++){let s=e?.[n];s&&s[i]&&(s[i]=0)}return e},z=(e,r)=>{let o=d.create(e,{errorCorrectionLevel:r}).modules,l=f(Array.from(o.data),o.size);return l=x(l,0,0,7,7),l=x(l,l.length-7,0,7,7),x(l,0,l.length-7,7,7)},j=({x:e,y:r,cellSize:o,bgColor:l,fgColor:g})=>t.jsx(t.Fragment,{children:[0,1,2].map((i=>t.jsx("circle",{r:o*(7-2*i)/2,cx:e+7*o/2,cy:r+7*o/2,fill:i%2!=0?l:g},`finder-${e}-${r}-${i}`)))}),b=({cellSize:e,matrixSize:r,bgColor:o,fgColor:l})=>t.jsx(t.Fragment,{children:[[0,0],[(r-7)*e,0],[0,(r-7)*e]].map((([g,i])=>t.jsx(j,{x:g,y:i,cellSize:e,bgColor:o,fgColor:l},`finder-${g}-${i}`)))}),S=({matrix:e,cellSize:r,color:o})=>t.jsx(t.Fragment,{children:e.map(((l,g)=>l.map(((i,n)=>i?t.jsx("rect",{height:r-.4,width:r-.4,x:g*r+.1*r,y:n*r+.1*r,rx:.5*r,ry:.5*r,fill:o},`cell-${g}-${n}`):t.jsx(m.Fragment,{},`circle-${g}-${n}`)))))}),w=({cellSize:e,matrixSize:r,element:o,sizePercentage:l,bgColor:g})=>{if(!o)return t.jsx(t.Fragment,{});let i=r*(l||.14),n=Math.floor(r/2-i/2),s=Math.floor(r/2+i/2);(s-n)%2!=r%2&&(s+=1);let a=(s-n)*e,h=a-.2*a,c=n*e;return t.jsxs(t.Fragment,{children:[t.jsx("rect",{x:n*e,y:n*e,width:a,height:a,fill:g}),t.jsx(o,{x:c+.1*a,y:c+.1*a,height:h,width:h})]})},y=e=>{let r=e.outputSize,o=z(e.url,e.errorCorrectionLevel),l=r/o.length,g=C(2*l,{min:.025*r,max:.036*r});return t.jsxs("svg",{height:e.outputSize,width:e.outputSize,viewBox:`0 0 ${e.outputSize} ${e.outputSize}`,style:{height:"100%",width:"100%",padding:`${g}px`},children:[t.jsx(S,{matrix:o,cellSize:l,color:e.fgColor}),t.jsx(b,{cellSize:l,matrixSize:o.length,fgColor:e.fgColor,bgColor:e.bgColor}),t.jsx(w,{cellSize:l,element:e.logo?.element,bgColor:e.bgColor,matrixSize:o.length})]})},v=u.div.attrs({className:"ph-no-capture"})`
  display: flex;
  justify-content: center;
  align-items: center;
  height: ${e=>`${e.$size}px`};
  width: ${e=>`${e.$size}px`};
  margin: auto;
  background-color: ${e=>e.$bgColor};

  && {
    border-width: 2px;
    border-color: ${e=>e.$borderColor};
    border-radius: var(--privy-border-radius-md);
  }
`;const B=e=>{let{appearance:r}=p(),o=e.bgColor||"#FFFFFF",l=e.fgColor||"#000000",g=e.size||160,i=r.palette.colorScheme==="dark"?o:l;return t.jsx(v,{$size:g,$bgColor:o,$fgColor:l,$borderColor:i,children:t.jsx(y,{url:e.url,logo:{element:e.squareLogoElement??$},outputSize:g,bgColor:o,fgColor:l,errorCorrectionLevel:e.errorCorrectionLevel||"Q"})})};export{B as C};
