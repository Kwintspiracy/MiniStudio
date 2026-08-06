import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  define: {
    // promptGenerator.ts appelle `if (__DEV__) console.log(...)` à neuf
    // endroits. C'est une globale fournie par React Native et par Metro ;
    // le navigateur ne la connaît pas, et la branche OSL s'exécute même
    // toutes options éteintes — d'où un ReferenceError systématique dès que
    // l'aperçu assemble un prompt. Les tests dorés la posent de la même façon.
    __DEV__: 'false',
  },
  resolve: {
    alias: {
      // L'aperçu du prompt final doit passer par le MÊME code que la
      // production. On pointe donc sur src/ de l'application mobile plutôt que
      // d'en recopier la logique — une copie dériverait au premier changement.
      '@': resolve(HERE, '..', 'src'),
      // src/constants.ts tire expo-constants, absent du navigateur. Le
      // remplaçant expose la seule forme que ce fichier consulte.
      'expo-constants': resolve(HERE, 'src', 'shim', 'expo-constants.ts'),
    },
  },
  server: {
    port: 5180,
    fs: {
      // L'aperçu importe promptGenerator.ts depuis ../src ; sans cette
      // autorisation le serveur de développement le refuse en 403, alors même
      // que la compilation de production l'inclut sans difficulté.
      allow: [resolve(HERE), resolve(HERE, '..', 'src')],
    },
  },
});
