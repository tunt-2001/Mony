import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { IconChart } from './Icons';

// Email + password. The single account is created in the Supabase dashboard
// (Authentication → Users → Add user) and public sign-up stays disabled.
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError(error.message === 'Invalid login credentials' ? 'Sai email hoặc mật khẩu' : error.message);
  }

  return (
    <main className="login-page">
      <div className="login-hero">
        <div className="login-logo">
          <IconChart size={30} />
        </div>
        <h1>Chi tiêu</h1>
        <p>Tiền nhận và tiền chi, tự ghi từ SMS ngân hàng</p>
      </div>

      <form className="login-card" onSubmit={signIn}>
        <h2>Đăng nhập</h2>
        <label>
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            placeholder="ban@email.com"
          />
        </label>
        <label>
          Mật khẩu
          <span className="password">
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="link" onClick={() => setShowPassword(!showPassword)}>
              {showPassword ? 'Ẩn' : 'Hiện'}
            </button>
          </span>
        </label>
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <button className="primary login-submit" disabled={busy}>
          {busy ? 'Đang đăng nhập…' : 'Đăng nhập'}
        </button>
        <p className="login-note">Tài khoản được tạo trong Supabase → Authentication → Users.</p>
      </form>
    </main>
  );
}
