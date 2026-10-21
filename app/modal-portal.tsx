"use client";
import type {ReactNode} from "react";
import {useEffect,useState} from "react";
import {createPortal} from "react-dom";

export function ModalPortal({children}:{children:ReactNode}){
  const[mounted,setMounted]=useState(false);
  useEffect(()=>setMounted(true),[]);
  return mounted?createPortal(children,document.body):null;
}
