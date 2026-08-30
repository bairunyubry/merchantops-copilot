const stack = ['React + TypeScript + Vite', 'Tailwind CSS', 'ECharts', 'Papa Parse + Zod', 'Vitest']

export default function App() {
  return (
    <main className="shell">
      <section className="card">
        <p className="eyebrow">MerchantOps Copilot</p>
        <h1>商家经营罗盘</h1>
        <p className="promise">把经营数据转成有证据、可执行、可复盘的行动。</p>
        <div className="status">项目初始化完成</div>
        <ul>
          {stack.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="next">下一阶段：生成“青柚研究所”30 天离线数据与 CSV 模板。</p>
      </section>
    </main>
  )
}

