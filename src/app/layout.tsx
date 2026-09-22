import type { Metadata } from 'next';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BagProvider } from '@/components/bag/bag-provider';
import './globals.css';

export const metadata: Metadata = {
  title: { default: "Papa's Tacos | Mexican Street Food", template: "%s | Papa's Tacos" },
  description: "Mexican soul. Street food spirit. Welcome to Papa's Tacos.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en-GB" className="dark"><body><TooltipProvider><BagProvider>{children}</BagProvider></TooltipProvider></body></html>;
}