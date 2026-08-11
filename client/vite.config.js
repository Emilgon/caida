import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // El servidor permite por CORS http://localhost:5174 por defecto. Si Vite
    // se mueve solo a otro puerto, el socket queda rechazado y el error que se
    // ve no dice nada de puertos. `strictPort` hace que falle aquí y claro.
    port: 5174,
    strictPort: true,
  },
})
