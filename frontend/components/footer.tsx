// frontend/components/footer.tsx
import Link from "next/link";
import { Github, Twitter, Cpu } from "lucide-react";

export function Footer() {
  return (
    <footer className="w-full border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 py-8">
      <div className="container mx-auto px-6 md:px-12 flex flex-col items-center justify-between gap-6 md:gap-8 md:flex-row">
        <div className="flex flex-col items-center gap-4 md:flex-row md:gap-3">
          <Cpu className="h-6 w-6 text-primary" />
          <p className="text-center text-sm leading-loose text-muted-foreground md:text-left">
            Built by{" "}
            <span className="font-medium underline underline-offset-4">LinkX Team</span>. 
            Powered by Solana Devnet.
          </p>
        </div>
        
        <div className="flex items-center gap-6 md:gap-6">
          <Link href="/market" className="text-sm font-medium hover:text-primary transition-colors">
            Marketplace
          </Link>
          <Link href="/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
            Agent Stats
          </Link>
          <div className="flex items-center gap-4 ml-2">
            <Link href="https://github.com/adarsh-dhar/link-x-buidl-sol" target="_blank" rel="noreferrer">
              <Github className="h-5 w-5 text-muted-foreground hover:text-foreground transition-colors" />
            </Link>
            <Twitter className="h-5 w-5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
          </div>
        </div>
      </div>
      <div className="mt-6 text-center text-[10px] text-muted-foreground uppercase tracking-widest">
        &copy; {new Date().getFullYear()} LINKX ALPHA CONSUMER (EXPERT MODE)
      </div>
    </footer>
  );
}
