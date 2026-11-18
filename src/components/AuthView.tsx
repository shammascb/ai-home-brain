import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Home,
  Lock,
  Mail,
  Moon,
  Sun,
  User as UserIcon,
} from 'lucide-react';
import {
  formatAuthError,
  registerWithEmail,
  sendResetPassword,
  signInWithEmail,
  signInWithGooglePopup,
} from '../lib/firebase';

interface AuthViewProps {
  isDarkMode: boolean;
  onToggleTheme: () => void;
}

type AuthMode = 'signIn' | 'register' | 'resetPassword';

export const AuthView: React.FC<AuthViewProps> = ({
  isDarkMode,
  onToggleTheme,
}) => {
  const [mode, setMode] = useState<AuthMode>('signIn');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ text: string; isError: boolean } | null>(
    null,
  );

  const busy = isSubmitting || isGoogleSubmitting;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setNotice(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleGoogleSignIn = async () => {
    setIsGoogleSubmitting(true);
    setNotice(null);
    try {
      await signInWithGooglePopup();
    } catch (err) {
      setNotice({ text: formatAuthError(err), isError: true });
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setNotice({ text: 'Enter your email address.', isError: true });
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmedEmail)) {
      setNotice({ text: 'Enter a valid email address.', isError: true });
      return;
    }

    if (mode === 'register') {
      if (!displayName.trim()) {
        setNotice({ text: 'Enter your name.', isError: true });
        return;
      }
      if (displayName.trim().length < 2) {
        setNotice({
          text: 'Name must be at least 2 characters.',
          isError: true,
        });
        return;
      }
      if (password.length < 8) {
        setNotice({ text: 'Use at least 8 characters.', isError: true });
        return;
      }
      if (confirmPassword !== password) {
        setNotice({ text: 'Passwords do not match.', isError: true });
        return;
      }
    } else if (mode === 'signIn' && !password) {
      setNotice({ text: 'Enter your password.', isError: true });
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === 'signIn') {
        await signInWithEmail(trimmedEmail, password);
      } else if (mode === 'register') {
        await registerWithEmail(displayName.trim(), trimmedEmail, password);
      } else {
        await sendResetPassword(trimmedEmail);
        setMode('signIn');
        setNotice({
          text: 'If an account exists for that email, a reset link was sent.',
          isError: false,
        });
      }
    } catch (err) {
      setNotice({ text: formatAuthError(err), isError: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const title =
    mode === 'signIn'
      ? 'Welcome Back!'
      : mode === 'register'
        ? 'Create Account'
        : 'Reset Password';

  const subtitle =
    mode === 'register'
      ? 'Create a secure account to access your home.'
      : mode === 'resetPassword'
        ? 'We’ll email you a secure password reset link.'
        : 'Sign in with Google or your email and password to continue.';

  const submitLabel =
    mode === 'signIn'
      ? 'Sign in'
      : mode === 'register'
        ? 'Create account'
        : 'Send reset link';

  // Generate dot matrix points matching _AuthBackdropPainter
  const dots: Array<{ x: number; y: number }> = [];
  for (let gx = 9; gx < 38; gx += 2) {
    for (let gy = 8; gy < 19; gy += 1.6) {
      dots.push({ x: gx, y: gy });
    }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#E9E8F2] flex flex-col">
      {/* Custom Paint Backdrop matching _AuthBackdropPainter */}
      <svg
        className="pointer-events-none fixed inset-0 w-full h-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <circle cx="103" cy="8" r="22" fill="rgba(255,255,255,0.7)" />
        <circle cx="-7" cy="82" r="20" fill="rgba(255,255,255,0.7)" />
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r="0.22"
            fill="rgba(105,87,255,0.34)"
          />
        ))}
        {Array.from({ length: 24 }).map((_, idx) => {
          const offset = (idx - 12) * 2.5;
          return (
            <line
              key={idx}
              x1={62 + offset}
              y1={90}
              x2={78 + offset}
              y2={78}
              stroke="rgba(183,182,197,0.5)"
              strokeWidth="0.18"
            />
          );
        })}
      </svg>

      {/* Top-right theme toggle button */}
      <div className="relative z-10 flex justify-end px-5 pt-3">
        <button
          type="button"
          onClick={onToggleTheme}
          title={isDarkMode ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label="Toggle color theme"
          className="w-10 h-10 rounded-full bg-white/80 text-[#11111B] flex items-center justify-center hover:bg-white transition shadow-xs"
        >
          {isDarkMode ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Centered dark card */}
      <main className="relative z-10 flex-1 flex items-center justify-center px-[22px] pt-2 pb-7">
        <div
          className="relative w-full max-w-[430px] rounded-[28px] bg-[#11111B] overflow-hidden border"
          style={{
            borderColor: 'rgba(105, 87, 255, 0.32)',
            boxShadow: '0 20px 38px rgba(105, 87, 255, 0.16)',
          }}
        >
          {/* Decorative purple glow circles inside card */}
          <div
            className="pointer-events-none absolute -top-[54px] -right-[42px] w-[150px] h-[150px] rounded-full"
            style={{ backgroundColor: 'rgba(105, 87, 255, 0.12)' }}
          />
          <div
            className="pointer-events-none absolute -bottom-[72px] right-[12px] w-[190px] h-[130px] rounded-full"
            style={{ backgroundColor: 'rgba(105, 87, 255, 0.08)' }}
          />

          <div className="relative p-[26px] flex flex-col">
            {/* Brand Header */}
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#6957FF] flex items-center justify-center shrink-0">
                <Home className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white text-[16px] font-bold leading-tight">
                  AI Home Brain
                </div>
                <div
                  className="text-[9px] font-semibold tracking-[1.2px] mt-[3px]"
                  style={{ color: 'rgba(170, 169, 186, 0.8)' }}
                >
                  SMART HOME ASSISTANT
                </div>
              </div>
            </div>

            <div className="mt-[26px]">
              <h1 className="text-white text-[27px] font-bold leading-[1.1]">
                {title}
              </h1>
              <p className="mt-2 text-[#AAA9BA] text-[12px] leading-[1.5]">
                {subtitle}
              </p>
            </div>

            {mode !== 'resetPassword' && (
              <div className="mt-5 space-y-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleGoogleSignIn}
                  className="w-full py-[14px] px-4 rounded-[14px] bg-white text-[#11111B] text-[13px] font-bold flex items-center justify-center gap-2.5 hover:bg-neutral-100 transition disabled:opacity-50"
                >
                  {isGoogleSubmitting ? (
                    <span className="w-[18px] h-[18px] rounded-full border-2 border-[#11111B] border-t-transparent animate-spin" />
                  ) : (
                    <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        fill="#EA4335"
                        d="M12 10.2v3.9h5.5c-.2 1.3-1.5 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.8 9.1-9.2 0-.6-.1-1.1-.2-1.6H12z"
                      />
                    </svg>
                  )}
                  <span>Continue with Google</span>
                </button>

                <div className="flex items-center gap-3">
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                  />
                  <span className="text-[#AAA9BA] text-[11px]">
                    or with email
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)' }}
                  />
                </div>
              </div>
            )}

            {notice && (
              <div
                role="alert"
                className="mt-4 rounded-[14px] p-[14px] text-xs border flex items-start gap-2"
                style={{
                  backgroundColor: notice.isError
                    ? 'rgba(255, 119, 119, 0.1)'
                    : 'rgba(105, 87, 255, 0.12)',
                  borderColor: notice.isError
                    ? 'rgba(255, 119, 119, 0.35)'
                    : 'rgba(105, 87, 255, 0.4)',
                  color: notice.isError ? '#FF8E8E' : '#B7ADFF',
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{notice.text}</span>
              </div>
            )}

            <form
              onSubmit={handleSubmit}
              className={mode !== 'resetPassword' ? 'mt-4' : 'mt-5'}
            >
              <div className="space-y-[13px]">
                {mode === 'register' && (
                  <div className="relative">
                    <UserIcon className="w-[19px] h-[19px] text-[#AAA9BA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Full name"
                      aria-label="Full name"
                      maxLength={100}
                      className="w-full bg-[#1E1E2A] text-white text-[14px] pl-11 pr-4 py-[14px] rounded-[14px] border border-white/8 placeholder:text-[#AAA9BA] focus:outline-none focus:border-[#6957FF] focus:border-[1.4px]"
                    />
                  </div>
                )}

                <div className="relative">
                  <Mail className="w-[19px] h-[19px] text-[#AAA9BA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Email"
                    maxLength={254}
                    className="w-full bg-[#1E1E2A] text-white text-[14px] pl-11 pr-4 py-[14px] rounded-[14px] border border-white/8 placeholder:text-[#AAA9BA] focus:outline-none focus:border-[#6957FF] focus:border-[1.4px]"
                  />
                </div>

                {mode !== 'resetPassword' && (
                  <div className="relative">
                    <Lock className="w-[19px] h-[19px] text-[#AAA9BA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={passwordVisible ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      aria-label="Password"
                      className="w-full bg-[#1E1E2A] text-white text-[14px] pl-11 pr-11 py-[14px] rounded-[14px] border border-white/8 placeholder:text-[#AAA9BA] focus:outline-none focus:border-[#6957FF] focus:border-[1.4px]"
                    />
                    <button
                      type="button"
                      onClick={() => setPasswordVisible((v) => !v)}
                      title={passwordVisible ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#AAA9BA] hover:text-white"
                    >
                      {passwordVisible ? (
                        <EyeOff className="w-[19px] h-[19px]" />
                      ) : (
                        <Eye className="w-[19px] h-[19px]" />
                      )}
                    </button>
                  </div>
                )}

                {mode === 'register' && (
                  <div className="relative">
                    <Lock className="w-[19px] h-[19px] text-[#AAA9BA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={passwordVisible ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      aria-label="Confirm password"
                      className="w-full bg-[#1E1E2A] text-white text-[14px] pl-11 pr-4 py-[14px] rounded-[14px] border border-white/8 placeholder:text-[#AAA9BA] focus:outline-none focus:border-[#6957FF] focus:border-[1.4px]"
                    />
                  </div>
                )}
              </div>

              <div className="mt-[18px]">
                {mode === 'signIn' ? (
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => switchMode('resetPassword')}
                      className="text-[#AAA9BA] hover:text-white text-[12px] transition"
                    >
                      Forgot password?
                    </button>
                    <button
                      type="submit"
                      disabled={busy}
                      className="bg-[#6957FF] hover:brightness-110 text-white rounded-[13px] px-[18px] py-[14px] text-[13px] font-semibold inline-flex items-center gap-2.5 transition disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span className="w-[18px] h-[18px] rounded-full border-2 border-white border-t-transparent animate-spin" />
                      ) : (
                        <>
                          <span>{submitLabel}</span>
                          <ArrowRight className="w-[17px] h-[17px]" />
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full bg-[#6957FF] hover:brightness-110 text-white rounded-[13px] px-[18px] py-[14px] text-[13px] font-semibold inline-flex items-center justify-center gap-2.5 transition disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="w-[18px] h-[18px] rounded-full border-2 border-white border-t-transparent animate-spin" />
                    ) : (
                      <>
                        <span>{submitLabel}</span>
                        <ArrowRight className="w-[17px] h-[17px]" />
                      </>
                    )}
                  </button>
                )}
              </div>
            </form>

            <div className="mt-[18px] flex flex-col items-center gap-2">
              {mode === 'resetPassword' ? (
                <button
                  type="button"
                  onClick={() => switchMode('signIn')}
                  className="text-[#AAA9BA] hover:text-white text-[13px] transition"
                >
                  Back to sign in
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    switchMode(mode === 'signIn' ? 'register' : 'signIn')
                  }
                  className="text-[#AAA9BA] hover:text-white text-[13px] text-center transition"
                >
                  {mode === 'signIn'
                    ? 'New here? Create an account'
                    : 'Already have an account? Sign in'}
                </button>
              )}

              <p
                className="text-[11px] text-center"
                style={{ color: 'rgba(170, 169, 186, 0.75)' }}
              >
                Secure access for your home and family.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
