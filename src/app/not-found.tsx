import Link from 'next/link';
export default function NotFound() { return <main className="center-state"><h1>这条通知暂时无法查看</h1><p>通知可能已撤下，或链接不正确。</p><Link className="primary" href="/notices">返回通知栏</Link></main>; }
