import { Logo } from "@/components/Logo";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4 py-10">
      <div className="glass-strong w-full max-w-[420px] rounded-[32px] p-7 shadow-lg sm:p-9">
        <div className="mb-7">
          <Logo size={32} />
        </div>
        {children}
      </div>
    </div>
  );
}
