"use client";

import {useEffect,useMemo,useRef,useState} from "react";
import {createPortal} from "react-dom";

type Props={value:string;products:string[];placeholder:string;onChange:(value:string)=>void;suggestionsLabel?:string;createLabel?:string;maxLength?:number;name?:string};
const normalize=(value:string)=>value.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("fr").trim();

export function ProductAutocomplete({value,products,placeholder,onChange,suggestionsLabel="Produits déjà enregistrés",createLabel="Créer ce nouveau produit",maxLength=180,name}:Props){
  const rootRef=useRef<HTMLDivElement>(null);
  const inputRef=useRef<HTMLInputElement>(null);
  const menuRef=useRef<HTMLDivElement>(null);
  const[open,setOpen]=useState(false);
  const[activeIndex,setActiveIndex]=useState(-1);
  const[position,setPosition]=useState({top:0,left:0,width:0});
  const query=normalize(value);
  const suggestions=useMemo(()=>products.filter(product=>!query||normalize(product).includes(query)).slice(0,7),[products,query]);
  const exactMatch=products.some(product=>normalize(product)===query);

  useEffect(()=>{
    const close=(event:PointerEvent)=>{
      const target=event.target as Node;
      if(!rootRef.current?.contains(target)&&!menuRef.current?.contains(target)){setOpen(false);setActiveIndex(-1)}
    };
    document.addEventListener("pointerdown",close);
    return()=>document.removeEventListener("pointerdown",close);
  },[]);

  useEffect(()=>{
    if(!open)return;
    const place=()=>{
      const rect=rootRef.current?.getBoundingClientRect();
      if(rect)setPosition({top:rect.bottom-1,left:rect.left,width:rect.width});
    };
    place();
    window.addEventListener("resize",place);
    window.addEventListener("scroll",place,true);
    return()=>{window.removeEventListener("resize",place);window.removeEventListener("scroll",place,true)};
  },[open]);

  const select=(product:string)=>{onChange(product);setOpen(false);setActiveIndex(-1);inputRef.current?.focus()};

  return <div className={`purchaseProductAutocomplete${open?" open":""}`} ref={rootRef}>
    <div className="purchaseProductInput">
      <input ref={inputRef} name={name} required maxLength={maxLength} autoComplete="off" value={value} placeholder={placeholder}
        aria-autocomplete="list" aria-expanded={open}
        onFocus={()=>setOpen(true)}
        onChange={event=>{onChange(event.target.value);setOpen(true);setActiveIndex(-1)}}
        onKeyDown={event=>{
          if(event.key==="ArrowDown"){event.preventDefault();setOpen(true);setActiveIndex(index=>Math.min(index+1,suggestions.length-1))}
          if(event.key==="ArrowUp"){event.preventDefault();setActiveIndex(index=>Math.max(index-1,0))}
          if(event.key==="Enter"&&open&&activeIndex>=0&&suggestions[activeIndex]){event.preventDefault();select(suggestions[activeIndex])}
          if(event.key==="Escape"){setOpen(false);setActiveIndex(-1)}
        }}/>
      <button type="button" tabIndex={-1} aria-label="Afficher les produits existants" onClick={()=>{setOpen(current=>!current);inputRef.current?.focus()}}><i/></button>
    </div>
    {open&&createPortal(<div ref={menuRef} className="purchaseProductSuggestions purchaseProductSuggestionsPortal" role="listbox" style={{top:position.top,left:position.left,width:position.width}}>
      <div className="purchaseProductSuggestionsTitle">{suggestionsLabel}</div>
      {suggestions.length?suggestions.map((product,index)=><button type="button" role="option" aria-selected={index===activeIndex}
        className={index===activeIndex?"active":""} key={product} onMouseDown={event=>event.preventDefault()}
        onMouseEnter={()=>setActiveIndex(index)} onClick={()=>select(product)}><span>{product}</span><small>Utiliser</small></button>):<p>Aucun produit correspondant</p>}
      {value.trim()&&!exactMatch&&<div className="purchaseProductNew"><span>+</span><p><b>{createLabel}</b><small>{value.trim()}</small></p></div>}
    </div>,document.body)}
  </div>;
}
