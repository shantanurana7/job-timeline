import type { Metadata } from 'next';
import './globals.css';
import ToastContainer from '@/components/ui/ToastContainer';

export const metadata: Metadata = {
  title: 'Job Timeline Platform',
  description: 'Enterprise job assigning and timeline management platform',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ToastContainer />
      </body>
    </html>
  );
}
