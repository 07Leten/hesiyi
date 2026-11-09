// 列出组件中使用、但样式表中没有出现的类名（开发辅助）
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../src')
const used = new Map()
const walk = (d) => {
  for (const f of fs.readdirSync(d)) {
    const q = path.join(d, f)
    if (fs.statSync(q).isDirectory()) walk(q)
    else if (f.endsWith('.tsx')) {
      const s = fs.readFileSync(q, 'utf8')
      for (const m of s.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\}|\{([^}]+)\})/g)) {
        const t = m[1] || m[2] || m[3] || ''
        for (const lit of t.match(/'[^']*'|"[^"]*"|`[^`]*`|^[^'"`]+$/g) || []) {
          for (const c of lit.match(/[a-z][a-z0-9-]*[a-z0-9]/g) || []) {
            if (!used.has(c)) used.set(c, path.relative(root, q))
          }
        }
      }
    }
  }
}
walk(root)
const css = fs
  .readdirSync(path.join(root, 'styles'))
  .map((f) => fs.readFileSync(path.join(root, 'styles', f), 'utf8'))
  .join('\n')
const missing = [...used].filter(([c]) => !new RegExp(`\\.${c}(?![a-z0-9-])`).test(css))
for (const [c, f] of missing) console.log(c.padEnd(26), f)
