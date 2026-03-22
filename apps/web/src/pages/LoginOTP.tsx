import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function LoginOTP() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [fullPhone, setFullPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [sentOtp, setSentOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const digitsOnly = (s: string) => s.replace(/[^\d]/g, '');

  // Avoid double-prepending the country code if user already typed it.
  // Example: cc=+91, phone=916281516349 → full=916281516349 (not 9191628...)
  const buildFullPhone = (cc: string, p: string) => {
    const ccDigits = digitsOnly(cc);
    const phoneDigits = digitsOnly(p);
    if (!ccDigits) return phoneDigits;
    if (!phoneDigits) return '';
    return phoneDigits.startsWith(ccDigits) ? phoneDigits : ccDigits + phoneDigits;
  };

  const handleSendOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const combined = buildFullPhone(countryCode, phone);
      setFullPhone(combined);
      const { data } = await authApi.sendOtp(combined);
      // API returns OTP when no SMS provider is configured (dev mode)
      if (data.otp) {
        setSentOtp(data.otp);
      }
      setStep('otp');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to send OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      // Clear any existing session so a failed OTP can't show the previous account.
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      useAuthStore.setState({ user: null, accessToken: null });

      const { data } = await authApi.verifyOtp({ phone: fullPhone, otp });

      if (!data?.accessToken || !data?.user) {
        throw new Error('OTP verification did not return a valid session');
      }

      // Keep behavior consistent with password login: store in localStorage
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken || '');
      // Keep socket refresh token in sync (useSocket refresh uses sessionStorage)
      sessionStorage.setItem('accessToken', data.accessToken);
      sessionStorage.setItem('refreshToken', data.refreshToken || '');
      useAuthStore.setState({ user: data.user, accessToken: data.accessToken });
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid OTP');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#128C7E] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
        <h1 className="text-3xl font-bold text-[#128C7E] text-center mb-2">MQ</h1>
        <p className="text-gray-500 text-center mb-8">
          {step === 'phone' ? 'Login with OTP' : 'Enter verification code'}
        </p>

        {step === 'phone' ? (
          <form onSubmit={handleSendOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Phone Number
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  placeholder="+91"
                  className="w-20 px-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:border-transparent text-center"
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9849394249"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:border-transparent"
                  required
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Enter country code and your phone number
              </p>
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || !phone.trim()}
              className="w-full py-3 bg-[#128C7E] text-white font-semibold rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {isLoading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Enter OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:border-transparent text-center text-2xl tracking-widest"
                required
                maxLength={6}
                pattern="\d{6}"
                autoFocus
              />
              <p className="text-xs text-gray-500 mt-1 text-center">
                OTP sent to +{fullPhone}
              </p>
            </div>
            {sentOtp && (
              <p className="text-center text-sm text-green-700 bg-green-50 rounded-lg p-2">
                Your OTP: <strong className="text-lg tracking-widest">{sentOtp}</strong>
              </p>
            )}
            {error && <p className="text-red-500 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={isLoading || otp.length !== 6}
              className="w-full py-3 bg-[#128C7E] text-white font-semibold rounded-lg hover:bg-[#075E54] disabled:opacity-50"
            >
              {isLoading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('phone');
                setOtp('');
                setSentOtp('');
                setError('');
              }}
              className="w-full py-3 border border-gray-300 text-gray-700 font-semibold rounded-lg hover:bg-gray-50"
            >
              Change Phone Number
            </button>
          </form>
        )}

        <div className="mt-6">
          <p className="text-center text-gray-600">
            <Link to="/login" className="text-[#128C7E] font-medium hover:underline">
              Login with Password
            </Link>
            {' · '}
            <Link to="/register" className="text-[#128C7E] font-medium hover:underline">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
