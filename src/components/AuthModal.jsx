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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#181818] p-8 shadow-2xl relative">
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/50 hover:text-white"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        
        <h2 className="text-2xl font-black text-white mb-6 text-center">
          {isLogin ? 'Вход в аккаунт' : 'Регистрация'}
        </h2>
        
        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/50 text-red-200 text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Имя пользователя</label>
            <input 
              type="text"
              required
              value={usernameInput}
              onChange={e => setUsernameInput(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[var(--player-accent)] focus:ring-1 focus:ring-[var(--player-accent)] transition"
              placeholder="Введите логин"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Пароль</label>
            <input 
              type="password"
              required
              value={passwordInput}
              onChange={e => setPasswordInput(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-4 py-2.5 text-white placeholder-white/30 focus:outline-none focus:border-[var(--player-accent)] focus:ring-1 focus:ring-[var(--player-accent)] transition"
              placeholder="Введите пароль"
            />
          </div>

          <button 
            type="submit"
            disabled={loading}
            className="w-full mt-6 rounded-full bg-[var(--player-accent)] py-3 text-sm font-bold text-white shadow-lg shadow-[var(--player-accent-muted)] transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100"
          >
            {loading ? 'Загрузка...' : (isLogin ? 'Войти' : 'Зарегистрироваться')}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-white/50">
          {isLogin ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
          <button 
            type="button"
            onClick={() => setIsLogin(!isLogin)}
            className="text-[var(--player-accent)] hover:underline font-semibold"
          >
            {isLogin ? 'Создать' : 'Войти'}
          </button>
        </div>
      </div>
    </div>
  );
}
