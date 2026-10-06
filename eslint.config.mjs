import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Lo que deja el CLI de Netlify al compilar: el paquete de la funcion del
    // servidor, con Next entero adentro. Son miles de archivos generados; sin
    // esta linea `npm run lint` tarda un minuto y devuelve mil errores que no
    // son de nadie.
    ".netlify/**",
  ]),
]);

export default eslintConfig;
