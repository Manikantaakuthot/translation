import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/client';
import { useAuthStore } from '../store/authStore';

export default function TwoFactorAuth() {
  const [step, setStep] = useState<'setup' | 'enable' | 'enabled'>('setup');
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { user } = useAuthStore();
  const navigate = useNavigate();

  useEffect(() => {
    // Check if 2FA is already enabled
    if (user?.totpEnabled) {
      setStep('enabled');
    }
  }, [user]);

  const handleSetup = async () => {
    setError('');
    setIsLoading(true);
    try {
      const { data } = await authApi.setup2fa();
      setQrCode(data.qrCode);
      setSecret(data.secret);
      setStep('enable');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to setup 2FA');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await authApi.enable2fa(totpCode);
      setStep('enabled');
      setTotpCode('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!window.confirm('Are you sure you want to disable 2FA?')) return;

    const code = window.prompt('Enter your current 2FA code to disable:');
    if (!code) return;

    setError('');
    setIsLoading(true);
    try {
      await authApi.disable2fa(code);
      setStep('setup');
      setQrCode('');
      setSecret('');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid code');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 w-full">
      <div className="p-4 border-b border-gray-200 flex items-center gap-3 bg-[#128C7E] md:bg-white">
        <button
          onClick={() => navigate('/settings')}
          className="p-2 -ml-2 rounded-full hover:bg-white/10 md:hover:bg-gray-100"
        >
          <span className="text-white md:text-gray-800 text-xl">←</span>
        </button>
        <h1 className="text-xl font-semibold text-white md:text-gray-900">Two-Factor Authentication</h1>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <div className="bg-white rounded-lg shadow p-6 max-w-2xl mx-auto">

          {step === 'setup' && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="font-semibold text-blue-900 mb-2">What is 2FA?</h2>
                <p className="text-blue-800 text-sm">
                  Two-factor authentication adds an extra layer of security to your account.
                  You'll need to enter a code from your authenticator app in addition to your password.
                </p>
              </div>

              <div className="space-y-2">
                <h3 className="font-semibold text-gray-900">Requirements:</h3>
                <ul className="list-disc list-inside text-gray-600 text-sm space-y-1">
                  <li>Install an authenticator app (Google Authenticator, Authy, etc.)</li>
                  <li>Have your phone ready to scan the QR code</li>
                </ul>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                onClick={handleSetup}
                disabled={isLoading}
                className="w-full py-3 bg-[#128C7E] text-white font-semibold rounded-lg hover:bg-[#075E54] disabled:opacity-50"
              >
                {isLoading ? 'Setting up...' : 'Set Up 2FA'}
              </button>
            </div>
          )}

          {step === 'enable' && (
            <div className="space-y-6">
              <div className="space-y-4">
                <h2 className="font-semibold text-gray-900">Step 1: Scan QR Code</h2>
                <div className="bg-white border-2 border-gray-200 rounded-lg p-6 flex flex-col items-center">
                  {qrCode ? (
                    <img src={qrCode} alt="2FA QR Code" className="w-64 h-64" />
                  ) : (
                    <div className="w-64 h-64 bg-gray-100 flex items-center justify-center">
                      <p className="text-gray-500">Loading QR code...</p>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 mt-4 text-center">
                    Scan this QR code with your authenticator app
                  </p>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600 mb-2">Or enter this code manually:</p>
                  <code className="block bg-white border border-gray-300 rounded px-3 py-2 text-center font-mono text-sm">
                    {secret}
                  </code>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="font-semibold text-gray-900">Step 2: Enter Verification Code</h2>
                <form onSubmit={handleEnable} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      6-Digit Code from Authenticator App
                    </label>
                    <input
                      type="text"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#128C7E] focus:border-transparent text-center text-2xl tracking-widest"
                      required
                      maxLength={6}
                      pattern="\d{6}"
                    />
                  </div>

                  {error && <p className="text-red-500 text-sm text-center">{error}</p>}

                  <button
                    type="submit"
                    disabled={isLoading || totpCode.length !== 6}
                    className="w-full py-3 bg-[#128C7E] text-white font-semibold rounded-lg hover:bg-[#075E54] disabled:opacity-50"
                  >
                    {isLoading ? 'Verifying...' : 'Enable 2FA'}
                  </button>
                </form>
              </div>
            </div>
          )}

          {step === 'enabled' && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start">
                <span className="text-2xl mr-3">✓</span>
                <div>
                  <h2 className="font-semibold text-green-900 mb-1">2FA is Enabled</h2>
                  <p className="text-green-800 text-sm">
                    Your account is now protected with two-factor authentication.
                    You'll need to enter a code from your authenticator app when you log in.
                  </p>
                </div>
              </div>

              {error && <p className="text-red-500 text-sm">{error}</p>}

              <button
                onClick={handleDisable}
                disabled={isLoading}
                className="w-full py-3 border border-red-500 text-red-500 font-semibold rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                {isLoading ? 'Disabling...' : 'Disable 2FA'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
