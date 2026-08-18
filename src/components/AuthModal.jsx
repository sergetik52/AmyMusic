import React, { useState } from 'react';
import { register, login, setAuthToken, setUsername } from '../api';

export default function AuthModal({ onClose, onLoginSuccess }) {
  const [isLogin, setIsLogin] = useState(true);
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const action = isLogin ? login : register;
      const data = await action(usernameInput, passwordInput);
      setAuthToken(data.token);
      setUsername(data.username);
      onLoginSuccess(data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
      <div 
        className="relative w-full max-w-sm flex-col overflow-hidden rounded-[24px] border border-white/[0.04] bg-[#090909] text-white shadow-2xl animate-[slideDownFade_0.4s_ease-out_forwards]"
      >
        <div className="absolute inset-0 opacity-30 blur-[60px]">
          <div className="h-full w-full bg-[#8341EF]" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-[#090909]/80 to-[#090909]" />

        <div className="relative z-10 p-8 flex flex-col items-center">
          <button 
            onClick={onClose}
            className="absolute top-5 right-5 text-white/40 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          <div className="mb-6 flex items-center justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#8341EF] to-[#511bb5] shadow-[0_0_40px_rgba(131,65,239,0.5)]">
              <img src="/logo.png" alt="Logo" className="h-10 w-10 object-cover" />
            </div>
          </div>
          
          <h2 className="text-2xl font-black text-white mb-2 text-center tracking-tight">
            {isLogin ? 'С возвращением' : 'Создать аккаунт'}
          </h2>
          <p className="text-sm text-white/40 text-center mb-8 font-medium">
            {isLogin ? 'Войдите, чтобы слушать музыку с любого устройства' : 'Зарегистрируйтесь для синхронизации музыки'}
          </p>
          
          {error && (
            <div className="mb-6 w-full rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-red-400 text-xs font-semibold text-center backdrop-blur-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="w-full space-y-4">
            <div className="space-y-1.5">
              <label className="pl-1 text-xs font-bold uppercase tracking-wider text-white/50">Логин</label>
              <input 
                type="text"
                required
                value={usernameInput}
                onChange={e => setUsernameInput(e.target.value)}
                className="w-full rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:outline-none focus:border-[#8341EF]/50 focus:bg-white/[0.05] transition-all duration-300"
                placeholder="Ваш никнейм"
              />
            </div>
            
            <div className="space-y-1.5">
              <label className="pl-1 text-xs font-bold uppercase tracking-wider text-white/50">Пароль</label>
              <input 
                type="password"
                required
                value={passwordInput}
                onChange={e => setPasswordInput(e.target.value)}
                className="w-full rounded-xl bg-white/[0.03] border border-white/5 px-4 py-3.5 text-sm font-medium text-white placeholder-white/20 focus:outline-none focus:border-[#8341EF]/50 focus:bg-white/[0.05] transition-all duration-300"
                placeholder="••••••••"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="group relative w-full mt-8 overflow-hidden rounded-xl bg-[#8341EF] py-4 text-sm font-black text-white shadow-[0_0_20px_rgba(131,65,239,0.3)] transition-all duration-300 hover:scale-[1.02] hover:shadow-[0_0_30px_rgba(131,65,239,0.5)] disabled:opacity-50 disabled:hover:scale-100"
            >
              <div className="absolute inset-0 flex h-full w-full justify-center [transform:skew(-12deg)_translateX(-150%)] group-hover:duration-1000 group-hover:[transform:skew(-12deg)_translateX(150%)]">
                <div className="relative h-full w-8 bg-white/20" />
              </div>
              {loading ? 'Загрузка...' : (isLogin ? 'Войти в облако' : 'Зарегистрироваться')}
            </button>
          </form>

          <div className="mt-8 text-center text-xs font-semibold text-white/40">
            {isLogin ? 'Впервые у нас? ' : 'Уже есть профиль? '}
            <button 
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-[#8341EF] hover:text-[#9E7DFF] hover:underline transition-colors ml-1"
            >
              {isLogin ? 'Создать' : 'Войти'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
