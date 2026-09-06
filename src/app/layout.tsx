import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '课间 · 校园通知助手', description: '把通知里的事，问清楚。面向同学的校园通知问答。', icons: { icon: '/icon.svg' }, robots: { index: false, follow: false } };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#f7f9f8' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
