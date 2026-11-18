import React from 'react';
import { ArrowRight } from 'lucide-react';

interface WelcomeViewProps {
  onBegin: () => void;
}

export const WelcomeView: React.FC<WelcomeViewProps> = ({ onBegin }) => {
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#101114] text-white flex flex-col">
      <img
        src="/src/assets/images/welcome_living_room.jpg"
        alt="Modern smart home living room"
        className="absolute inset-0 w-full h-full object-cover object-center"
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(11,12,13,0.6) 0%, rgba(11,12,13,0.13) 30%, rgba(11,12,13,0.4) 58%, rgba(11,12,13,0.95) 100%)',
        }}
      />

      <div className="relative z-10 flex-1 max-w-[480px] w-full mx-auto px-6 pt-5 pb-6 flex flex-col">
        {/* Top brand marker */}
        <div className="flex items-center gap-2">
          <span className="w-[7px] h-[7px] rounded-full bg-[#F3A64A]" />
          <span className="text-[11px] font-bold tracking-[2px] text-white/70">
            AI HOME BRAIN
          </span>
        </div>

        {/* Bottom-aligned headline */}
        <div className="flex-1 flex items-end pb-[7vh]">
          <h1 className="text-[36px] sm:text-[40px] leading-[1.03] font-medium tracking-[-1.2px] text-white whitespace-pre-line">
            {'Live Better\nWith Smart\nSpaces'}
          </h1>
        </div>

        {/* Subtitle & Stadium Let's Begin button */}
        <div>
          <p className="text-[14px] text-white/70 tracking-[0.2px]">
            Control. Automate. Simplify.
          </p>
          <div className="h-5" />
          <button
            type="button"
            onClick={onBegin}
            className="w-full h-[56px] rounded-full bg-white text-[#171819] pl-5 pr-1.5 py-1.5 flex items-center hover:bg-neutral-100 active:scale-[0.99] transition"
          >
            <span className="flex-1 text-center font-bold text-[15px] pl-9">
              Let&apos;s Begin
            </span>
            <span className="w-[44px] h-[44px] rounded-full bg-[#171819] text-white flex items-center justify-center shrink-0">
              <ArrowRight className="w-5 h-5" />
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
