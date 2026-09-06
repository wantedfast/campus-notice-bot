'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="center-state"><h1>页面暂时没有加载出来</h1><p>请稍后重试。</p><button className="primary" onClick={reset}>重新加载</button></main>; }
