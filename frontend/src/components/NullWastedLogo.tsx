import React from "react";

interface NullWastedLogoProps {
  className?: string;
  showWordmark?: boolean;
}

/**
 * Original startup-style brand emblem for NullWasted:
 * Full-bleed standalone SVG emblem (no box background) featuring a warm amber
 * serving cloche with minimalist fork cutout, cradled by a vibrant emerald
 * zero-waste leaf and sprouting accent leaves.
 */
export const NullWastedLogo: React.FC<NullWastedLogoProps> = ({
  className = "w-10 h-10",
  showWordmark = false,
}) => {
  const icon = (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} shrink-0`}
      aria-hidden="true"
    >
      {/* Top cloche knob */}
      <circle cx="24" cy="11" r="3" fill="#F59E0B" />
      {/* Serving cloche dome */}
      <path
        d="M9 29C9 20.1634 15.7157 13 24 13C32.2843 13 39 20.1634 39 29H9Z"
        fill="#FBBF24"
      />
      {/* Subtle dome highlight */}
      <path
        d="M13.5 25.5C14.8 20.5 18.5 17 23.5 16.2"
        stroke="#FEF3C7"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      {/* Minimalist fork emblem inside dome */}
      <path
        d="M24 18.5V26M21 18.5V21.5C21 23 22.3 24 24 24C25.7 24 27 23 27 21.5V18.5"
        stroke="#FFFFFF"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Sweeping emerald zero-waste leaf cradling the base */}
      <path
        d="M5 31.5C11.5 32.2 19 32.2 26.5 31.8C33.5 31.4 39.2 29.2 43 24.5C41.2 33 34 39 24.2 39C15.2 39 8.2 36 5 31.5Z"
        fill="#059669"
      />
      <path
        d="M11 33.5C16.5 35.8 23.5 36.4 31 34.5"
        stroke="#34D399"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      {/* Two fresh sprouting leaves at top-right */}
      <path
        d="M34.5 13.5C34.5 13.5 35.2 7.5 41 6.5C41.5 11.8 37.8 13.8 34.5 13.5Z"
        fill="#10B981"
      />
      <path
        d="M37.5 16.8C37.5 16.8 41.8 13.8 45.2 16.5C43.2 19.8 39.5 19.2 37.5 16.8Z"
        fill="#34D399"
      />
    </svg>
  );

  if (!showWordmark) return icon;

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      {icon}
      <div
        className="text-[36px] tracking-[0.06em] leading-none uppercase"
        style={{ fontFamily: "'Bebas Neue', sans-serif" }}
      >
        <span className="text-[#222222]">NULL</span>
        <span className="text-emerald-600">WASTED</span>
      </div>
    </div>
  );
};
