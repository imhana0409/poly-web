import React, { useState, useRef, useEffect } from 'react';
import Login from "@components/login";
import { supabase } from "@supabase/client";
import Image from 'next/image';
import { UserData } from "../pages/_app";


interface Props {
  user: UserData | undefined,
}

export default function Header({ user }: Props) {
  const [isOpenLoginCP, setIsOpenLoginCp] = useState(false);
  const [isClickUserName, setIsClickUserName] = useState(false);
  const userBoxRef = useRef<HTMLElement>(null) as React.MutableRefObject<HTMLDivElement>;;


  const closeLoginBox = (): void => {
    setIsOpenLoginCp(false)
  }

  useEffect(() => {


    function handleClickOutside(event: React.BaseSyntheticEvent | MouseEvent) {
      if (userBoxRef.current && !userBoxRef.current.contains(event.target)) {
        setIsClickUserName(false)
      }
    }

    document.addEventListener('click', handleClickOutside, true)

    return () => {
      document.removeEventListener('click', handleClickOutside, true)
    }
  }, [])


  const logOut = async () => {
    await supabase.auth.signOut()
  }

  const clickUserNameBox = () => {
    setIsClickUserName(!isClickUserName)
  }

  return (
    <div className={'relative'}>
      <div className={'flex justify-between bg-header-gray w-full h-12  pl-10 pr-8 md:pr-6 items-center text-amber-50'}>
        <div className={'text-3xl'}>POLY</div>
        <div className={'flex justify-between items-center space-x-5'}>
          <button className={'border bg-white text-black py-1.5 pr-3 pl-2 text-[10px] font-extrabold rounded flex justify-between items-center'}>
            <Image src='/upload1.png' width={'10px'} height={'10px'} alt='uploadPng' />
            <p className={'ml-1'}>UPLOAD</p></button>
          {user !== undefined ?
            <div onClick={clickUserNameBox} ref={userBoxRef} className={'flex justify-between items-center space-x-2 cursor-pointer'}>
              <div><p>{user.name}</p></div>
              <svg className={`rotate-${isClickUserName ? '0' : '180'}`} width="9" height="7" viewBox="0 0 9 7" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4.50387 7L8.52387 0.0299997H0.473867L4.50387 7Z" fill="white" />
              </svg>
              {/* <button className={'border-2 px-2 rounded'} onClick={logOut}>log out</button> */}
            </div>
            :
            <div className={'cursor-pointer'} onClick={() => setIsOpenLoginCp(!isOpenLoginCP)}>LOGIN</div>}
        </div>
      </div>
      {isOpenLoginCP && <Login closeLoginBox={closeLoginBox} />}
    </div>
  )
}