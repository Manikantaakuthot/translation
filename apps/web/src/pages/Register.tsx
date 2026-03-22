import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { Phone, Lock, Eye, EyeOff, ArrowRight, MessageCircle, User, Flag, Globe, Users, Sparkles } from 'lucide-react';

export default function Register() {
  const [phone, setPhone] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [focused, setFocused] = useState<string | null>(null);
  const { register, isLoading } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await register(phone, countryCode, name, password);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Registration failed');
    }
  };

  const passwordStrength = (p: string) => {
    if (p.length === 0) return null;
    if (p.length < 4) return { label: 'Weak', pct: 25, color: '#ef4444' };
    if (p.length < 6) return { label: 'Fair', pct: 50, color: '#f59e0b' };
    if (p.length < 10) return { label: 'Good', pct: 75, color: '#128C7E' };
    return { label: 'Strong', pct: 100, color: '#22c55e' };
  };

  const strength = passwordStrength(password);

  return (
    <div className="min-h-screen auth-bg flex font-outfit">
      {/* Floating orbs */}
      <div className="orb absolute w-96 h-96 bg-cyan-400/15 bottom-[-10%] right-[-5%] animate-float-slow" />
      <div className="orb absolute w-72 h-72 bg-emerald-300/20 top-[10%] left-[5%] animate-float-mid" />
      <div className="orb absolute w-56 h-56 bg-teal-400/10 bottom-[30%] right-[30%] animate-float-fast" />

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
            Start your
            <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-200 via-teal-100 to-cyan-200">
              journey
            </span>
            <br />
            today.
          </h1>
          <p className="text-white/60 text-lg leading-relaxed mb-12">
            Join millions breaking language barriers with AI-powered messaging.
          </p>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Globe, value: '14+', label: 'Languages' },
              { icon: Users, value: '2M+', label: 'Users' },
              { icon: Sparkles, value: 'AI', label: 'Translation' },
              { icon: Phone, value: 'HD', label: 'Voice calls' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="bg-white/5 chat-bubble-deco border border-white/10 rounded-2xl p-4 text-center transition-all duration-300 hover:bg-white/10 hover:border-white/20"
              >
                <stat.icon className="w-5 h-5 text-white/40 mx-auto mb-2" />
                <div className="text-2xl font-bold text-white">{stat.value}</div>
                <div className="text-white/40 text-xs font-medium mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="w-full lg:w-[55%] flex items-center justify-center p-6 relative z-10 overflow-y-auto auth-scroll">
        <div className="w-full max-w-[420px] animate-slide-in-right py-6">
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
              <h2 className="text-[28px] font-bold text-gray-900 tracking-tight">Create account</h2>
              <p className="text-gray-400 mt-1.5 text-[15px]">Join MSG — it's free</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Name */}
              <div className="animate-fade-up-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Full name
                </label>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'name' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                    <User className="w-[18px] h-[18px]" />
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onFocus={() => setFocused('name')}
                    onBlur={() => setFocused(null)}
                    placeholder="Your name"
                    className="input-glow w-full pl-12 pr-4 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-300 text-[15px] font-medium focus:outline-none focus:border-[#128C7E] transition-all duration-200"
                    required
                  />
                </div>
              </div>

              {/* Phone row */}
              <div className="animate-fade-up-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Phone number
                </label>
                <div className="flex gap-2.5">
                  <div className="relative w-[90px] shrink-0">
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'code' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                      <Flag className="w-4 h-4" />
                    </span>
                    <input
                      type="text"
                      value={countryCode}
                      onChange={(e) => setCountryCode(e.target.value)}
                      onFocus={() => setFocused('code')}
                      onBlur={() => setFocused(null)}
                      placeholder="+91"
                      className="input-glow w-full pl-9 pr-2 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 text-[15px] font-semibold focus:outline-none focus:border-[#128C7E] transition-all duration-200 text-center"
                    />
                  </div>
                  <div className="relative flex-1">
                    <span className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'phone' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                      <Phone className="w-[18px] h-[18px]" />
                    </span>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      onFocus={() => setFocused('phone')}
                      onBlur={() => setFocused(null)}
                      placeholder="Phone number"
                      className="input-glow w-full pl-12 pr-4 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-300 text-[15px] font-medium focus:outline-none focus:border-[#128C7E] transition-all duration-200"
                      required
                    />
                  </div>
                </div>
              </div>

              {/* Password */}
              <div className="animate-fade-up-3">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <span className={`absolute left-4 top-1/2 -translate-y-1/2 transition-colors duration-200 ${focused === 'password' ? 'text-[#128C7E]' : 'text-gray-300'}`}>
                    <Lock className="w-[18px] h-[18px]" />
                  </span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onFocus={() => setFocused('password')}
                    onBlur={() => setFocused(null)}
                    placeholder="Min 6 characters"
                    className="input-glow w-full pl-12 pr-12 py-3.5 bg-gray-50/80 border-2 border-gray-100 rounded-xl text-gray-900 placeholder-gray-300 text-[15px] font-medium focus:outline-none focus:border-[#128C7E] transition-all duration-200"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>

                {/* Strength bar */}
                {strength && (
                  <div className="mt-2.5 space-y-1">
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${strength.pct}%`, backgroundColor: strength.color }}
                      />
                    </div>
                    <p className="text-xs text-gray-400">
                      <span className="font-semibold" style={{ color: strength.color }}>{strength.label}</span>
                    </p>
                  </div>
                )}
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
              <div className="animate-fade-up-4">
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
                      Creating account...
                    </>
                  ) : (
                    <>
                      Create Account
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Footer */}
          <p className="text-center text-sm text-white/50 mt-7 animate-fade-up-5">
            Already have an account?{' '}
            <Link to="/login" className="text-white font-semibold hover:text-emerald-200 transition-colors">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
