"use client";
import {useEffect,useRef,type KeyboardEvent,type MouseEvent,type ReactNode} from "react";

type Direction="asc"|"desc"|"normal";
function numericValue(text:string):number|null{const match=text.replace(/[\u00a0\u202f]/g," ").match(/[-+]?\s*\d[\d ]*(?:[,.]\d+)?/);if(!match)return null;const value=Number(match[0].replace(/\s/g,"").replace(",","."));return Number.isFinite(value)?value:null;}

export function SortableTable({className,children}:{className:string;children:ReactNode}){
  const root=useRef<HTMLDivElement>(null);
  useEffect(()=>{root.current?.querySelectorAll<HTMLTableCellElement>("thead th").forEach(header=>{if(header.textContent?.trim()){header.tabIndex=0;header.setAttribute("role","button");header.setAttribute("aria-sort","none");header.title="Trier cette colonne";}});},[]);
  const sort=(header:HTMLTableCellElement)=>{if(!header.textContent?.trim())return;const table=header.closest("table"),body=table?.tBodies[0];if(!table||!body)return;const headers=[...header.parentElement!.children] as HTMLTableCellElement[];const column=headers.indexOf(header);const current=(header.dataset.sortDirection as Direction|undefined)??"normal";const next:Direction=current==="normal"?"asc":current==="asc"?"desc":"normal";headers.forEach(item=>{delete item.dataset.sortDirection;item.setAttribute("aria-sort","none");});const rows=[...body.rows].filter(row=>!row.classList.contains("portfolioTotalRow"));rows.forEach((row,index)=>{if(!row.dataset.originalOrder)row.dataset.originalOrder=String(index);});if(next!=="normal"){header.dataset.sortDirection=next;header.setAttribute("aria-sort",next==="asc"?"ascending":"descending");const textColumn=column===0||/code/i.test(header.textContent??"");rows.sort((a,b)=>{const left=a.cells[column]?.textContent?.trim()??"",right=b.cells[column]?.textContent?.trim()??"";let result:number;if(textColumn)result=left.localeCompare(right,"fr",{sensitivity:"base"});else{const l=numericValue(left),r=numericValue(right);result=l===null&&r===null?0:l===null?1:r===null?-1:l-r;}return next==="asc"?result:-result;});}else rows.sort((a,b)=>Number(a.dataset.originalOrder)-Number(b.dataset.originalOrder));rows.forEach(row=>body.insertBefore(row,body.querySelector(".portfolioTotalRow")));};
  const headerFrom=(target:EventTarget|null)=>target instanceof Element?target.closest<HTMLTableCellElement>("thead th"):null;
  const click=(event:MouseEvent<HTMLDivElement>)=>{const header=headerFrom(event.target);if(header&&root.current?.contains(header))sort(header);};
  const key=(event:KeyboardEvent<HTMLDivElement>)=>{if(event.key!=="Enter"&&event.key!==" ")return;const header=headerFrom(event.target);if(header&&root.current?.contains(header)){event.preventDefault();sort(header);}};
  return <div ref={root} className={className} onClick={click} onKeyDown={key}>{children}</div>;
}
