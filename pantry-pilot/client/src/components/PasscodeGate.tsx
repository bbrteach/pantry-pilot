import { useState } from 'react';
import { Lock, UtensilsCrossed } from 'lucide-react';

interface PasscodeGateProps {
  onUnlock: (passcode: string) => Promise<void>;
}

export function PasscodeGate({ onUnlock }: PasscodeGateProps) {
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await onUnlock(passcode.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Incorrect passcode.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F6F1] text-[#1A241E] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E6E1D6] p-6 sm:p-7 shadow-[0_12px_36px_rgba(26,36,30,0.08)] space-y-5">
        <div className="flex flex-col items-center text-center">
          <span className="w-12 h-12 rounded-2xl bg-[#1B5E42] text-white flex items-center justify-center shadow-xs mb-3">
            <UtensilsCrossed className="w-6 h-6" />
          </span>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#1A241E]">
            PantryPilot
          </h1>
          <p className="text-sm text-[#5C6961] mt-1">
            Enter your household passcode to access the shared meal plan &amp; grocery list.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs font-semibold text-center">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="household-passcode-input" className="sr-only">
              Household Passcode
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#85918A] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="household-passcode-input"
                type="password"
                autoComplete="current-password"
                autoFocus
                required
                placeholder="Household passcode"
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-full h-12 pl-10 pr-4 rounded-2xl border border-[#D8D2C5] bg-[#FAF8F4] text-base text-[#1A241E] placeholder:text-[#8A948D] focus:bg-white focus:border-[#1B5E42] focus:ring-2 focus:ring-[#1B5E42]/15 focus:outline-none"
              />
            </div>
          </div>

          <button
            id="unlock-pantrypilot-btn"
            type="submit"
            disabled={submitting || !passcode.trim()}
            className="w-full h-12 rounded-2xl bg-[#1B5E42] text-white text-sm font-semibold hover:bg-[#144A33] disabled:opacity-50 transition-colors shadow-xs cursor-pointer"
          >
            {submitting ? 'Unlocking...' : 'Unlock PantryPilot'}
          </button>

          <p className="text-[11px] text-center text-[#85918A]">
            Stays unlocked on this device for 30 days.
          </p>
        </form>
      </div>
    </div>
  );
}
