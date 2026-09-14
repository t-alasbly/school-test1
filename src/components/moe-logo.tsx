import { cn } from "@/lib/utils";

/** شعار وزارة التعليم — النقاط الرسمية مع الاسم. */
export function MoeLogo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("inline-flex flex-col items-center text-[#00857c]", className)}>
      <svg viewBox="0 0 220 70" className={compact ? "h-8 w-[6.5rem]" : "h-12 w-40"} aria-hidden>
        <g fill="#00857c">
          <circle cx="28" cy="18" r="7.2" />
          <circle cx="48" cy="14" r="6.2" />
          <circle cx="66" cy="18" r="5.2" />
          <circle cx="82" cy="26" r="4.2" />
          <circle cx="94" cy="36" r="3.4" />
          <circle cx="22" cy="34" r="5.6" />
          <circle cx="40" cy="30" r="4.8" />
          <circle cx="56" cy="32" r="4" />
          <circle cx="70" cy="38" r="3.2" />
          <circle cx="32" cy="48" r="4.4" />
          <circle cx="48" cy="46" r="3.6" />
          <circle cx="62" cy="50" r="2.8" />
          <circle cx="192" cy="18" r="7.2" />
          <circle cx="172" cy="14" r="6.2" />
          <circle cx="154" cy="18" r="5.2" />
          <circle cx="138" cy="26" r="4.2" />
          <circle cx="126" cy="36" r="3.4" />
          <circle cx="198" cy="34" r="5.6" />
          <circle cx="180" cy="30" r="4.8" />
          <circle cx="164" cy="32" r="4" />
          <circle cx="150" cy="38" r="3.2" />
          <circle cx="188" cy="48" r="4.4" />
          <circle cx="172" cy="46" r="3.6" />
          <circle cx="158" cy="50" r="2.8" />
          <circle cx="110" cy="58" r="2.4" />
        </g>
      </svg>
      {compact ? null : (
        <div className="text-center leading-tight">
          <p className="text-[13px] font-semibold tracking-wide">وزارة التعليم</p>
          <p className="text-[9px] font-medium text-[#6b7280]">Ministry of Education</p>
        </div>
      )}
    </div>
  );
}

export function SchoolEmblem({
  src,
  className,
}: {
  src?: string;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt="شعار المدرسة"
        className={cn("h-16 w-auto max-w-[7.5rem] object-contain", className)}
      />
    );
  }
  return <MoeLogo className={className} />;
}
