// Executa o electron-vite sem ELECTRON_RUN_AS_NODE, que alguns terminais/IDEs
// definem e que faz o Electron rodar como Node puro (app.whenReady indefinido).
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

delete process.env.ELECTRON_RUN_AS_NODE

const bin = fileURLToPath(
  new URL('../node_modules/electron-vite/bin/electron-vite.js', import.meta.url)
)
const filho = spawn(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env
})
filho.on('exit', (codigo) => process.exit(codigo ?? 0))
