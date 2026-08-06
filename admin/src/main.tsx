// En premier, avant tout module qui touche au code importé de ../src :
// il y pose les globales que React Native fournit et que le navigateur ignore.
import './shim/globals';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
