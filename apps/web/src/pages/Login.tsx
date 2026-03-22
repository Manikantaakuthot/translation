import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Phone, Lock, Eye, EyeOff, ArrowRight, MessageCircle, Shield, Zap, Smartphone } from 'lucide-react';

export default function Login() {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const { login, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Clear any existing session so a failed login cannot keep a previous account.
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('accessToken');
      sessionStorage.removeItem('refreshToken');
      useAuthStore.setState({ user: null, accessToken: null });

      await login(phone, password);
      navigate('/');
    } catch (err: any) {
      if (!err.response) {
        setError('Cannot connect to server. Make sure the API is running (npm run dev:api).');
      } else {
        const msg = err.response?.data?.message || err.response?.data?.error || 'Login failed';
        setError(msg === 'Invalid phone or password' ? 'Invalid phone or password. Have you registered?' : msg);
      }
    }
  };

  return (
    <div className="min-h-screen auth-bg flex font-outfit">
      {/* Floating orbs */}
      <div className="orb absolute w-96 h-96 bg-emerald-400/20 top-[-10%] left-[-5%] animate-float-slow" />
      <div className="orb absolute w-72 h-72 bg-teal-300/15 bottom-[10%] right-[5%] animate-float-mid" />
      <div className="orb absolute w-56 h-56 bg-cyan-400/10 top-[40%] left-[30%] animate-float-fast" />

      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] flex-col justify-center items-center p-16 relative z-10 animate-slide-in-left">
        <div className="max-w-sm">
          {/* Logo */}
          <div className="flex items-center gap-3 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-white/10 chat-bubble-deco flex items-center justify-center border border-white/20">
              <MessageCircle className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-3xl font-bold text-white tracking-tight">MSG</span>
          </div>

          {/* Headline */}
          <h1 className="text-5xl font-extrabold text-white leading-[1.1] mb-5 tracking-tight">
            Where every
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-100 to-cyan-200">
              message
            </span>
            <br />
            matters.
          </h1>
          <p className="text-white/60 text-lg leading-relaxed mb-12">
            Real-time messaging with AI-powered voice translation across 14+ languages.
          </p>

          {/* Feature pills */}
          <div className="space-y-3">
            {[
              { icon: Zap, text: 'AI voice translation', color: 'from-amber-400/20 to-orange-400/10' },
              { icon: Shield, text: 'End-to-end encrypted', color: 'from-emerald-400/20 to-teal-400/10' },
              { icon: Phone, text: 'HD voice & video calls', color: 'from-cyan-400/20 to-blue-400/10' },
            ].map((item) => (
              <div
                key={item.text}
                className={`flex items-center gap-4 bg-gradient-to-r ${item.color} chat-bubble-deco rounded-2xl px-5 py-4 border border-white/10 transition-all duration-300 hover:border-white/20 hover:translate-x-1`}
              >
                <item.icon className="w-5 h-5 text-white/80" />
                <span className="text-white/90 text-sm font-medium tracking-wide">{item.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 relative z-10">
        <div className="w-full max-w-[420px] animate-slide-in-right">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center justify-center gap-2 mb-8">
            <div className="w-10 h-10 rounded-xl bg-white/10 chat-bubble-deco flex items-center justify-center border border-white/20">
              <MessageCircle className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-white">MSG</span>
          </div>

          <div className="glass-card rounded-3xl shadow-2xl shadow-black/20 p-9">
            {/* Header */}
            <div className="mb-8 animate-fade-up">
              <h2 className="text-[28px] font-bold text-gray-900 tracking-tight">Welcome back</h2>
              <p className="text-gray-400 mt-1.5 text-[15px]">Sign in to your account</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Phone */}
              <div className="animate-fade-up-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Phone number
                </label>
                <div className="relative group">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'phone' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                    <Phone className="w-[18px] h-[18px]" />
                  </span>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    onFocus={() => setFocused('phone')}
                    onBlur={() => setFocused(null)}
                    placeholder="Enter phone number"
                    className="input-glow w-full pl-12 pr-4 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-300 text-[15px] font-medium focus:outline-none focus:border-[#128C7E] transition-all duration-200"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="animate-fade-up-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Password
                  </label>
                  <Link to="/forgot-password" className="text-xs font-semibold text-[#128C7E] hover:text-[#075E54] transition-colors">
                    Forgot?
                  </Link>
                </div>
                <div className="relative group">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'password' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                    <Lock className="w-[18px] h-[18px]" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder="Enter password"
                    className="input-glow w-full pl-12 pr-12 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-300 text-[15px] font-medium focus:outline-none focus:border-[#128C7E] transition-all duration-200"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-xl px-4 py-3 animate-fade-up">
                  <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-red-500 text-xs font-bold">!</span>
                  </div>
                  <p className="text-red-600 text-sm leading-relaxed">{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="animate-fade-up-3">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="btn-gradient w-full py-4 text-white font-semibold rounded-xl text-[15px] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 group"
                >
                  {isLoading ? (
                    <>
                      <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Signing in...
                    </>
                  ) : (
                    <>
                      Sign In
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </form>

            {/* Divider */}
            <div className="relative my-7 animate-fade-up-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-100" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-white px-4 text-xs text-gray-300 font-semibold uppercase tracking-widest">or</span>
              </div>
            </div>

            {/* OTP login */}
            <div className="animate-fade-up-5">
              <Link
                to="/login-otp"
                className="w-full flex items-center justify-center gap-2.5 py-3.5 border-2 border-gray-100 hover:border-[#128C7E]/30 text-gray-500 hover:text-[#128C7E] font-semibold rounded-xl transition-all duration-300 text-sm group"
              >
                <Smartphone className="w-4 h-4" />
                <span>Continue with OTP</span>
              </Link>
            </div>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-white/50 mt-7 animate-fade-up-5">
            Don't have an account?{' '}
            <Link to="/register" className="text-white font-semibold hover:text-emerald-200 transition-colors">
              Create one
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
